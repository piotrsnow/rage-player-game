import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { config } from '../config.js';

export const authPlugin = fp(async function (fastify) {
  await fastify.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  fastify.decorate('authenticate', async (request, reply) => {
    try {
      const queryToken = request.query?.token;
      if (queryToken && !request.headers.authorization) {
        request.headers.authorization = `Bearer ${queryToken}`;
      }
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: err.message });
    }
  });
});
