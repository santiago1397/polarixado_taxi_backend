import { Router } from "express";
import { verifyAdmin, requireRole } from "../middleware/adminAuth.js";
import { listTrips, getTrip, updateTrip } from "../services/tripRepo.js";
import { list, create, update, remove } from "../services/adminRepo.js";
import { canTransition, STATES } from "../services/stateMachine.js";
import { sendConfirmation } from "../services/mailer.js";
import { getConfig, updateConfig } from "../services/configRepo.js";
import { TIER_ORDER } from "../config/defaultTiers.js";

const router = Router();

router.use(verifyAdmin);

// Admin frontend reads trip fields as flat scalars; repo returns nested domain objects.
function toAdminShape(t) {
  return {
    id: t.id,
    groupId: t.groupId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    vehicleType: t.vehicleType,
    scheduledAt: t.scheduledAt,
    mode: t.mode,
    customerName: t.customer?.name,
    customerEmail: t.customer?.email,
    customerPhone: t.customer?.phone,
    originAddress: t.origin?.address,
    originLat: t.origin?.lat,
    originLng: t.origin?.lng,
    destAddress: t.destination?.address,
    destLat: t.destination?.lat,
    destLng: t.destination?.lng,
    routeGeoJSON: t.routeGeoJSON,
    distanceMiles: t.distanceMiles,
    etaMin: t.etaMin,
    fareBase: t.fare?.base,
    farePerMile: t.fare?.perMileTotal,
    fareTime: t.fare?.perMinuteTotal,
    fareTotal: t.fare?.total,
    fareCurrency: t.fare?.currency,
    paymentMethod: t.payment?.method,
    paymentTiming: t.payment?.timing,
    paymentStatus: t.payment?.status,
    receiptBase64: t.payment?.receiptBase64 ?? null,
    payment: { hasReceipt: !!t.payment?.receiptBase64 },
    state: t.state,
    stateHistory: t.stateHistory,
    reminderSentAt: t.reminderSentAt,
    driverConfirmToken: t.driverConfirmToken,
    driverConfirmedAt: t.driverConfirmedAt,
    notifiedAt: t.notifiedAt,
    driverId: t.driverId,
    driver: t.driver,
  };
}

router.get("/trips", async (_req, res) => {
  const trips = await listTrips();
  const sorted = [...trips].sort((a, b) => {
    const ak = a.scheduledAt || a.createdAt;
    const bk = b.scheduledAt || b.createdAt;
    return new Date(bk) - new Date(ak);
  });
  res.json(sorted.map(toAdminShape));
});

router.get("/trips/:id/receipt", async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip?.payment?.receiptBase64) return res.status(404).json({ error: "no receipt" });
  res.json({ receiptBase64: trip.payment.receiptBase64 });
});

router.post("/trips/:id/verify-zelle", async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  const method = String(trip.payment.method || "").toLowerCase();
  if (method !== "zelle" && method !== "zelle_later") return res.status(400).json({ error: "not zelle" });
  const updated = await updateTrip(trip.id, (t) => ({
    ...t,
    payment: { ...t.payment, status: "paid" },
    state: STATES.CONFIRMED,
    stateHistory: [...t.stateHistory, { state: STATES.CONFIRMED, at: new Date().toISOString() }],
  }));
  sendConfirmation(updated).catch((e) => console.error("[mail]", e));
  res.json(updated);
});

router.post("/trips/:id/state", async (req, res) => {
  const { to, markPaid } = req.body || {};
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  if (!canTransition(trip.state, to)) {
    return res.status(400).json({ error: `cannot ${trip.state} -> ${to}` });
  }
  const updated = await updateTrip(trip.id, (t) => ({
    ...t,
    state: to,
    payment: markPaid ? { ...t.payment, status: "paid" } : t.payment,
    stateHistory: [...t.stateHistory, { state: to, at: new Date().toISOString() }],
  }));
  if (to === STATES.CONFIRMED) sendConfirmation(updated).catch((e) => console.error("[mail]", e));
  res.json(updated);
});

router.patch("/trips/:id/driver", async (req, res) => {
  const { driverId } = req.body || {};
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  if (driverId !== null) {
    const { getDriver } = await import("../services/driverRepo.js");
    const driver = await getDriver(driverId);
    if (!driver) return res.status(400).json({ error: "driver not found" });
  }
  const updated = await updateTrip(trip.id, (t) => ({ ...t, driverId: driverId || null }));
  res.json(updated);
});

