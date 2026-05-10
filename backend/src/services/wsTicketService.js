import { randomUUID } from 'crypto';

const TICKET_TTL_MS = 30_000;
const CLEANUP_INTERVAL_MS = 60_000;

const tickets = new Map();
let cleanupTimer = null;

export function issueWsTicket(userId) {
  const ticket = randomUUID();
  tickets.set(ticket, { userId, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

export function redeemWsTicket(ticket) {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket);
  if (entry.expiresAt < Date.now()) return null;
  return { userId: entry.userId };
}

export function startWsTicketCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of tickets) {
      if (val.expiresAt < now) tickets.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function stopWsTicketCleanup() {
  clearInterval(cleanupTimer);
  cleanupTimer = null;
}
