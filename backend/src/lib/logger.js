import pino from 'pino';

/**
 * Shared pino logger instance.
 *
 * Services (roomManager, sceneGenerator, etc.) import this directly
 * instead of reaching for `fastify.log` or `console.*`. Route handlers
 * still use `request.log` / `fastify.log` — those are the same pino
 * instance under the hood because we hand this logger to Fastify in
 * server.js.
 *
 * Log level is controlled by LOG_LEVEL env var ('trace' | 'debug' |
 * 'info' | 'warn' | 'error' | 'fatal'). Defaults: info in production,
 * debug in development.
 *
 * Output is always JSON. For human-readable dev logs, pipe through
 * pino-pretty in the npm script:
 *   "dev": "node --watch src/server.js | pino-pretty"
 * Don't configure pino-pretty as a transport here — it pulls in a
 * worker thread and fails hard when the package isn't installed
 * (e.g. in test runs that import this module).
 */

const isProduction = process.env.NODE_ENV === 'production';
const defaultLevel = isProduction ? 'info' : 'debug';

export const logger = pino({
  level: process.env.LOG_LEVEL || defaultLevel,
});

/**
 * Build a child logger with bound context. Use this in services that
 * handle a specific room, user, or campaign so every log line carries
 * the correlation keys automatically.
 *
 *   const log = childLogger({ roomCode, userId });
 *   log.warn({ err }, 'failed to save room');
 */
export function childLogger(bindings) {
  return logger.child(bindings);
}
