import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import tripsRouter from "./routes/trips.js";
import paymentsRouter, { stripeWebhookHandler } from "./routes/payments.js";
import adminRouter from "./routes/admin.js";
import adminAuthRouter from "./routes/adminAuth.js";
import dealsRouter from "./routes/deals.js";
import dealBookingsRouter from "./routes/dealBookings.js";
import driversRouter from "./routes/drivers.js";
import messagesRouter from "./routes/messages.js";
import { startScheduler } from "./services/scheduler.js";
import { getConfig } from "./services/configRepo.js";

const app = express();

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

app.use(cookieParser());

app.use((req, res, next) => {
  const hasCookie = !!req.headers.cookie;
  const origin = req.headers.origin || "-";
  const ts = new Date().toISOString();
  res.on("finish", () => {
    console.log(`[${ts}] ${req.method} ${req.originalUrl} -> ${res.statusCode} origin=${origin} cookie=${hasCookie ? "yes" : "no"}`);
  });
  next();
});

const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Stripe webhook needs raw body; must be declared BEFORE express.json()
app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json({ limit: "10mb" })); // base64 receipts

app.get("/api/config", async (_req, res) => {
  try {
    const cfg = await getConfig();
    res.json({
      vehicleTiers: cfg.vehicleTiers,
      currency: cfg.currency,
      zelleHandle: cfg.zelleHandle,
      zelleName: cfg.zelleName,
      namedPlaces: cfg.namedPlaces || [],
      zones: cfg.zones || [],
      timeOfDaySurcharge: cfg.timeOfDaySurcharge || [],
    });
  } catch (e) {
    console.error("[config]", e);
    res.status(500).json({ error: "config unavailable" });
  }
});

app.use("/api/trips", tripsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/drivers", driversRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/deals", dealBookingsRouter);
app.use("/api/messages", messagesRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_error" });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`[backend] listening on :${port}`);
  startScheduler();
});
