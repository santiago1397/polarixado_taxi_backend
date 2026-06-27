import "dotenv/config";
import prisma from "../lib/prisma.js";

const toDate = (v) => (v ? new Date(v) : null);
const toIso = (v) => (v instanceof Date ? v.toISOString() : v || null);
const upper = (v) => (typeof v === "string" && v ? v.toUpperCase() : v);

function toDb(d) {
  if (!d) return d;
  return {
    id: d.id,
    createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
    vehicleType: d.vehicleType,
    scheduledAt: toDate(d.scheduledAt),
    mode: d.mode,
    customerName: d.customer?.name,
    customerEmail: d.customer?.email,
    customerPhone: d.customer?.phone ?? null,
    originAddress: d.origin?.address,
    originLat: d.origin?.lat,
    originLng: d.origin?.lng,
    destAddress: d.destination?.address,
    destLat: d.destination?.lat,
    destLng: d.destination?.lng,
    routeGeoJSON: d.routeGeoJSON ?? null,
    distanceMiles: d.distanceMiles,
    etaMin: d.etaMin ?? 0,
    fareBase: d.fare?.base,
    farePerMile: d.fare?.perMileTotal,
    fareTime: d.fare?.perMinuteTotal ?? 0,
    fareEwrSurcharge: d.fare?.ewrSurcharge ?? 0,
    fareTimeOfDaySurcharge: d.fare?.timeOfDaySurcharge ?? 0,
    fareTollAmount: d.fare?.tollAmount ?? 0,
    fareCrossingSurcharge: d.fare?.crossingSurcharge ?? 0,
    fareTotal: d.fare?.total,
    fareCurrency: d.fare?.currency ?? "USD",
    paymentMethod: upper(d.payment?.method),
    paymentTiming: upper(d.payment?.timing),
    paymentStatus: upper(d.payment?.status) || "PENDING",
    receiptBase64: d.payment?.receiptBase64 ?? null,
    stripeSessionId: d.payment?.stripeSessionId ?? null,
    state: d.state,
    stateHistory: d.stateHistory ?? [],
    reminderSentAt: toDate(d.reminderSentAt),
    driverConfirmToken: d.driverConfirmToken,
    driverConfirmedAt: toDate(d.driverConfirmedAt),
    notifiedAt: toDate(d.notifiedAt),
    driverId: d.driverId ?? null,
  };
}

function fromDb(row) {
  if (!row) return row;
  return {
    id: row.id,
    groupId: row.groupId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    vehicleType: row.vehicleType,
    scheduledAt: toIso(row.scheduledAt),
    mode: row.mode,
    customer: { name: row.customerName, email: row.customerEmail, phone: row.customerPhone },
    origin: { address: row.originAddress, lat: row.originLat, lng: row.originLng },
    destination: { address: row.destAddress, lat: row.destLat, lng: row.destLng },
    routeGeoJSON: row.routeGeoJSON,
    distanceMiles: row.distanceMiles,
    etaMin: row.etaMin,
    fare: {
      base: row.fareBase,
      perMileTotal: row.farePerMile,
      perMinuteTotal: row.fareTime,
      ewrSurcharge: row.fareEwrSurcharge ?? 0,
      timeOfDaySurcharge: row.fareTimeOfDaySurcharge ?? 0,
      tollAmount: row.fareTollAmount ?? 0,
      crossingSurcharge: row.fareCrossingSurcharge ?? 0,
      total: row.fareTotal,
      currency: row.fareCurrency,
    },
    payment: {
      method: row.paymentMethod,
      timing: row.paymentTiming,
      status: row.paymentStatus,
      receiptBase64: row.receiptBase64,
      stripeSessionId: row.stripeSessionId,
    },
    state: row.state,
    stateHistory: row.stateHistory,
    reminderSentAt: toIso(row.reminderSentAt),
    driverConfirmToken: row.driverConfirmToken,
    driverConfirmedAt: toIso(row.driverConfirmedAt),
    notifiedAt: toIso(row.notifiedAt),
    driverId: row.driverId,
  };
}

export async function listTrips() {
  const rows = await prisma.trip.findMany({ include: { driver: true } });
  return rows.map((r) => ({ ...fromDb(r), driver: r.driver }));
}

export async function getTrip(id) {
  const row = await prisma.trip.findUnique({ where: { id } });
  return fromDb(row);
}

export async function createTrip(data) {
  const row = await prisma.trip.create({ data: toDb(data) });
  return fromDb(row);
}

export async function updateTrip(id, updater) {
  const current = await prisma.trip.findUnique({ where: { id } });
  if (!current) return null;
  const domain = fromDb(current);
  const next = typeof updater === "function" ? updater(domain) : { ...domain, ...updater };
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...prismaData } = toDb(next);
  void _id; void _createdAt; void _updatedAt;
  const row = await prisma.trip.update({ where: { id }, data: prismaData });
  return fromDb(row);
}

export async function createTripWithConsent(trip, consent) {
  const tripData = toDb(trip);
  const consentData = {
    tripId: trip.id,
    channels: consent.channels,
    method: consent.method,
    textVersion: consent.textVersion,
    ip: consent.ip ?? null,
    userAgent: consent.userAgent ?? null,
  };
  await prisma.$transaction([
    prisma.trip.create({ data: tripData }),
    prisma.consentLog.create({ data: consentData }),
  ]);
  return getTrip(trip.id);
}
