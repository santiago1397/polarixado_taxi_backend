import "dotenv/config";
import express from "express";
import cors from "cors";
import tripsRouter from "./routes/trips.js";
import paymentsRouter, { stripeWebhookHandler } from "./routes/payments.js";
import adminRouter from "./routes/admin.js";
import { startScheduler } from "./services/scheduler.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));

// Stripe webhook needs raw body; must be declared BEFORE express.json()
app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json({ limit: "10mb" })); // base64 receipts

app.get("/api/config", (_req, res) => {
  res.json({
    zelleHandle: process.env.ZELLE_HANDLE,
    zelleName: process.env.ZELLE_NAME,
    baseFare: Number(process.env.BASE_FARE || 5),
    perKm: Number(process.env.PER_KM || 2),
    currency: process.env.CURRENCY || "USD",
  });
});

app.use("/api/trips", tripsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/admin", adminRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`[backend] listening on :${port}`);
  startScheduler();
});
