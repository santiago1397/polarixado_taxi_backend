import { Router } from "express";
import { verifyAdmin } from "../middleware/adminAuth.js";
import { sendSms, formatPhone } from "../services/twilio.js";

const router = Router();

router.post("/sms", verifyAdmin, async (req, res) => {
  const { to, body } = req.body || {};
  if (typeof to !== "string" || typeof body !== "string") {
    return res.status(400).json({ error: "to and body must be strings" });
  }
  if (body.length === 0 || body.length > 1600) {
    return res.status(400).json({ error: "body length must be 1..1600" });
  }
  const normalized = formatPhone(to);
  if (!normalized) {
    return res.status(400).json({ error: "invalid_phone", message: "to must be E.164 (e.g. +15551234567) or a 10-digit number with DEFAULT_SMS_COUNTRY_CODE prefix" });
  }
  const result = await sendSms({ to: normalized, body, purpose: "manual_smoke_test" });
  if (!result.ok) {
    const status = result.error === "sms_not_configured" || result.error === "sms_from_number_missing" ? 503 : 502;
    return res.status(status).json(result);
  }
  res.json(result);
});

export default router;
