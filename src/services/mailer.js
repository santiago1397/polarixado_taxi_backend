import nodemailer from "nodemailer";
import QRCode from "qrcode";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn("[mailer] SENDGRID_API_KEY not set — emails will be logged only");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: "smtp.sendgrid.net",
    port: 587,
    secure: false,
    auth: { user: "apikey", pass: apiKey },
  });
  return transporter;
}

function fromAddress() {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (process.env.SENDGRID_SENDER_EMAIL) return `"${process.env.DRIVER_NAME || "Taxi"}" <${process.env.SENDGRID_SENDER_EMAIL}>`;
  return `"${process.env.DRIVER_NAME || "Taxi"}" <no-reply@localhost>`;
}

function apiBase() {
  return process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
}

function fmtMoney(n, currency = "USD") {
  return `${currency} ${Number(n).toFixed(2)}`;
}

function renderTicketHtml(trip, qrDataUrl, opts = {}) {
  const { fare, customer, origin, destination, payment } = trip;
  const when = trip.mode === "SCHEDULED" ? new Date(trip.scheduledAt).toLocaleString() : "ASAP";
  const cta = opts.confirmUrl
    ? `<div style="text-align:center;margin:20px 0">
         <a href="${opts.confirmUrl}" style="background:#10b981;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold;display:inline-block;font-size:16px">Confirm Trip</a>
         <p style="color:#666;font-size:12px;margin-top:8px">Click to confirm you will take this trip. If something happens and you can't make it, do not click and contact dispatch.</p>
       </div>`
    : "";
  const confirmStatus = opts.showConfirmStatus
    ? `<p style="margin:8px 0;padding:8px;border-radius:6px;background:${trip.driverConfirmedAt ? "#d1fae5" : "#fee2e2"};color:${trip.driverConfirmedAt ? "#065f46" : "#991b1b"}">
         <b>Driver status:</b> ${trip.driverConfirmedAt ? `Confirmed at ${new Date(trip.driverConfirmedAt).toLocaleString()}` : "NOT YET CONFIRMED"}
       </p>`
    : "";

  // Build fare breakdown rows from the new shape (with old-shape backward compat).
  const breakdown = Array.isArray(fare.breakdown) && fare.breakdown.length
    ? fare.breakdown
    : legacyBreakdown(trip);

  const breakdownRows = breakdown.map((row) => {
    const weight = row.total ? `<b>${fmtMoney(row.value, fare.currency)}</b>` : fmtMoney(row.value, fare.currency);
    const cell = row.total ? `<td><b>${row.label}</b></td><td align="right">${weight}</td>` : `<td>${row.label}</td><td align="right">${weight}</td>`;
    return `<tr>${cell}</tr>`;
  }).join("");

  return `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #ddd;border-radius:12px;padding:24px">
    <h2 style="margin:0 0 8px">${opts.heading || "Trip Confirmed"}</h2>
    <p style="color:#666;margin:0 0 16px">Trip ID: <b>${trip.id}</b></p>
    ${confirmStatus}
    ${cta}
    <p><b>When:</b> ${when}</p>
    <p><b>From:</b> ${origin.address}<br/><b>To:</b> ${destination.address}</p>
    <p><b>Distance:</b> ${trip.distanceMiles.toFixed(2)} mi &nbsp; <b>ETA:</b> ${Math.round(trip.etaMin)} min</p>
    <hr/>
    <h3>Fare breakdown</h3>
    <table style="width:100%;border-collapse:collapse">
      ${breakdownRows}
    </table>
    <p><b>Payment:</b> ${payment.method} (${payment.timing}) — <i>${payment.status}</i></p>
    <p><b>Customer:</b> ${customer.name}${customer.email ? ` &lt;${customer.email}&gt;` : ""}${customer.phone ? ` ${customer.phone}` : ""}</p>
    ${qrDataUrl ? `<div style="text-align:center;margin-top:16px"><img src="${qrDataUrl}" alt="Trip QR" style="width:180px;height:180px"/><br/><small>Scan to view trip</small></div>` : ""}
  </div>`;
}

