import { Request, Response, NextFunction } from 'express'

// ─────────────────────────────────────────────────────────────────────────────
// ASYNC HANDLER WRAPPER
// Wraps async route handlers so unhandled promise rejections are forwarded
// to the global error middleware via next(err).
//
// Without this, unhandled async errors in Express 4 cause unhandledRejection
// warnings and hang the request without sending a response.
//
// Usage:
//   router.post('/register', validate(schema), asyncHandler(async (req, res) => {
//     const result = await authService.register(req.body)
//     res.status(201).json(success(result))
//   }))
// ─────────────────────────────────────────────────────────────────────────────

type AsyncHandlerFn = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<unknown>

export function asyncHandler(fn: AsyncHandlerFn) {
    return (req: Request, res: Response, next: NextFunction): void => {
        fn(req, res, next).catch(next)
    }
}