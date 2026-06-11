// One-time data migration: reshape existing Config row from the old fare shape
// (flat baseFare/perMile/perMinute per tier) to the new banded shape.
// Idempotent: detects which shape is in use and only migrates if needed.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_VEHICLE_TIERS,
  DEFAULT_NAMED_PLACES,
  DEFAULT_ZONES,
  DEFAULT_TIME_OF_DAY_SURCHARGE,
} from "../src/config/defaultTiers.js";

const prisma = new PrismaClient();

function looksLikeOldTier(t) {
  return t && typeof t === "object" && "baseFare" in t && "perMile" in t;
}

function looksLikeNewTier(t) {
  return t && Array.isArray(t.bands) && t.bands.length > 0;
}

function migrateTier(t) {
  if (looksLikeNewTier(t)) return t;
  if (looksLikeOldTier(t)) {
    return {
      ...t,
      bands: [{ maxMiles: null, base: Number(t.baseFare) || 0, perMile: Number(t.perMile) || 0 }],
    };
  }
  return t;
}

async function main() {
  const row = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!row) {
    console.log("No config row found — nothing to migrate. Run `npm run db:seed` instead.");
    return;
  }

  const patch = {};

  // Migrate vehicleTiers from flat to banded
  const tiers = row.vehicleTiers || {};
  const migratedTiers = {};
  let tierChanged = false;
  for (const [k, v] of Object.entries(tiers)) {
    if (looksLikeOldTier(v) && !looksLikeNewTier(v)) {
      migratedTiers[k] = migrateTier(v);
      tierChanged = true;
      console.log(`  Migrated tier ${k}: flat → 1 band`);
    } else {
      migratedTiers[k] = v;
    }
  }
  // Add tiers present in defaults but missing from the row (e.g. BLACK_CAR)
  for (const k of Object.keys(DEFAULT_VEHICLE_TIERS)) {
    if (!migratedTiers[k]) {
      migratedTiers[k] = DEFAULT_VEHICLE_TIERS[k];
      tierChanged = true;
      console.log(`  Added missing tier ${k} from defaults`);
    }
  }
  if (tierChanged) patch.vehicleTiers = migratedTiers;

  // Seed namedPlaces if missing OR if any matchAddresses entry isn't a string
  // (PostgreSQL JSONB can't serialize RegExp objects — they round-trip as `{}`).
  const npBroken = Array.isArray(row.namedPlaces) && row.namedPlaces.some(
    (p) => !Array.isArray(p.matchAddresses) || p.matchAddresses.some((s) => typeof s !== "string")
  );
  if (!row.namedPlaces || npBroken) {
    patch.namedPlaces = DEFAULT_NAMED_PLACES;
    console.log(npBroken ? "  Re-seeded namedPlaces (had non-string matchAddresses)" : "  Seeded namedPlaces with EWR");
  }
  if (!row.zones) {
    patch.zones = DEFAULT_ZONES;
    console.log("  Seeded zones (NJ→NJ, NJ→NY, NJ→other)");
  }
  if (!row.timeOfDaySurcharge) {
    patch.timeOfDaySurcharge = DEFAULT_TIME_OF_DAY_SURCHARGE;
    console.log("  Seeded timeOfDaySurcharge windows");
  }

  if (Object.keys(patch).length === 0) {
    console.log("Config row is already in the new shape. No migration needed.");
    return;
  }

  await prisma.config.update({ where: { id: "singleton" }, data: patch });
  console.log("Migration complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
