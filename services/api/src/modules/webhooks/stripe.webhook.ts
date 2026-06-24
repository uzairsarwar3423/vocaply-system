import Stripe from 'stripe'
import { Request, Response } from 'express'
import { logger } from '../../config/logger'
import { redis } from '../../config/redis'
import { prisma } from '../../db/client'
import { notifyQueue } from '../../queues/queue.client'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', { apiVersion: '2024-06-20' as any })

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'] as string
  let event: any

  try {
    event = stripe.webhooks.constructEvent(
      (req as any).rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    logger.warn({ err }, 'Stripe webhook signature verification failed')
    res.status(400).json({ received: false, error: 'Invalid Stripe signature' })
    return
  }

  const idempotencyKey = `webhook:processed:stripe:${event.id}`
  const isNew = await redis.set(idempotencyKey, '1', 'EX', 86400, 'NX')
  if (!isNew) {
    logger.info({ eventId: event.id }, 'Stripe webhook already processed — skipping')
    res.status(200).json({ received: true })
    return
  }

  res.status(200).json({ received: true })

  const obj = event.data.object as any

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        break
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await handleSubscriptionUpdated(obj)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(obj)
        break
      case 'invoice.payment_succeeded':
        logger.info({ invoiceId: obj.id }, 'Stripe payment succeeded')
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(obj)
        break
    }
  } catch (err) {
    logger.error({ eventType: event.type, err }, 'Error processing Stripe webhook')
  }
}

async function handleSubscriptionUpdated(sub: any): Promise<void> {
  const priceId = sub.items.data[0]?.price.id ?? ''
  const plan    = mapPriceIdToPlan(priceId)

  await prisma.team.update({
    where: { stripeCustomerId: sub.customer as string },
    data:  {
      plan,
      stripeSubId:        sub.id,
      billingCycleStart:  new Date(sub.current_period_start * 1000),
      billingCycleEnd:    new Date(sub.current_period_end   * 1000),
      meetingsUsed:       0, // Combined update
    },
  })

  const team = await prisma.team.findFirst({ where: { stripeCustomerId: sub.customer as string } })
  if (team) await redis.del(`cache:team:plan:${team.id}`)
}

async function handleSubscriptionCancelled(sub: any): Promise<void> {
  await prisma.team.update({
    where: { stripeSubId: sub.id },
    data:  { plan: 'FREE', stripeSubId: null },
  })
}

async function handlePaymentFailed(invoice: any): Promise<void> {
  logger.warn({ invoiceId: invoice.id, customerId: invoice.customer }, 'Stripe payment failed')

  const team = await prisma.team.findFirst({ where: { stripeCustomerId: invoice.customer as string } })
  if (!team) {
    logger.warn({ customerId: invoice.customer }, 'Payment failed for unknown Stripe customer — skipping')
    return
  }

  // Route through the same notify queue as meeting notifications (spec requirement)
  await notifyQueue.add('payment-failed', {
    type:    'PAYMENT_FAILED',
    teamId:  team.id,
  })

  logger.info({ teamId: team.id }, 'Payment failed notification queued')
}

function mapPriceIdToPlan(priceId: string): any {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'PRO'
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'ENTERPRISE'
  return 'FREE'
}
