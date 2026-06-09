import { PrismaClient } from "@prisma/client";
import { DEFAULT_VEHICLE_TIERS } from "../config/defaultTiers.js";

const prisma = new PrismaClient();

export async function getConfig() {
  const row = await prisma.config.findUnique({ where: { id: "singleton" } });
  if (row) return row;
  // Self-heal if seed never ran.
  return prisma.config.create({
    data: {
      id: "singleton",
      vehicleTiers: DEFAULT_VEHICLE_TIERS,
      currency: process.env.CURRENCY || "USD",
      zelleHandle: process.env.ZELLE_HANDLE || null,
      zelleName: process.env.ZELLE_NAME || null,
    },
  });
}

export async function updateConfig(patch) {
  return prisma.config.update({ where: { id: "singleton" }, data: patch });
}
