// Prisma returns JS BigInt values for several admin-only child-table ids.
// Fastify's JSON serializer cannot emit BigInt, so normalize at the route edge.
export function serializeAdminPayload(payload) {
  return JSON.parse(
    JSON.stringify(payload, (_key, value) => (
      typeof value === 'bigint' ? String(value) : value
    )),
  );
}
