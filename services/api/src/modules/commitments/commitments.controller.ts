import { Request, Response, NextFunction } from 'express'
import { commitmentsService } from './commitments.service'

export const commitmentsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = req.user!.teamId!
      const result = await commitmentsService.listCommitments(teamId, req.query as any)
      res.json({
        data: result.items,
        meta: {
          nextCursor: result.nextCursor,
          counts: result.counts
        }
      })
    } catch (err) {
      next(err)
    }
  },

  async my(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = req.user!.teamId!
      const userId = req.user!.id
      const result = await commitmentsService.getMyCommitments(userId, teamId, req.query as any)
      res.json({
        data: result.items,
        meta: {
          nextCursor: result.nextCursor,
          counts: result.counts,
          summary: result.summary
        }
      })
    } catch (err) {
      next(err)
    }
  },

  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = req.user!.teamId!
      const result = await commitmentsService.getCommitmentStats(teamId, req.query as any)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },

  async detail(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = req.user!.teamId!
      const result = await commitmentsService.getCommitmentDetail(req.params.id as string, teamId)
      if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Commitment not found' })
      res.json({ data: result })
    } catch (err) {
      next(err)
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = req.user!.teamId!
      const userId = req.user!.id
      const role = req.user!.role
      
      const result = await commitmentsService.updateCommitmentStatus(
        req.params.id as string,
        teamId,
        userId,
        role,
        req.body
      )
      
      res.json({ data: result })
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND', message: 'Commitment not found' })
      if (err.message === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only update your own commitments' })
      if (err.message === 'INVALID_TRANSITION' || err.message === 'VALIDATION_ERROR') {
        return res.status(422).json({ error: 'VALIDATION_ERROR', message: err.message })
      }
      next(err)
    }
  }
}
