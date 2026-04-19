import { Router } from "express";
import { getTrip, updateTrip } from "../services/tripRepo.js";
import { createCheckoutSession, verifyWebhook } from "../services/stripe.js";
import { sendConfirmation } from "../services/mailer.js";
import { STATES } from "../services/stateMachine.js";

const router = Router();

router.post("/stripe/checkout", async (req, res) => {
  const { tripId } = req.body || {};
  const trip = await getTrip(tripId);
  if (!trip) return res.status(404).json({ error: "not found" });
  try {
    const session = await createCheckoutSession(trip);
    await updateTrip(trip.id, (t) => ({
      ...t,
      payment: { ...t.payment, stripeSessionId: session.id },
    }));
    res.json({ url: session.url, id: session.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// NOTE: mounted with express.raw in index.js
export async function stripeWebhookHandler(req, res) {
  const sig = req.header("stripe-signature");
  let event;
  try {
    event = verifyWebhook(req.body, sig);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const tripId = session.metadata?.tripId;
    if (tripId) {
      const updated = await updateTrip(tripId, (t) => ({
        ...t,
        state: STATES.CONFIRMED,
        payment: { ...t.payment, status: "paid" },
        stateHistory: [...t.stateHistory, { state: STATES.CONFIRMED, at: new Date().toISOString() }],
      }));
      if (updated) sendConfirmation(updated).catch((e) => console.error("[mail]", e));
    }
  }
  res.json({ received: true });
}

export default router;
