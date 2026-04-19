import nodemailer from "nodemailer";
import QRCode from "qrcode";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.warn("[mailer] GMAIL_USER / GMAIL_APP_PASSWORD not set — emails will be logged only");
    return null;
  }
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

function fmtMoney(n, currency = "USD") {
  return `${currency} ${Number(n).toFixed(2)}`;
}

function renderTicketHtml(trip, qrDataUrl) {
  const { fare, customer, origin, destination, payment } = trip;
  const when = trip.mode === "SCHEDULED" ? new Date(trip.scheduledAt).toLocaleString() : "ASAP";
  return `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #ddd;border-radius:12px;padding:24px">
    <h2 style="margin:0 0 8px">Trip Confirmed</h2>
    <p style="color:#666;margin:0 0 16px">Trip ID: <b>${trip.id}</b></p>
    <p><b>When:</b> ${when}</p>
    <p><b>From:</b> ${origin.address}<br/><b>To:</b> ${destination.address}</p>
    <p><b>Distance:</b> ${trip.distanceKm.toFixed(2)} km &nbsp; <b>ETA:</b> ${Math.round(trip.etaMin)} min</p>
    <hr/>
    <h3>Fare breakdown</h3>
    <table style="width:100%;border-collapse:collapse">
      <tr><td>Base</td><td align="right">${fmtMoney(fare.base, fare.currency)}</td></tr>
      <tr><td>Distance (${trip.distanceKm.toFixed(2)} km)</td><td align="right">${fmtMoney(fare.perKmTotal, fare.currency)}</td></tr>
      <tr><td><b>Total</b></td><td align="right"><b>${fmtMoney(fare.total, fare.currency)}</b></td></tr>
    </table>
    <p><b>Payment:</b> ${payment.method} (${payment.timing}) — <i>${payment.status}</i></p>
    <p><b>Customer:</b> ${customer.name} &lt;${customer.email}&gt; ${customer.phone || ""}</p>
    ${qrDataUrl ? `<div style="text-align:center;margin-top:16px"><img src="${qrDataUrl}" alt="Trip QR" style="width:180px;height:180px"/><br/><small>Scan to view trip</small></div>` : ""}
  </div>`;
}

async function makeQr(trip) {
  try {
    const url = `${process.env.PUBLIC_URL || "http://localhost:5173"}/trip/${trip.id}`;
    return await QRCode.toDataURL(url, { width: 360 });
  } catch {
    return null;
  }
}

export async function sendConfirmation(trip) {
  const qr = await makeQr(trip);
  const html = renderTicketHtml(trip, qr);
  const subject = `Trip ${trip.id} confirmed`;
  const from = `"${process.env.DRIVER_NAME || "Taxi"}" <${process.env.GMAIL_USER}>`;
  const recipients = [trip.customer.email, process.env.DRIVER_EMAIL].filter(Boolean);
  const t = getTransporter();
  if (!t) {
    console.log("[mailer:stub]", { to: recipients, subject });
    return;
  }
  for (const to of recipients) {
    await t.sendMail({ from, to, subject, html });
  }
}

export async function sendReminder(trip) {
  const html = `<p>Reminder: trip <b>${trip.id}</b> is scheduled for ${new Date(trip.scheduledAt).toLocaleString()}.</p>` +
    `<p>Pickup: ${trip.origin.address}<br/>Dropoff: ${trip.destination.address}</p>`;
  const subject = `Reminder: trip ${trip.id} in 30 min`;
  const from = `"${process.env.DRIVER_NAME || "Taxi"}" <${process.env.GMAIL_USER}>`;
  const recipients = [trip.customer.email, process.env.DRIVER_EMAIL].filter(Boolean);
  const t = getTransporter();
  if (!t) {
    console.log("[mailer:stub reminder]", { to: recipients, subject });
    return;
  }
  for (const to of recipients) {
    await t.sendMail({ from, to, subject, html });
  }
}
