import { Router } from "express";
import { nanoid } from "nanoid";
import { getDeal } from "../services/dealRepo.js";
import { updateTrip, createTripWithConsent } from "../services/tripRepo.js";
import { getDefaultDriver } from "../services/driverRepo.js";
import { computeFare } from "../services/fare.js";
import { STATES } from "../services/stateMachine.js";
import { sendConfirmation } from "../services/mailer.js";
import { parseConsent } from "../services/consent.js";
import { getConfig } from "../services/configRepo.js";

const router = Router();

router.post("/:id/book", async (req, res) => {
  const deal = await getDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: "deal not found" });
  if (!deal.active) return res.status(400).json({ error: "deal no longer active" });

  const { customer, origin, distanceMilesOutbound, etaMinOutbound, distanceMilesReturn, etaMinReturn, departureAt: userDepartAt, returnAt: userReturnAt } = req.body || {};
  if (!customer?.name || !customer?.phone) return res.status(400).json({ error: "customer name/phone required" });
  if (!origin?.address || !origin?.lat || !origin?.lng) return res.status(400).json({ error: "origin required" });
  if (typeof distanceMilesOutbound !== "number" || typeof distanceMilesReturn !== "number") {
    return res.status(400).json({ error: "distanceMilesOutbound and distanceMilesReturn required" });
  }

  const consentParsed = parseConsent(req.body.consent, req);
  if (consentParsed.error) return res.status(400).json({ error: consentParsed.error });
  const consent = consentParsed.value;

  const departAt = userDepartAt ? new Date(userDepartAt) : deal.departureAt;
  const returnAt = userReturnAt ? new Date(userReturnAt) : deal.returnAt;

  const cfg = await getConfig();
  if (!cfg.vehicleTiers?.[deal.vehicleType]) {
    return res.status(400).json({ error: `unknown vehicleType ${deal.vehicleType}` });
  }
  const currency = deal.currency || cfg.currency || "USD";
  const fareOpts = {
    vehicleTiers: cfg.vehicleTiers,
    vehicleType: deal.vehicleType,
    zones: cfg.zones,
    namedPlaces: cfg.namedPlaces,
    timeOfDaySurcharge: cfg.timeOfDaySurcharge,
    isDeal: true,
    currency,
  };
  const outboundOrigin = { address: origin.address, lat: origin.lat, lng: origin.lng };
  const outboundDest = { address: deal.destination, lat: deal.destLat, lng: deal.destLng };
  const outboundFare = computeFare({
    ...fareOpts,
    distanceMiles: distanceMilesOutbound,
    etaMin: etaMinOutbound || 0,
    origin: outboundOrigin,
    destination: outboundDest,
    mode: "SCHEDULED",
    scheduledAt: departAt.toISOString(),
  });
  const returnFare = computeFare({
    ...fareOpts,
    distanceMiles: distanceMilesReturn,
    etaMin: etaMinReturn || 0,
    origin: outboundDest,
    destination: outboundOrigin,
    mode: "SCHEDULED",
    scheduledAt: returnAt.toISOString(),
  });

  const payment = req.body.payment || { method: "cash", timing: "later" };
  let paymentStatus = "pending";
  let state = STATES.PENDING_PAYMENT;
  if (payment.timing === "later") {
    state = STATES.CONFIRMED;
    paymentStatus = "pending";
  } else if (payment.method === "zelle") {
    paymentStatus = "pending_verification";
    state = STATES.PENDING_PAYMENT;
  }

  const groupId = nanoid(10).toUpperCase();

  const tripDefaults = {
    customer,
    vehicleType: deal.vehicleType,
    mode: "SCHEDULED",
    payment: { method: payment.method, timing: payment.timing, status: paymentStatus },
    state,
    stateHistory: [{ state, at: new Date().toISOString() }],
    driverConfirmToken: nanoid(24),
    driverConfirmedAt: null,
    notifiedAt: null,
    reminderSentAt: null,
  };

  const outboundTrip = {
    ...tripDefaults,
    id: nanoid(10).toUpperCase(),
    groupId,
    createdAt: new Date().toISOString(),
    scheduledAt: departAt.toISOString(),
    origin: { address: origin.address, lat: origin.lat, lng: origin.lng },
    destination: { address: deal.destination, lat: deal.destLat, lng: deal.destLng },
    routeGeoJSON: null,
    distanceMiles: distanceMilesOutbound,
    etaMin: etaMinOutbound || 0,
    fare: outboundFare,
  };

  const returnTrip = {
    ...tripDefaults,
    id: nanoid(10).toUpperCase(),
    groupId,
    createdAt: new Date().toISOString(),
    scheduledAt: returnAt.toISOString(),
    origin: { address: deal.destination, lat: deal.destLat, lng: deal.destLng },
    destination: { address: origin.address, lat: origin.lat, lng: origin.lng },
    routeGeoJSON: null,
    distanceMiles: distanceMilesReturn,
    etaMin: etaMinReturn || 0,
    fare: returnFare,
  };

  await createTripWithConsent(outboundTrip, consent);
  await createTripWithConsent(returnTrip, consent);

  // Auto-assign the default driver to both trips
  const defaultDriver = await getDefaultDriver();
  if (defaultDriver) {
    await updateTrip(outboundTrip.id, (t) => ({ ...t, driverId: defaultDriver.id }));
    await updateTrip(returnTrip.id, (t) => ({ ...t, driverId: defaultDriver.id }));
  }

  // Notify for confirmed outbound trip
  if (state === STATES.CONFIRMED) {
    const stamped = { ...outboundTrip, notifiedAt: new Date().toISOString() };
    sendConfirmation(stamped).catch((e) => console.error("[mail]", e));
  }

  res.json({ outboundTripId: outboundTrip.id, returnTripId: returnTrip.id, groupId, deal });
});

export default router;