import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function listTrips() {
  return prisma.trip.findMany();
}

export async function getTrip(id) {
  return prisma.trip.findUnique({ where: { id } });
}

export async function createTrip(data) {
  return prisma.trip.create({ data });
}

export async function updateTrip(id, updater) {
  const current = await prisma.trip.findUnique({ where: { id } });
  if (!current) return null;
  const data = typeof updater === "function" ? updater(current) : { ...current, ...updater };
  // Prisma will reject unknown fields, so strip anything not in the schema
  const {
    id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...prismaData
  } = data;
  void _id; void _createdAt; void _updatedAt;
  return prisma.trip.update({ where: { id }, data: prismaData });
}
