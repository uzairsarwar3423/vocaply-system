import 'express'
import { UserRole } from '@prisma/client'

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string
                teamId: string | null
                role: UserRole
                email: string
            }
            teamId?: string | null
        }
    }
}

export { }