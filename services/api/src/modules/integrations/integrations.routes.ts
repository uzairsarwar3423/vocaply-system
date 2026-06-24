import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { requireRole } from '../../middleware/role.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
    listIntegrationsController,
    connectController,
    callbackController,
    disconnectController,
    testConnectionController
} from './integrations.controller'
import { providerParamSchema, callbackQuerySchema } from './integrations.validator'

const router = Router()

router.get('/', requireAuth, injectTenant, listIntegrationsController)

router.get(
    '/:provider/connect',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(providerParamSchema),
    connectController
)

router.get(
    '/:provider/callback',
    validate(callbackQuerySchema),
    callbackController
)

router.delete(
    '/:provider',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(providerParamSchema),
    disconnectController
)

router.post(
    '/:provider/test',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(providerParamSchema),
    testConnectionController
)

export const integrationsRouter = router