router.get("/config", async (_req, res) => {
  const cfg = await getConfig();
  res.json({
    vehicleTiers: cfg.vehicleTiers,
    currency: cfg.currency,
    zelleHandle: cfg.zelleHandle,
    zelleName: cfg.zelleName,
    namedPlaces: cfg.namedPlaces || [],
    zones: cfg.zones || [],
    timeOfDaySurcharge: cfg.timeOfDaySurcharge || [],
    updatedAt: cfg.updatedAt,
  });
});

function validateBands(key, bands) {
  if (!Array.isArray(bands) || bands.length === 0) {
    return `tier ${key}.bands must be a non-empty array`;
  }
  let prevMax = -1;
  let hasOpen = false;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (!b || typeof b !== "object") return `tier ${key}.bands[${i}] must be an object`;
    if (typeof b.base !== "number" || b.base < 0) return `tier ${key}.bands[${i}].base must be a non-negative number`;
    if (typeof b.perMile !== "number" || b.perMile < 0) return `tier ${key}.bands[${i}].perMile must be a non-negative number`;
    const isLast = i === bands.length - 1;
    if (isLast) {
      if (b.maxMiles !== null) return `tier ${key}.bands[last].maxMiles must be null`;
      hasOpen = true;
    } else {
      if (typeof b.maxMiles !== "number" || b.maxMiles <= prevMax) {
        return `tier ${key}.bands[${i}].maxMiles must be > ${prevMax}`;
      }
      prevMax = b.maxMiles;
    }
  }
  if (!hasOpen) return `tier ${key}.bands must end with a maxMiles:null band`;
  return null;
}

function validateNamedPlace(place, i) {
  if (!place || typeof place !== "object") return `namedPlaces[${i}] must be an object`;
  if (typeof place.id !== "string" || !place.id.trim()) return `namedPlaces[${i}].id required`;
  if (typeof place.label !== "string" || !place.label.trim()) return `namedPlaces[${i}].label required`;
  if (!place.center || typeof place.center.lat !== "number" || typeof place.center.lng !== "number") {
    return `namedPlaces[${i}].center.{lat,lng} must be numbers`;
  }
  if (typeof place.radiusKm !== "number" || place.radiusKm <= 0) {
    return `namedPlaces[${i}].radiusKm must be a positive number`;
  }
  if (!Array.isArray(place.matchAddresses)) return `namedPlaces[${i}].matchAddresses must be an array`;
  for (let j = 0; j < place.matchAddresses.length; j++) {
    if (typeof place.matchAddresses[j] !== "string") return `namedPlaces[${i}].matchAddresses[${j}] must be a string`;
  }
  if (!Array.isArray(place.surchargeBands) || place.surchargeBands.length === 0) {
    return `namedPlaces[${i}].surchargeBands must be a non-empty array`;
  }
  for (let j = 0; j < place.surchargeBands.length; j++) {
    const sb = place.surchargeBands[j];
    if (typeof sb.amount !== "number" || sb.amount < 0) return `namedPlaces[${i}].surchargeBands[${j}].amount must be a non-negative number`;
    if (sb.minMiles !== undefined && (typeof sb.minMiles !== "number" || sb.minMiles < 0)) return `namedPlaces[${i}].surchargeBands[${j}].minMiles must be a non-negative number`;
    if (sb.maxMiles !== undefined && sb.maxMiles !== null && (typeof sb.maxMiles !== "number" || sb.maxMiles < 0)) return `namedPlaces[${i}].surchargeBands[${j}].maxMiles must be a non-negative number or null`;
  }
  return null;
}

function validateZone(zone, i) {
  if (!zone || typeof zone !== "object") return `zones[${i}] must be an object`;
  if (typeof zone.id !== "string" || !zone.id.trim()) return `zones[${i}].id required`;
  if (typeof zone.label !== "string" || !zone.label.trim()) return `zones[${i}].label required`;
  if (typeof zone.originState !== "string" || zone.originState.length !== 2) return `zones[${i}].originState must be a 2-letter state code`;
  if (typeof zone.destinationState !== "string" || (zone.destinationState !== "*" && zone.destinationState.length !== 2)) {
    return `zones[${i}].destinationState must be a 2-letter state code or "*"`;
  }
  if (zone.bandOverrides && typeof zone.bandOverrides !== "object") return `zones[${i}].bandOverrides must be an object`;
  return null;
}

function validateTimeOfDayWindow(w, i) {
  if (!w || typeof w !== "object") return `timeOfDaySurcharge[${i}] must be an object`;
  if (typeof w.id !== "string" || !w.id.trim()) return `timeOfDaySurcharge[${i}].id required`;
  if (typeof w.label !== "string" || !w.label.trim()) return `timeOfDaySurcharge[${i}].label required`;
  if (typeof w.startHour !== "number" || w.startHour < 0 || w.startHour > 23) return `timeOfDaySurcharge[${i}].startHour must be 0–23`;
  if (typeof w.endHour !== "number" || w.endHour < 0 || w.endHour > 24 || w.endHour <= w.startHour) return `timeOfDaySurcharge[${i}].endHour must be > startHour and ≤ 24`;
  if (typeof w.amount !== "number" || w.amount < 0) return `timeOfDaySurcharge[${i}].amount must be a non-negative number`;
  return null;
}

