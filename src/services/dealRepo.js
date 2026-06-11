import prisma from "../lib/prisma.js";

export async function listDeals() {
  return prisma.deal.findMany({
    where: { active: true },
    orderBy: { departureAt: "asc" },
  });
}

export async function getDeal(id) {
  return prisma.deal.findUnique({ where: { id } });
}

export async function createDeal(data) {
  return prisma.deal.create({ data });
}

export async function updateDeal(id, data) {
  return prisma.deal.update({ where: { id }, data });
}

export async function deleteDeal(id) {
  return prisma.deal.update({ where: { id }, data: { active: false } });
}