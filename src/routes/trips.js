import { Router } from "express";
import { nanoid } from "nanoid";
import { createTrip, getTrip, updateTrip, createTripWithConsent } from "../services/tripRepo.js";
import { getDefaultDriver } from "../services/driverRepo.js";
import { computeFare } from "../services/fare.js";
import { canTransition, STATES } from "../services/stateMachine.js";
import { sendConfirmation } from "../services/mailer.js";
import { parseConsent } from "../services/consent.js";
import { getConfig } from "../services/configRepo.js";

const router = Router();

router.post("/", async (req, res) => {
  const body = req.body || {};
  const {
    customer, origin, destination, routeGeoJSON, distanceMiles, etaMin,
    mode, scheduledAt, payment, receiptBase64,
  } = body;

  if (!customer?.name || !customer?.phone) return res.status(400).json({ error: "customer name/phone required" });
  if (!origin?.lng || !destination?.lng) return res.status(400).json({ error: "origin/destination required" });
  if (typeof distanceMiles !== "number") return res.status(400).json({ error: "distanceMiles required" });
  if (!["ASAP", "SCHEDULED"].includes(mode)) return res.status(400).json({ error: "mode invalid" });
  if (mode === "SCHEDULED" && !scheduledAt) return res.status(400).json({ error: "scheduledAt required" });

  const consentParsed = parseConsent(body.consent, req);
  if (consentParsed.error) return res.status(400).json({ error: consentParsed.error });
  const consent = consentParsed.value;

  const cfg = await getConfig();
  const vehicleType = (body.vehicleType || "UBER_X").toUpperCase();
  if (!cfg.vehicleTiers?.[vehicleType]) return res.status(400).json({ error: `unknown vehicleType ${vehicleType}` });
  const fare = computeFare(distanceMiles, etaMin || 0, cfg.vehicleTiers, vehicleType, cfg.currency);

  const method = payment?.method || "cash";
  const timing = payment?.timing || "later";

  let paymentStatus = "pending";
  let state = STATES.PENDING_PAYMENT;
  if (timing === "later") {
    state = STATES.CONFIRMED;
    paymentStatus = "pending";
  } else if (method === "zelle") {
    paymentStatus = "pending_verification";
    state = STATES.PENDING_PAYMENT;
  } else if (method === "stripe") {
    paymentStatus = "pending";
    state = STATES.PENDING_PAYMENT;
  }

  const trip = {
    id: nanoid(10).toUpperCase(),
    createdAt: new Date().toISOString(),
    vehicleType,
    scheduledAt: mode === "SCHEDULED" ? scheduledAt : null,
    mode,
    customer,
    origin,
    destination,
    routeGeoJSON: routeGeoJSON || null,
    distanceMiles,
    etaMin: etaMin || 0,
    fare,
    payment: { method, timing, status: paymentStatus, ...(receiptBase64 ? { receiptBase64 } : {}) },
    state,
    stateHistory: [{ state, at: new Date().toISOString() }],
    reminderSentAt: null,
    driverConfirmToken: nanoid(24),
    driverConfirmedAt: null,
    notifiedAt: null,
  };

  await createTripWithConsent(trip, consent);

  // Auto-assign the default driver
  const defaultDriver = await getDefaultDriver();
  if (defaultDriver) {
    await updateTrip(trip.id, (t) => ({ ...t, driverId: defaultDriver.id }));
    trip.driverId = defaultDriver.id;
  }

  // Send ticket emails
  // the driver gets the confirm link the moment the booking is placed), or for
  // ASAP trips that are already CONFIRMED. notifiedAt guards against doubles.
  const shouldNotify = trip.mode === "SCHEDULED" || state === STATES.CONFIRMED;
  if (shouldNotify) {
    await updateTrip(trip.id, (t) => ({ ...t, notifiedAt: new Date().toISOString() }));
    trip.notifiedAt = new Date().toISOString();
    sendConfirmation(trip).catch((e) => console.error("[mail]", e));
  }
  res.json(trip);
});

router.get("/:id/driver-confirm", async (req, res) => {
  const result = await applyDriverConfirm(req.params.id, req.query.token);
  const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
  if (result.error) {
    return res.redirect(`${frontend}/driver/confirm/${req.params.id}?error=${encodeURIComponent(result.error)}`);
  }
  return res.redirect(`${frontend}/driver/confirm/${req.params.id}?${result.already ? "already=1" : "ok=1"}`);
});

router.post("/:id/driver-confirm", async (req, res) => {
  const token = req.query.token || (req.body && req.body.token);
  const result = await applyDriverConfirm(req.params.id, token);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json({ ok: true, tripId: req.params.id, confirmedAt: result.confirmedAt, already: !!result.already });
});

async function applyDriverConfirm(tripId, token) {
  const trip = await getTrip(tripId);
  if (!trip) return { error: "not found", status: 404 };
  if (!trip.driverConfirmToken || !token) return { error: "invalid token", status: 400 };
  if (!constantTimeEqual(String(token), String(trip.driverConfirmToken))) {
    return { error: "invalid token", status: 400 };
  }
  if (trip.driverConfirmedAt) {
    return { already: true, confirmedAt: trip.driverConfirmedAt };
  }
  const now = new Date().toISOString();
  await updateTrip(trip.id, (t) => ({
    ...t,
    driverConfirmedAt: now,
    stateHistory: [...(t.stateHistory || []), { state: t.state, at: now, note: "driver_confirmed" }],
  }));
  return { confirmedAt: now };
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

router.get("/:id", async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  const { driverConfirmToken, ...safeTrip } = trip;
  if (safeTrip.payment?.receiptBase64) {
    const { receiptBase64, ...safePayment } = safeTrip.payment;
    return res.json({ ...safeTrip, payment: { ...safePayment, hasReceipt: true } });
  }
  res.json(safeTrip);
});

router.post("/:id/receipt", async (req, res) => {
  const { receiptBase64 } = req.body || {};
  if (!receiptBase64) return res.status(400).json({ error: "receiptBase64 required" });
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  const method = String(trip.payment.method || "").toLowerCase();
  if (method !== "zelle" && method !== "zelle_later") return res.status(400).json({ error: "not a zelle trip" });
  const updated = await updateTrip(trip.id, (t) => ({
    ...t,
    payment: { ...t.payment, receiptBase64, status: "pending_verification" },
  }));
  res.json({ ok: true, id: updated.id });
});

router.patch("/:id/state", async (req, res) => {
  const { to } = req.body || {};
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  if (!canTransition(trip.state, to)) {
    return res.status(400).json({ error: `cannot transition ${trip.state} -> ${to}` });
  }
  const updated = await updateTrip(trip.id, (t) => ({
    ...t,
    state: to,
    stateHistory: [...t.stateHistory, { state: to, at: new Date().toISOString() }],
  }));
  if (to === STATES.CONFIRMED && !updated.notifiedAt) {
    const stamped = await updateTrip(updated.id, (t) => ({ ...t, notifiedAt: new Date().toISOString() }));
    sendConfirmation(stamped).catch((e) => console.error("[mail]", e));
  }
  res.json(updated);
});

export default router;
