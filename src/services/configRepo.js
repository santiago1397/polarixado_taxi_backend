import "dotenv/config";
import prisma from "../lib/prisma.js";
import { DEFAULT_VEHICLE_TIERS } from "../config/defaultTiers.js";
import { DEFAULT_TOLL_ROADS } from "./tollDetector.js";

export async function getConfig() {
  let row = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (!row) {
    row = await prisma.config.create({
      data: {
        id: "singleton",
        vehicleTiers: DEFAULT_VEHICLE_TIERS,
        currency: process.env.CURRENCY || "USD",
        zelleHandle: process.env.ZELLE_HANDLE || null,
        zelleName: process.env.ZELLE_NAME || null,
        tollRoads: DEFAULT_TOLL_ROADS,
      },
    });
  }
  // Back-fill tollRoads on existing configs that predate this feature.
  if (!row.tollRoads) {
    row = await prisma.config.update({
      where: { id: "singleton" },
      data: { tollRoads: DEFAULT_TOLL_ROADS },
    });
  }
  return row;
}

export async function updateConfig(patch) {
  return prisma.config.update({ where: { id: "singleton" }, data: patch });
}
