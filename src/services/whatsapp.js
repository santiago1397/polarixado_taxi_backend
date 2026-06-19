import { getConfig } from "./configRepo.js";

const GRAPH_URL = "https://graph.facebook.com/v19.0";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export async function sendTripNotification(trip) {
  const tripId = trip?.id || "unknown";
  console.log(`[whatsapp] sendTripNotification start trip=${tripId} mode=${trip?.mode} state=${trip?.state}`);

  const cfg = await getConfig();
  if (!cfg.whatsappEnabled) {
    console.log(`[whatsapp] disabled in config, skipping trip=${tripId}`);
    return;
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn(`[whatsapp] Missing env: phoneNumberId=${!!phoneNumberId} accessToken=${!!accessToken} trip=${tripId}`);
    return;
  }

  const recipientPhone = cfg.whatsappRecipientPhone;
  const recipientName = cfg.whatsappRecipientName || "Driver";

  if (!recipientPhone) {
    console.warn(`[whatsapp] No recipient phone configured trip=${tripId}`);
    return;
  }

  const pickupTime = trip.mode === "SCHEDULED" && trip.scheduledAt
    ? new Date(trip.scheduledAt)
    : new Date(new Date(trip.createdAt).getTime() + 30 * 60 * 1000);

  const rawAddress = trip.origin?.address || trip.originAddress || "";
  const sanitizedAddress = rawAddress.replace(/\s+/g, " ").trim();
  if (!sanitizedAddress) {
    console.warn(`[whatsapp] empty origin address, skipping trip=${tripId}`);
    return;
  }

  if (!trip.driverConfirmToken) {
    console.warn(`[whatsapp] trip has no driverConfirmToken, skipping trip=${tripId}`);
    return;
  }
  const confirmParam = `${trip.id}?token=${trip.driverConfirmToken}`;
  const toDigits = recipientPhone.replace(/\D/g, "");

  const payload = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: "driver_appointment_notification",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: recipientName },
            { type: "text", text: dateFmt.format(pickupTime) },
            { type: "text", text: timeFmt.format(pickupTime) },
            { type: "text", text: sanitizedAddress },
            { type: "text", text: confirmParam },
          ],
        },
      ],
    },
  };

  console.log(`[whatsapp] sending trip=${tripId} to=${toDigits} template=${payload.template.name} phoneNumberId=${phoneNumberId}`);

  let res;
  try {
    res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`[whatsapp] network error trip=${tripId}:`, err?.message || err);
    throw err;
  }

  const bodyText = await res.text();

  if (!res.ok) {
    let parsed;
    try { parsed = JSON.parse(bodyText); } catch { /* not JSON */ }
    const metaErr = parsed?.error;
    console.error(
      `[whatsapp] API error trip=${tripId} status=${res.status} code=${metaErr?.code} subcode=${metaErr?.error_subcode} type=${metaErr?.type} msg=${metaErr?.message} details=${metaErr?.error_data?.details} fbtrace=${metaErr?.fbtrace_id} body=${bodyText}`
    );
    throw new Error(`WhatsApp API ${res.status}: ${bodyText}`);
  }

  let parsedOk;
  try { parsedOk = JSON.parse(bodyText); } catch { /* not JSON */ }
  const messageId = parsedOk?.messages?.[0]?.id;
  const waId = parsedOk?.contacts?.[0]?.wa_id;
  console.log(`[whatsapp] sent OK trip=${tripId} messageId=${messageId} waId=${waId}`);
}
