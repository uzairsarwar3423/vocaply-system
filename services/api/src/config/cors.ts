// services/api/src/config/cors.ts

import cors, { CorsOptions } from 'cors'

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.WEB_APP_URL,
    process.env.ADMIN_APP_URL,
].filter(Boolean)

const previewPatterns = [
    /^https:\/\/.*\.vercel\.app$/,
    /^https:\/\/.*\.netlify\.app$/,
]

const corsOptions: CorsOptions = {
    origin(origin, callback) {
        // Postman, curl, mobile apps
        if (!origin) {
            return callback(null, true)
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true)
        }

        const isPreviewDeployment = previewPatterns.some((pattern) =>
            pattern.test(origin)
        )

        if (isPreviewDeployment) {
            return callback(null, true)
        }

        callback(new Error(`CORS blocked for origin: ${origin}`))
    },

    credentials: true,

    methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
    ],

    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Team-Id',
        'X-Request-Id',
    ],

    exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
    ],

    maxAge: 86400,
}

export const corsMiddleware = cors(corsOptions)