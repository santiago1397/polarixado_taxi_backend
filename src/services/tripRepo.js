import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../../data/trips.json");

let writeQueue = Promise.resolve();

async function readAll() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(trips) {
  const tmp = DATA_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(trips, null, 2));
  await fs.rename(tmp, DATA_FILE);
}

function queue(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

export async function listTrips() {
  return readAll();
}

export async function getTrip(id) {
  const trips = await readAll();
  return trips.find((t) => t.id === id) || null;
}

export async function createTrip(trip) {
  return queue(async () => {
    const trips = await readAll();
    trips.push(trip);
    await writeAll(trips);
    return trip;
  });
}

export async function updateTrip(id, updater) {
  return queue(async () => {
    const trips = await readAll();
    const idx = trips.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const next = typeof updater === "function" ? updater(trips[idx]) : { ...trips[idx], ...updater };
    trips[idx] = next;
    await writeAll(trips);
    return next;
  });
}