function legacyBreakdown(trip) {
  const f = trip.fare || {};
  const rows = [
    { label: "Base", value: f.base ?? 0 },
    { label: `Distance (${trip.distanceMiles.toFixed(2)} mi)`, value: f.perMileTotal ?? 0 },
  ];
  if ((f.perMinuteTotal ?? 0) > 0) rows.push({ label: `Time (${Math.round(trip.etaMin || 0)} min)`, value: f.perMinuteTotal });
  if ((f.ewrSurcharge ?? 0) > 0) rows.push({ label: "Newark Airport Surcharge", value: f.ewrSurcharge });
  if ((f.timeOfDaySurcharge ?? 0) > 0) rows.push({ label: "Time-of-day surcharge", value: f.timeOfDaySurcharge });
  rows.push({ label: "Total", value: f.total ?? 0, total: true });
  return rows;
}

async function makeQr(trip) {
  try {
    const url = `${process.env.PUBLIC_URL || "http://localhost:5173"}/trip/${trip.id}`;
    return await QRCode.toDataURL(url, { width: 360 });
  } catch {
    return null;
  }
}

function driverConfirmUrl(trip) {
  if (!trip.driverConfirmToken) return null;
  return `${apiBase()}/api/trips/${trip.id}/driver-confirm?token=${encodeURIComponent(trip.driverConfirmToken)}`;
}

export async function sendConfirmation(trip) {
  const qr = await makeQr(trip);
  const customerHtml = renderTicketHtml(trip, qr, { heading: "Your Trip is Booked" });
  const driverHtml = renderTicketHtml(trip, qr, {
    heading: "New Trip — Please Confirm",
    confirmUrl: driverConfirmUrl(trip),
    showConfirmStatus: true,
  });
  const customerSubject = `Trip ${trip.id} confirmed`;
  const driverSubject = `New ${trip.mode === "SCHEDULED" ? "scheduled" : "ASAP"} trip ${trip.id} — please confirm`;
  const from = fromAddress();
  const t = getTransporter();

  const customerTo = trip.customer?.email;
  const driverTo = trip.driver?.email || process.env.DRIVER_EMAIL;

  if (!t) {
    console.log("[mailer:stub] customer", { to: customerTo, subject: customerSubject });
    if (driverTo) console.log("[mailer:stub] driver", { to: driverTo, subject: driverSubject, confirmUrl: driverConfirmUrl(trip) });
    return;
  }
  if (customerTo) {
    await t.sendMail({ from, to: customerTo, subject: customerSubject, html: customerHtml });
  }
  if (driverTo) {
    await t.sendMail({ from, to: driverTo, subject: driverSubject, html: driverHtml });
  }
}

export async function sendReminder(trip) {
  const confirmed = !!trip.driverConfirmedAt;
  const customerHtml =
    `<p>Reminder: your trip <b>${trip.id}</b> is scheduled for ${new Date(trip.scheduledAt).toLocaleString()}.</p>` +
    `<p>Pickup: ${trip.origin.address}<br/>Dropoff: ${trip.destination.address}</p>`;
  const driverHtml =
    `<p>Reminder: trip <b>${trip.id}</b> is in 30 minutes (${new Date(trip.scheduledAt).toLocaleString()}).</p>` +
    `<p>Pickup: ${trip.origin.address}<br/>Dropoff: ${trip.destination.address}</p>` +
    (confirmed
      ? `<p style="color:#065f46"><b>Already confirmed</b> at ${new Date(trip.driverConfirmedAt).toLocaleString()}.</p>`
      : `<p style="color:#991b1b"><b>NOT YET CONFIRMED.</b> Please confirm now: <a href="${driverConfirmUrl(trip)}">Confirm Trip</a></p>`);

  const customerSubject = `Reminder: your trip ${trip.id} in 30 min`;
  const driverSubject = `Reminder: trip ${trip.id} in 30 min${confirmed ? "" : " — UNCONFIRMED"}`;
  const from = fromAddress();
  const t = getTransporter();
  const customerTo = trip.customer?.email;
  const driverTo = trip.driver?.email || process.env.DRIVER_EMAIL;

  if (!t) {
    console.log("[mailer:stub reminder] customer", { to: customerTo, subject: customerSubject });
    if (driverTo) console.log("[mailer:stub reminder] driver", { to: driverTo, subject: driverSubject });
    return;
  }
  if (customerTo) await t.sendMail({ from, to: customerTo, subject: customerSubject, html: customerHtml });
  if (driverTo) await t.sendMail({ from, to: driverTo, subject: driverSubject, html: driverHtml });
}
