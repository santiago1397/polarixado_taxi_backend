const VALID_CHANNELS = ["sms", "whatsapp"];
const VALID_METHODS = ["BROWSEWRAP_CLICK", "EXPLICIT_CHECKBOX", "ADMIN_OVERRIDE"];

export function parseConsent(raw, req) {
  if (!raw || typeof raw !== "object") return { error: "consent required" };
  const { channels, method, textVersion } = raw;
  if (!Array.isArray(channels) || channels.length === 0) {
    return { error: "consent.channels required" };
  }
  if (!channels.every((c) => VALID_CHANNELS.includes(c))) {
    return { error: "consent.channels must be subset of sms|whatsapp" };
  }
  if (!VALID_METHODS.includes(method)) {
    return { error: "consent.method invalid" };
  }
  if (typeof textVersion !== "string" || !textVersion) {
    return { error: "consent.textVersion required" };
  }
  return {
    value: {
      channels,
      method,
      textVersion,
      ip: req.ip || null,
      userAgent: (req.headers["user-agent"] || "").slice(0, 500) || null,
    },
  };
}
