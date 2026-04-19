import Stripe from "stripe";

let _stripe = null;
export function stripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  _stripe = new Stripe(key);
  return _stripe;
}

export async function createCheckoutSession(trip) {
  const s = stripe();
  const session = await s.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: (trip.fare.currency || "USD").toLowerCase(),
          product_data: {
            name: `Taxi trip ${trip.id}`,
            description: `${trip.origin.address} → ${trip.destination.address}`,
          },
          unit_amount: Math.round(trip.fare.total * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { tripId: trip.id },
    success_url: `${process.env.FRONTEND_URL}/trip/${trip.id}?paid=1`,
    cancel_url: `${process.env.FRONTEND_URL}/trip/${trip.id}?canceled=1`,
  });
  return session;
}

export function verifyWebhook(rawBody, signature) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  return s.webhooks.constructEvent(rawBody, signature, secret);
}
