import { Router } from 'express'
import { actionItemsController } from './action-items.controller'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
  listActionItemsSchema,
  updateActionItemSchema,
  syncActionItemSchema,
} from './action-items.validator'

const router = Router()

// All action items routes require authentication and tenant isolation
router.use(requireAuth)
router.use(injectTenant)

/**
 * GET /api/v1/action-items
 * List action items for the team with filters.
 */
router.get('/', validate({ query: listActionItemsSchema }), actionItemsController.listActionItems)

/**
 * GET /api/v1/action-items/my
 * List action items assigned to current user.
 */
router.get('/my', validate({ query: listActionItemsSchema }), actionItemsController.getMyActionItems)

/**
 * PATCH /api/v1/action-items/:actionItemId
 * Update an action item completion, assignee, text, or priority.
 */
router.patch('/:actionItemId', validate({ body: updateActionItemSchema }), actionItemsController.updateActionItem)

/**
 * POST /api/v1/action-items/:actionItemId/sync
 * Sync action item with downstream provider (Jira/Linear/Notion).
 */
router.post('/:actionItemId/sync', validate({ body: syncActionItemSchema }), actionItemsController.syncActionItem)


export const actionItemsRouter = router
