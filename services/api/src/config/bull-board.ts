import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter }   from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter }  from '@bull-board/express'
import { Express } from 'express'
import { transcribeQueue, extractQueue, notifyQueue, integrateQueue, deadlineQueue } from '../queues/queue.client'

export function setupBullBoard(app: Express) {
  if (process.env.NODE_ENV === 'production') return

  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath('/admin/queues')

  createBullBoard({
    queues: [
      new BullMQAdapter(transcribeQueue),
      new BullMQAdapter(extractQueue),
      new BullMQAdapter(notifyQueue),
      new BullMQAdapter(integrateQueue),
      new BullMQAdapter(deadlineQueue),
    ],
    serverAdapter,
  })

  app.use('/admin/queues', (req, res, next) => {
    const auth = req.headers.authorization
    if (auth !== `Bearer ${process.env.BULL_BOARD_SECRET ?? 'dev-secret'}`) {
      res.status(401).send('Unauthorized')
      return
    }
    next()
  }, serverAdapter.getRouter())
}
