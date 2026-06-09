import twilio from "twilio";

let _client = null;

function getClient() {
  if (_client) return _client;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    console.warn("[sms] Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER");
    return null;
  }
  _client = twilio(accountSid, authToken);
  return _client;
}

function fromNumber() {
  return process.env.TWILIO_FROM_NUMBER;
}

export function formatPhone(raw) {
  if (typeof raw !== "string") return null;
  const stripped = raw.replace(/[\s().-]/g, "");
  if (!stripped) return null;
  const withPlus = stripped.startsWith("+") ? stripped : `${process.env.DEFAULT_SMS_COUNTRY_CODE || "+1"}${stripped}`;
  return /^\+\d{8,15}$/.test(withPlus) ? withPlus : null;
}

const GSM7_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ!\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "\f^{}\\[~]|€";
const GSM7_RE = new RegExp(`^[${GSM7_BASIC}${GSM7_EXTENDED}]*$`);

function estimateSegments(body) {
  const encoding = GSM7_RE.test(body) ? "GSM-7" : "UCS-2";
  const len = body.length;
  if (encoding === "GSM-7") {
    return { encoding, count: len <= 160 ? 1 : Math.ceil(len / 153) };
  }
  return { encoding, count: len <= 70 ? 1 : Math.ceil(len / 67) };
}

export async function sendSms({ to, body, purpose } = {}) {
  try {
    const client = getClient();
    if (!client) return { ok: false, error: "sms_not_configured" };
    const from = fromNumber();
    if (!from) return { ok: false, error: "sms_from_number_missing" };
    const normalized = formatPhone(to);
    if (!normalized) return { ok: false, error: "invalid_phone" };
    if (typeof body !== "string" || body.length === 0 || body.length > 1600) {
      return { ok: false, error: "body_length_invalid" };
    }
    const { count, encoding } = estimateSegments(body);
    const tag = purpose || "unspecified";
    console.log(`[sms] sending purpose=${tag} to=${normalized} segments=${count} encoding=${encoding} chars=${body.length}`);
    const msg = await client.messages.create({ to: normalized, from, body });
    console.log(`[sms] sent sid=${msg.sid} purpose=${tag} to=${normalized}`);
    return { ok: true, sid: msg.sid };
  } catch (e) {
    const tag = purpose || "unspecified";
    console.error(`[sms] FAILED purpose=${tag} to=${to} err=${e.message} code=${e.code}`);
    return { ok: false, error: e.message || "send_failed", code: e.code };
  }
}
