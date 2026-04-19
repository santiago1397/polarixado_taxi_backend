import { Router } from "express";
import { adminAuth } from "../middleware/adminAuth.js";
import { listTrips, getTrip, updateTrip } from "../services/tripRepo.js";
import { canTransition, STATES } from "../services/stateMachine.js";
import { sendConfirmation } from "../services/mailer.js";

const router = Router();
router.use(adminAuth);

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

export default router;
