import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../data/trips.json");

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const MODE_MAP = { ASAP: "ASAP", SCHEDULED: "SCHEDULED" };
const VEHICLE_MAP = { uber_x: "UBER_X", uber_xl: "UBER_XL" };
const STATE_MAP = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  CONFIRMED: "CONFIRMED",
  EN_ROUTE: "EN_ROUTE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};
const METHOD_MAP = {
  stripe: "STRIPE",
  zelle: "ZELLE",
  cash: "CASH",
  zelle_later: "ZELLE_LATER",
  cashapp: "CASHAPP",
};
const TIMING_MAP = { now: "NOW", later: "LATER" };
const STATUS_MAP = {
  pending: "PENDING",
  pending_verification: "PENDING_VERIFICATION",
  paid: "PAID",
};

async function main() {
  console.log("Reading trips.json...");
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const trips = JSON.parse(raw || "[]");
  console.log(`Found ${trips.length} trips to migrate`);

  for (const trip of trips) {
    const originLat = trip.origin?.lat ?? 0;
    const originLng = trip.origin?.lng ?? 0;
    const destLat = trip.destination?.lat ?? 0;
    const destLng = trip.destination?.lng ?? 0;

    const record = {
      id: trip.id,
      vehicleType: VEHICLE_MAP[trip.vehicleType] ?? "UBER_X",
      mode: MODE_MAP[trip.mode] ?? "ASAP",
      scheduledAt: trip.scheduledAt ? new Date(trip.scheduledAt) : null,
      customerName: trip.customer?.name ?? "",
      customerEmail: trip.customer?.email ?? "",
      customerPhone: trip.customer?.phone ?? null,
      originAddress: trip.origin?.address ?? "",
      originLat,
      originLng,
      destAddress: trip.destination?.address ?? "",
      destLat,
      destLng,
      routeGeoJSON: trip.routeGeoJSON ?? null,
      distanceKm: trip.distanceKm ?? 0,
      etaMin: trip.etaMin ?? 0,
      fareBase: trip.fare?.base ?? 0,
      farePerKm: trip.fare?.perKmTotal ?? 0,
      fareTotal: trip.fare?.total ?? 0,
      fareCurrency: trip.fare?.currency ?? "USD",
      paymentMethod: METHOD_MAP[trip.payment?.method] ?? "CASH",
      paymentTiming: TIMING_MAP[trip.payment?.timing] ?? "LATER",
      paymentStatus: STATUS_MAP[trip.payment?.status] ?? "PENDING",
      stripeSessionId: trip.payment?.stripeSessionId ?? null,
      receiptBase64: trip.payment?.receiptBase64 ?? null,
      state: STATE_MAP[trip.state] ?? "PENDING_PAYMENT",
      stateHistory: Array.isArray(trip.stateHistory) ? trip.stateHistory : [],
      reminderSentAt: trip.reminderSentAt ? new Date(trip.reminderSentAt) : null,
    };

    try {
      await prisma.trip.upsert({
        where: { id: record.id },
        update: record,
        create: record,
      });
      console.log(`  Migrated: ${record.id}`);
    } catch (err) {
      console.error(`  Failed: ${record.id}`, err.message);
    }
  }

  console.log("Migration complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
