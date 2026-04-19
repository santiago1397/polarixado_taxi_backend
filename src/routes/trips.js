import { Router } from "express";
import { nanoid } from "nanoid";
import { createTrip, getTrip, updateTrip } from "../services/tripRepo.js";
import { computeFare } from "../services/fare.js";
import { canTransition, STATES } from "../services/stateMachine.js";
import { sendConfirmation } from "../services/mailer.js";

const router = Router();

router.post("/", async (req, res) => {
  const body = req.body || {};
  const {
    customer, origin, destination, routeGeoJSON, distanceKm, etaMin,
    mode, scheduledAt, payment,
  } = body;

  if (!customer?.name || !customer?.email) return res.status(400).json({ error: "customer name/email required" });
  if (!origin?.lng || !destination?.lng) return res.status(400).json({ error: "origin/destination required" });
  if (typeof distanceKm !== "number") return res.status(400).json({ error: "distanceKm required" });
  if (!["ASAP", "SCHEDULED"].includes(mode)) return res.status(400).json({ error: "mode invalid" });
  if (mode === "SCHEDULED" && !scheduledAt) return res.status(400).json({ error: "scheduledAt required" });

  const fare = computeFare(distanceKm, {
    baseFare: process.env.BASE_FARE || 5,
    perKm: process.env.PER_KM || 2,
    currency: process.env.CURRENCY || "USD",
  });

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
    scheduledAt: mode === "SCHEDULED" ? scheduledAt : null,
    mode,
    customer,
    origin,
    destination,
    routeGeoJSON: routeGeoJSON || null,
    distanceKm,
    etaMin: etaMin || 0,
    fare,
    payment: { method, timing, status: paymentStatus },
    state,
    stateHistory: [{ state, at: new Date().toISOString() }],
    reminderSentAt: null,
  };

  await createTrip(trip);
  if (state === STATES.CONFIRMED) {
    sendConfirmation(trip).catch((e) => console.error("[mail]", e));
  }
  res.json(trip);
});

router.get("/:id", async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  if (trip.payment?.receiptBase64) {
    const { receiptBase64, ...safePayment } = trip.payment;
    return res.json({ ...trip, payment: { ...safePayment, hasReceipt: true } });
  }
  res.json(trip);
});

router.post("/:id/receipt", async (req, res) => {
  const { receiptBase64 } = req.body || {};
  if (!receiptBase64) return res.status(400).json({ error: "receiptBase64 required" });
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  if (trip.payment.method !== "zelle") return res.status(400).json({ error: "not a zelle trip" });
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
  if (to === STATES.CONFIRMED) sendConfirmation(updated).catch((e) => console.error("[mail]", e));
  res.json(updated);
});

export default router;
