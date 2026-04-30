// Shared AJV/Fastify validation patterns.
//
// UUID_PATTERN matches RFC 4122 / RFC 9562 UUIDs (v1..v8 + nil, case-insensitive).
// Used for body/query params referencing Postgres `@db.Uuid` columns — notably
// `campaignId` on media and proxy routes (Campaign.id is uuid(7) in schema.prisma).
export const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
