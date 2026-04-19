import cron from "node-cron";
import { listTrips, updateTrip } from "./tripRepo.js";
import { sendReminder } from "./mailer.js";

const THIRTY_MIN = 30 * 60 * 1000;

export function startScheduler() {
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