router.put("/config", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { vehicleTiers, currency, zelleHandle, zelleName, namedPlaces, zones, timeOfDaySurcharge } = req.body || {};

  if (vehicleTiers !== undefined) {
    if (typeof vehicleTiers !== "object" || vehicleTiers === null) {
      return res.status(400).json({ error: "vehicleTiers must be an object" });
    }
    for (const key of TIER_ORDER) {
      const t = vehicleTiers[key];
      if (!t) return res.status(400).json({ error: `missing tier ${key}` });
      if (!["large_bag", "carry_on"].includes(t.bagType)) {
        return res.status(400).json({ error: `tier ${key}.bagType must be large_bag or carry_on` });
      }
      if (typeof t.label !== "string" || !t.label.trim()) {
        return res.status(400).json({ error: `tier ${key}.label required` });
      }
      const nums = ["seats", "bags"];
      for (const f of nums) {
        if (typeof t[f] !== "number" || t[f] < 0) {
          return res.status(400).json({ error: `tier ${key}.${f} must be a non-negative number` });
        }
      }
      const err = validateBands(key, t.bands);
      if (err) return res.status(400).json({ error: err });
    }
  }

  if (namedPlaces !== undefined) {
    if (!Array.isArray(namedPlaces)) return res.status(400).json({ error: "namedPlaces must be an array" });
    for (let i = 0; i < namedPlaces.length; i++) {
      const err = validateNamedPlace(namedPlaces[i], i);
      if (err) return res.status(400).json({ error: err });
    }
  }

  if (zones !== undefined) {
    if (!Array.isArray(zones)) return res.status(400).json({ error: "zones must be an array" });
    for (let i = 0; i < zones.length; i++) {
      const err = validateZone(zones[i], i);
      if (err) return res.status(400).json({ error: err });
    }
  }

  if (timeOfDaySurcharge !== undefined) {
    if (!Array.isArray(timeOfDaySurcharge)) return res.status(400).json({ error: "timeOfDaySurcharge must be an array" });
    for (let i = 0; i < timeOfDaySurcharge.length; i++) {
      const err = validateTimeOfDayWindow(timeOfDaySurcharge[i], i);
      if (err) return res.status(400).json({ error: err });
    }
  }

  const patch = {};
  if (vehicleTiers !== undefined) patch.vehicleTiers = vehicleTiers;
  if (currency !== undefined) patch.currency = currency;
  if (zelleHandle !== undefined) patch.zelleHandle = zelleHandle;
  if (zelleName !== undefined) patch.zelleName = zelleName;
  if (namedPlaces !== undefined) patch.namedPlaces = namedPlaces;
  if (zones !== undefined) patch.zones = zones;
  if (timeOfDaySurcharge !== undefined) patch.timeOfDaySurcharge = timeOfDaySurcharge;

  const updated = await updateConfig(patch);
  res.json({
    vehicleTiers: updated.vehicleTiers,
    currency: updated.currency,
    zelleHandle: updated.zelleHandle,
    zelleName: updated.zelleName,
    namedPlaces: updated.namedPlaces || [],
    zones: updated.zones || [],
    timeOfDaySurcharge: updated.timeOfDaySurcharge || [],
    updatedAt: updated.updatedAt,
  });
});

router.get("/admins", requireRole("SUPER_ADMIN"), async (_req, res) => {
  res.json(await list());
});

router.post("/admins", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { email, password, name, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (!["ADMIN", "SUPER_ADMIN"].includes(role)) return res.status(400).json({ error: "invalid role" });
  const { hashPassword } = await import("../services/authService.js");
  const passwordHash = await hashPassword(password);
  const admin = await create({ email, passwordHash, name: name || email, role });
  const { passwordHash: _, ...result } = admin;
  res.json(result);
});

router.patch("/admins/:id", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { name, role, password } = req.body || {};
  const data = { name, role };
  if (password) {
    const { hashPassword } = await import("../services/authService.js");
    data.passwordHash = await hashPassword(password);
  }
  const admin = await update(req.params.id, data);
  if (!admin) return res.status(404).json({ error: "not found" });
  const { passwordHash: _, ...result } = admin;
  res.json(result);
});

router.delete("/admins/:id", requireRole("SUPER_ADMIN"), async (req, res) => {
  await remove(req.params.id);
  res.json({ ok: true });
});

export default router;