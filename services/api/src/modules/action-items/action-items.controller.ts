import { actionItemsService } from './action-items.service'
import { success } from '../../utils/response'
import { asyncHandler } from '../../utils/async-handler'
import { AppError } from '../../utils/errors'

export const actionItemsController = {
  /**
   * GET /api/v1/action-items
   * List all action items for the team.
   */
  listActionItems: asyncHandler(async (req, res) => {
    const result = await actionItemsService.listActionItems(req.teamId!, req.query as any)
    const { items, nextCursor, counts } = result

    const meta = {
      hasMore: !!nextCursor,
      nextCursor: nextCursor || null,
      count: items.length,
      counts
    }

    res.status(200).json(success(items, meta as any))
  }),

  /**
   * GET /api/v1/action-items/my
   * List action items assigned to the current user.
   */
  getMyActionItems: asyncHandler(async (req, res) => {
    const query = {
      ...req.query,
      assigneeId: req.user!.id
    }
    const result = await actionItemsService.listActionItems(req.teamId!, query as any)
    const { items, nextCursor, counts } = result

    const meta = {
      hasMore: !!nextCursor,
      nextCursor: nextCursor || null,
      count: items.length,
      counts
    }

    res.status(200).json(success(items, meta as any))
  }),

  /**
   * PATCH /api/v1/action-items/:actionItemId
   * Update an action item.
   */
  updateActionItem: asyncHandler(async (req, res) => {
    const actionItemId = req.params.actionItemId as string
    const result = await actionItemsService.updateActionItem(
      actionItemId,
      req.teamId!,
      req.user!.id,
      req.user!.role,
      req.body
    )
    res.status(200).json(success(result))
  }),

  /**
   * POST /api/v1/action-items/:actionItemId/sync
   * Trigger downstream sync for an action item.
   */
  syncActionItem: asyncHandler(async (req, res) => {
    const actionItemId = req.params.actionItemId as string
    const { provider } = req.body
    const idempotencyKey = req.headers['x-idempotency-key'] as string

    if (!idempotencyKey) {
      throw new AppError(
        'MISSING_IDEMPOTENCY_KEY',
        400,
        'X-Idempotency-Key header is required for sync operations'
      )
    }

    const result = await actionItemsService.syncActionItem(
      actionItemId,
      req.teamId!,
      req.user!.id,
      provider,
      idempotencyKey
    )

    res.status(202).json(success(result))
  })

}
