import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function listDrivers() {
  return prisma.driver.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getDriver(id) {
  return prisma.driver.findUnique({ where: { id } });
}

export async function getDefaultDriver() {
  const drivers = await prisma.driver.findMany({ take: 1, orderBy: { createdAt: "asc" } });
  return drivers[0] || null;
}

export async function createDriver(data) {
  return prisma.driver.create({ data });
}

export async function updateDriver(id, data) {
  return prisma.driver.update({ where: { id }, data });
}

export async function removeDriver(id) {
  return prisma.driver.delete({ where: { id } });
}