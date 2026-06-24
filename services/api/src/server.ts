import { createServer } from 'http'
import app from './app'
import { env } from './config/env'
import { prisma } from './db/client'
import { redis } from './config/redis'
import { connectMongoDB } from './db/mongo.client'
import { initializeSocketServer, setIO } from './realtime/socket.server'

const PORT = env.PORT || 4000

async function startServer() {
    try {
        // ----------------------
        // DB Connections
        // ----------------------
        await prisma.$connect()
        console.log('✅ PostgreSQL connected')

        try {
            await connectMongoDB()
            console.log('✅ MongoDB connected')
        } catch (err) {
            console.warn('⚠️ MongoDB connection failed (non-blocking in dev):', err)
            if (env.NODE_ENV === 'production') {
                throw err
            }
        }

        await redis.connect()
        console.log('✅ Redis connected')

        // ----------------------
        // HTTP + Socket.io Server
        // Boot ORDER is critical:
        //   1. createServer(app)         ← raw Node http server
        //   2. initializeSocketServer()  ← attaches Socket.io + Redis adapter + JWT auth
        //   3. setIO(io)                 ← MUST happen BEFORE listen() — workers call getIO()
        //   4. httpServer.listen()       ← only now is everything ready
        // ----------------------
        const httpServer = createServer(app)

        const io = initializeSocketServer(httpServer)

        // setIO MUST run before httpServer.listen() so any worker that calls
        // getIO() after the server is "up" will never hit the uninitialized guard
        setIO(io)

        httpServer.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`)
            console.log(`🔌 Socket.io listening on same port (WebSocket transport)`)
        })

        // ----------------------
        // Graceful Shutdown — extended to also close Socket.io
        // ----------------------
        const shutdown = async () => {
            console.log('🛑 Shutting down server...')

            // Close Socket.io first so clients get a clean disconnect
            io.close()

            httpServer.close(async () => {
                await prisma.$disconnect()
                redis.disconnect()

                console.log('✅ Cleanup done. Exiting process.')
                process.exit(0)
            })
        }

        process.on('SIGINT', shutdown)
        process.on('SIGTERM', shutdown)
    } catch (error) {
        console.error('❌ Failed to start server:', error)
        process.exit(1)
    }
}

startServer()