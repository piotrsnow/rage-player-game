import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';

const CREDIT_PACKAGES = [200, 500, 1000, 2500];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 10000;

function getStripe() {
  if (!config.stripe.secretKey) {
    throw { statusCode: 503, message: 'Stripe is not configured' };
  }
  return new Stripe(config.stripe.secretKey);
}

async function getOrCreateStripeCustomer(stripe, user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

// Idempotent fulfillment — checks session metadata `fulfilled` flag in
// Stripe to prevent double-crediting when both webhook and verify fire.
async function fulfillSession(stripe, session, log) {
  if (session.payment_status !== 'paid') return false;
  if (session.metadata?.fulfilled === 'true') return false;

  const userId = session.metadata?.userId;
  const amountCents = parseInt(session.metadata?.amountCents, 10);
  if (!userId || !amountCents || amountCents <= 0) {
    log?.warn({ sessionId: session.id }, 'Session missing metadata');
    return false;
  }

  // Mark fulfilled in Stripe BEFORE crediting — if the DB update fails
  // we lose the credit (safe), but we never double-credit.
  await stripe.checkout.sessions.update(session.id, {
    metadata: { ...session.metadata, fulfilled: 'true' },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: amountCents } },
  });
  log?.info({ userId, amountCents, sessionId: session.id }, 'Credits added');
  return true;
}

// Authed routes: GET /, POST /checkout, POST /verify
export async function creditsRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { credits: true },
    });
    if (!user) throw { statusCode: 404, message: 'User not found' };
    return { credits: user.credits, packages: CREDIT_PACKAGES };
  });

  fastify.post('/checkout', {
    schema: {
      body: {
        type: 'object',
        required: ['amountCents'],
        properties: {
          amountCents: { type: 'integer', minimum: MIN_AMOUNT, maximum: MAX_AMOUNT },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { amountCents } = request.body;
    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const customerId = await getOrCreateStripeCustomer(stripe, user);

    const origin = request.headers.origin || request.headers.referer?.replace(/\/+$/, '') || config.corsOrigin;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: `${(amountCents / 100).toFixed(2)} USD — RPGon Credits` },
        },
        quantity: 1,
      }],
      invoice_creation: { enabled: true },
      metadata: { userId: user.id, amountCents: String(amountCents) },
      success_url: `${origin}/?credits=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?credits=cancel`,
    });

    return { url: session.url };
  });

  // Called by FE on return from Stripe — retrieves the session directly
  // from Stripe API and fulfills it if paid. Works without webhooks
  // (local dev) and as immediate confirmation (prod).
  fastify.post('/verify', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { sessionId } = request.body;
    const stripe = getStripe();

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return reply.code(400).send({ error: 'Invalid session' });
    }

    // Only the session owner can verify their own purchase
    if (session.metadata?.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Session does not belong to this user' });
    }

    const credited = await fulfillSession(stripe, session, request.log);

    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { credits: true },
    });

    return { credits: user?.credits ?? 0, credited };
  });

  // Requires Customer Portal enabled in Stripe Dashboard:
  // Settings → Customer portal → enable + check "Invoice history".
  fastify.post('/billing-portal', async (request, reply) => {
    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const customerId = await getOrCreateStripeCustomer(stripe, user);
    const origin = request.headers.origin || request.headers.referer?.replace(/\/+$/, '') || config.corsOrigin;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: origin,
    });

    return { url: portalSession.url };
  });
}

// Webhook route — registered separately (no auth, raw body).
// Backup fulfillment path — primary is POST /verify on redirect.
export async function creditsWebhookRoute(fastify) {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  fastify.post('/webhook', async (request, reply) => {
    const stripe = getStripe();
    const sig = request.headers['stripe-signature'];
    if (!sig) return reply.code(400).send({ error: 'Missing stripe-signature' });

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        config.stripe.webhookSecret,
      );
    } catch (err) {
      request.log.warn({ err }, 'Stripe webhook signature verification failed');
      return reply.code(400).send({ error: 'Invalid signature' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      await fulfillSession(stripe, session, request.log);
    }

    return { received: true };
  });
}
