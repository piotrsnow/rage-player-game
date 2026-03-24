import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function gracefulShutdown() {
  await prisma.$disconnect();
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export { prisma };
