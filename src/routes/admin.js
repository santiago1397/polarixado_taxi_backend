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
    updatedAt: cfg.updatedAt,
  });
});

router.put("/config", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { vehicleTiers, currency, zelleHandle, zelleName } = req.body || {};
  if (vehicleTiers !== undefined) {
    if (typeof vehicleTiers !== "object" || vehicleTiers === null) {
      return res.status(400).json({ error: "vehicleTiers must be an object" });
    }
    for (const key of TIER_ORDER) {
      const t = vehicleTiers[key];
      if (!t) return res.status(400).json({ error: `missing tier ${key}` });
      const nums = ["baseFare", "perMile", "perMinute", "seats", "bags"];
      for (const f of nums) {
        if (typeof t[f] !== "number" || t[f] < 0 || Number.isNaN(t[f])) {
          return res.status(400).json({ error: `tier ${key}.${f} must be a non-negative number` });
        }
      }
      if (!["large_bag", "carry_on"].includes(t.bagType)) {
        return res.status(400).json({ error: `tier ${key}.bagType must be large_bag or carry_on` });
      }
      if (typeof t.label !== "string" || !t.label.trim()) {
        return res.status(400).json({ error: `tier ${key}.label required` });
      }
    }
  }
  const patch = {};
  if (vehicleTiers !== undefined) patch.vehicleTiers = vehicleTiers;
  if (currency !== undefined) patch.currency = currency;
  if (zelleHandle !== undefined) patch.zelleHandle = zelleHandle;
  if (zelleName !== undefined) patch.zelleName = zelleName;
  const updated = await updateConfig(patch);
  res.json({
    vehicleTiers: updated.vehicleTiers,
    currency: updated.currency,
    zelleHandle: updated.zelleHandle,
    zelleName: updated.zelleName,
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