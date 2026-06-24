import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),

    PORT: z.coerce.number().default(5000),

    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),

    MONGODB_URL: z.string().min(1),

    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),

    APP_URL: z.string(),
    FRONTEND_URL: z.string().optional(),
    API_URL: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().optional(),

    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    RECALL_API_KEY: z.string().optional(),
    RECALL_WEBHOOK_SECRET: z.string().optional(),

    BREVO_API_KEY: z.string().optional(),
    BREVO_FROM_EMAIL: z.string().optional(),

    JIRA_CLIENT_ID: z.string().min(1),
    JIRA_CLIENT_SECRET: z.string().min(1),
    JIRA_CALLBACK_URL: z.string().min(1),
    JIRA_WEBHOOK_SECRET: z.string().min(1),

    // Day 22: Slack
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    SLACK_SIGNING_SECRET: z.string().optional(),
    SLACK_CALLBACK_URL: z.string().optional(),

    // Day 22: Linear
    LINEAR_CLIENT_ID: z.string().optional(),
    LINEAR_CLIENT_SECRET: z.string().optional(),
    LINEAR_CALLBACK_URL: z.string().optional(),

    // Day 22: Notion
    NOTION_CLIENT_ID: z.string().optional(),
    NOTION_CLIENT_SECRET: z.string().optional(),
    NOTION_CALLBACK_URL: z.string().optional(),

    // Day 22: Google Calendar (distinct callback from Google login)
    GOOGLE_CALENDAR_CALLBACK_URL: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error(
        '❌ Invalid environment variables:',
        parsed.error.flatten().fieldErrors
    )

    process.exit(1)
}

// Trigger tsx watch reload to read updated .env variables
export const env = parsed.data