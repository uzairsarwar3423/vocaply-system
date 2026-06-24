import { Router } from 'express'
import { commitmentsController } from './commitments.controller'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { requireRole } from '../../middleware/role.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
  listCommitmentsSchema,
  updateCommitmentStatusSchema,
  teamStatsSchema
} from './commitments.validator'

const router = Router()

// All commitment routes require auth and a valid team
router.use(requireAuth, injectTenant)

/**
 * GET /api/v1/commitments
 * List team commitments with advanced filters
 */
router.get(
  '/',
  validate({ query: listCommitmentsSchema }),
  commitmentsController.list
)

/**
 * GET /api/v1/commitments/my
 * List current user's commitments
 */
router.get(
  '/my',
  validate({ query: listCommitmentsSchema }),
  commitmentsController.my
)

/**
 * GET /api/v1/commitments/stats
 * Team statistics (Managers & above only)
 */
router.get(
  '/stats',
  requireRole('MANAGER'),
  validate({ query: teamStatsSchema }),
  commitmentsController.stats
)

/**
 * GET /api/v1/commitments/:id
 * Single commitment detail
 */
router.get(
  '/:id',
  commitmentsController.detail
)

/**
 * PATCH /api/v1/commitments/:id/status
 * Update commitment status
 */
router.patch(
  '/:id/status',
  validate({ body: updateCommitmentStatusSchema }),
  commitmentsController.updateStatus
)

export const commitmentsRouter = router
