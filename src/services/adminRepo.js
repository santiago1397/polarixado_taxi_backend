import prisma from "../lib/prisma.js";

export async function findByEmail(email) {
  return prisma.admin.findUnique({ where: { email } });
}

export async function findById(id) {
  return prisma.admin.findUnique({ where: { id } });
}

export async function list() {
  return prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
}

export async function create(data) {
  return prisma.admin.create({ data });
}

export async function update(id, data) {
  return prisma.admin.update({ where: { id }, data });
}

export async function remove(id) {
  return prisma.admin.delete({ where: { id } });
}