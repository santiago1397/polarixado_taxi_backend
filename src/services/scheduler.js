import cron from "node-cron";
import { listTrips, updateTrip } from "./tripRepo.js";
import { sendReminder } from "./mailer.js";
import prisma from "../lib/prisma.js";

const THIRTY_MIN = 30 * 60 * 1000;

// Ping the DB every 4 minutes to prevent free-tier pausing (e.g. Neon)
async function keepDbAlive() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error("[scheduler] db keep-alive failed", e.message);
  }
}

export function startScheduler() {
  cron.schedule("*/4 * * * *", keepDbAlive);

  cron.schedule("* * * * *", async () => {
    try {
      const trips = await listTrips();
      const now = Date.now();
      for (const trip of trips) {
        if (
          trip.mode === "SCHEDULED" &&
          trip.state === "CONFIRMED" &&
          !trip.reminderSentAt &&
          trip.scheduledAt &&
          new Date(trip.scheduledAt).getTime() - now <= THIRTY_MIN &&
          new Date(trip.scheduledAt).getTime() - now > 0
        ) {
          await sendReminder(trip);
          await updateTrip(trip.id, { reminderSentAt: new Date().toISOString() });
          console.log(`[scheduler] reminder sent for ${trip.id}`);
        }
      }
    } catch (e) {
      console.error("[scheduler] error", e);
    }
  });
  console.log("[scheduler] started");
}
