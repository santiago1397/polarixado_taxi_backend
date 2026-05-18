import { Router } from "express";
import { verifyAdmin, requireRole } from "../middleware/adminAuth.js";
import { listTrips, getTrip, updateTrip } from "../services/tripRepo.js";
import { list, create, update, remove } from "../services/adminRepo.js";
import { canTransition, STATES } from "../services/stateMachine.js";
import { sendConfirmation } from "../services/mailer.js";

const router = Router();

router.use(verifyAdmin);

router.get("/trips", async (_req, res) => {
  const trips = await listTrips();
  const sorted = [...trips].sort((a, b) => {
    const ak = a.scheduledAt || a.createdAt;
    const bk = b.scheduledAt || b.createdAt;
    return new Date(bk) - new Date(ak);
  });
  res.json(sorted.map((t) => {
    const { receiptBase64, ...p } = t.payment || {};
    return { ...t, payment: { ...p, hasReceipt: !!receiptBase64 } };
  }));
});

router.get("/trips/:id/receipt", async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip?.payment?.receiptBase64) return res.status(404).json({ error: "no receipt" });
  res.json({ receiptBase64: trip.payment.receiptBase64 });
});

router.post("/trips/:id/verify-zelle", async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: "not found" });
  if (trip.payment.method !== "zelle") return res.status(400).json({ error: "not zelle" });
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