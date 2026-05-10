import { PrismaClient } from '@prisma/client';

// Do NOT register process signal handlers here. server.js owns graceful
// shutdown: prisma.$disconnect() must run only after fastify.close() drains
// in-flight HTTP handlers — otherwise a concurrent $disconnect() (from a
// duplicate SIGINT/SIGTERM listener) disconnects the engine mid-request
// ("Engine is not yet connected").

const prisma = new PrismaClient();

export { prisma };
