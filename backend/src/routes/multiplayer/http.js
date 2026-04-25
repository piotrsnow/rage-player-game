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
        where: { phase: 'playing', players: { some: { userId } } },
        select: {
          roomCode: true, phase: true, settings: true, gameState: true, updatedAt: true,
          players: { select: { odId: true, name: true, userId: true, isHost: true } },
        },
      });

      const userSessions = dbSessions.map((session) => {
        const players = session.players || [];
        const match = players.find((p) => p.userId === userId);
        const hostPlayer = players.find((p) => p.isHost);
        const settings = session.settings || {};
        const gameState = session.gameState || {};
        return {
          roomCode: session.roomCode,
          phase: session.phase,
          hostName: hostPlayer?.name || 'Host',
          campaignName: gameState?.campaign?.name || settings?.genre || 'Campaign',
          playerCount: players.length,
          myOdId: match?.odId,
          isHost: !!match?.isHost,
        };
      });
      return { sessions: userSessions };
    } catch (err) {
      fastify.log.warn(err, 'Failed to load multiplayer sessions from database');
      return { sessions: [] };
    }
  });
}
