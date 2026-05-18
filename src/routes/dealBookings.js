import { Router } from "express";
import { nanoid } from "nanoid";
import { getDeal } from "../services/dealRepo.js";
import { createTrip, updateTrip } from "../services/tripRepo.js";
import { getDefaultDriver } from "../services/driverRepo.js";
import { computeFare } from "../services/fare.js";
import { STATES } from "../services/stateMachine.js";
import { sendConfirmation } from "../services/mailer.js";

const router = Router();

router.post("/:id/book", async (req, res) => {
  const deal = await getDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: "deal not found" });
  if (!deal.active) return res.status(400).json({ error: "deal no longer active" });

  const { customer, origin, distanceKmOutbound, etaMinOutbound, distanceKmReturn, etaMinReturn, departureAt: userDepartAt, returnAt: userReturnAt } = req.body || {};
  if (!customer?.name || !customer?.email) return res.status(400).json({ error: "customer name/email required" });
  if (!origin?.address || !origin?.lat || !origin?.lng) return res.status(400).json({ error: "origin required" });
  if (typeof distanceKmOutbound !== "number" || typeof distanceKmReturn !== "number") {
    return res.status(400).json({ error: "distanceKmOutbound and distanceKmReturn required" });
  }

  const departAt = userDepartAt ? new Date(userDepartAt) : deal.departureAt;
  const returnAt = userReturnAt ? new Date(userReturnAt) : deal.returnAt;

  const fareConfig = {
    baseFare: Number(process.env.BASE_FARE || 5),
    perKm: Number(process.env.PER_KM || 2),
    baseFareXl: Number(process.env.BASE_FARE_XL || 8),
    perKmXl: Number(process.env.PER_KM_XL || 3),
    currency: deal.currency || "USD",
  };

  const outboundFare = computeFare(distanceKmOutbound, fareConfig, deal.vehicleType);
  const returnFare = computeFare(distanceKmReturn, fareConfig, deal.vehicleType);

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
    id: nanoid(10).toUpperCase(),
    groupId,
    createdAt: new Date().toISOString(),
    scheduledAt: departAt.toISOString(),
    originAddress: origin.address,
    originLat: origin.lat,
    originLng: origin.lng,
    destAddress: deal.destination,
    destLat: deal.destLat,
    destLng: deal.destLng,
    distanceKm: distanceKmOutbound,
    etaMin: etaMinOutbound || 0,
    ...outboundFare,
    ...tripDefaults,
  };

  const returnTrip = {
    id: nanoid(10).toUpperCase(),
    groupId,
    createdAt: new Date().toISOString(),
    scheduledAt: returnAt.toISOString(),
    originAddress: deal.destination,
    originLat: deal.destLat,
    originLng: deal.destLng,
    destAddress: origin.address,
    destLat: origin.lat,
    destLng: origin.lng,
    distanceKm: distanceKmReturn,
    etaMin: etaMinReturn || 0,
    ...returnFare,
    ...tripDefaults,
  };

  await createTrip(outboundTrip);
  await createTrip(returnTrip);

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