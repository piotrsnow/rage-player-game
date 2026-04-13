import { prisma } from '../../lib/prisma.js';
import { listJoinableRooms, listUserRooms } from '../../services/roomManager.js';

export async function multiplayerHttpRoutes(fastify) {
  fastify.get('/rooms', { onRequest: [fastify.authenticate] }, async () => {
    return { rooms: listJoinableRooms() };
  });

  fastify.get('/my-sessions', { onRequest: [fastify.authenticate] }, async (request) => {
    const userId = request.user.id;
    const inMemory = listUserRooms(userId);

    if (inMemory.length > 0) return { sessions: inMemory };

    try {
      const dbSessions = await prisma.multiplayerSession.findMany({
        where: { phase: 'playing' },
        select: { roomCode: true, phase: true, players: true, settings: true, gameState: true, updatedAt: true },
      });

      const userSessions = [];
      for (const session of dbSessions) {
        const players = JSON.parse(session.players || '[]');
        const match = players.find((p) => p.userId === userId);
        if (!match) continue;
        const settings = JSON.parse(session.settings || '{}');
        const gameState = JSON.parse(session.gameState || '{}');
        const hostPlayer = players.find((p) => p.isHost);
        userSessions.push({
          roomCode: session.roomCode,
          phase: session.phase,
          hostName: hostPlayer?.name || 'Host',
          campaignName: gameState?.campaign?.name || settings?.genre || 'Campaign',
          playerCount: players.length,
          myOdId: match.odId,
          isHost: match.isHost,
        });
      }
      return { sessions: userSessions };
    } catch (err) {
      fastify.log.warn(err, 'Failed to load multiplayer sessions from database');
      return { sessions: [] };
    }
  });
}
