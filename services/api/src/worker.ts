import './config/env'
import { prisma } from './db/client'
import { redis } from './config/redis'
import { connectMongoDB } from './db/mongo.client'

// Import all workers so they get instantiated and start listening
import './queues/workers/transcribe.worker'
import './queues/workers/extract.worker'
import './queues/workers/notify.worker'
import './queues/workers/integrate.worker'
import './queues/workers/deadline.worker'
import './queues/workers/calendar.worker'
import { startScheduler } from './queues/scheduler'

async function startWorkers() {
    try {
        await prisma.$connect()
        console.log('✅ PostgreSQL connected (Worker)')

        try {
            await connectMongoDB()
            console.log('✅ MongoDB connected (Worker)')
        } catch (err) {
            console.warn('⚠️ MongoDB connection failed (non-blocking in dev):', err)
        }

        await redis.connect()
        console.log('✅ Redis connected (Worker)')

        console.log('👷 BullMQ Workers started successfully!')
        
        startScheduler()
        
        // ----------------------
        // Graceful Shutdown
        // ----------------------
        const shutdown = async () => {
            console.log('🛑 Shutting down workers...')
            await prisma.$disconnect()
            redis.disconnect()
            console.log('✅ Cleanup done. Exiting process.')
            process.exit(0)
        }

        process.on('SIGINT', shutdown)
        process.on('SIGTERM', shutdown)
    } catch (error) {
        console.error('❌ Failed to start workers:', error)
        process.exit(1)
    }
}

startWorkers()
