import dotenv from 'dotenv'
import cors from 'cors'
dotenv.config()
import express from 'express'
import bodyParser from 'body-parser'
import logger from './utils/logger.js'
import DBService from './services/DBService.js'
import agentController from './controllers/Agent.js';
import WebChatController from './controllers/WebChatController.js';
import { errorHandler, notFoundHandler } from './utils/responseFormatter.js';
import {
    cancelBooking,
    updateCatalog,
    notify,
    triggerExceptionOnLocation,
    updateStatus,
    unpublishItem,
    webhookControl
} from './controllers/ControlCenter.js'
import path from 'path'
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express()

// Configure trust proxy for proper client IP detection
app.set('trust proxy', true)

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}))

// Body parsing middleware
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json({ limit: '10mb' }))

// Static file serving
app.use('/public', express.static(path.join(__dirname, 'public')))

// Initialize Web Chat Controller
const webChatController = new WebChatController()

// ===== LEGACY ENDPOINTS (WhatsApp/Twilio Integration) =====
app.post('/webhook', agentController.getResponse)
app.post('/notify', notify)
app.post('/cancel-booking', cancelBooking)
app.post('/update-catalog', updateCatalog)
app.post('/trigger-exception', triggerExceptionOnLocation)
app.post('/update-status', updateStatus)
app.post('/unpublish-item', unpublishItem)
app.post('/webhook-ps', webhookControl)

// ===== WEB CHAT API ENDPOINTS =====

// Health check endpoint
app.get('/api/health', async (req, res) => {
    await webChatController.healthCheck(req, res)
})

// Chat session management
app.post('/api/chat/sessions', async (req, res) => {
    await webChatController.createSession(req, res)
})

app.get('/api/chat/sessions/:sessionId', async (req, res) => {
    await webChatController.getSession(req, res)
})

app.delete('/api/chat/sessions/:sessionId', async (req, res) => {
    await webChatController.deleteSession(req, res)
})

// Message handling
app.post('/api/chat/sessions/:sessionId/messages', async (req, res) => {
    await webChatController.sendMessage(req, res)
})

app.get('/api/chat/sessions/:sessionId/messages', async (req, res) => {
    await webChatController.getMessages(req, res)
})

// Server-Sent Events streaming endpoint
app.get('/api/chat/sessions/:sessionId/stream', async (req, res) => {
    // Set streaming headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    })

    // Keep connection alive
    const keepAlive = setInterval(() => {
        res.write(': heartbeat\n\n')
    }, 30000)

    // Handle connection close
    req.on('close', () => {
        clearInterval(keepAlive)
        res.end()
    })

    // Send initial connection event
    res.write('event: connected\n')
    res.write(`data: {"sessionId": "${req.params.sessionId}", "timestamp": "${new Date().toISOString()}"}\n\n`)
})

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
    res.json({
        name: 'Beckn Action Bot Web API',
        version: '1.0.0',
        description: 'REST API for web-based chat interface with AI and Beckn protocol integration',
        endpoints: {
            health: 'GET /api/health',
            sessions: {
                create: 'POST /api/chat/sessions',
                get: 'GET /api/chat/sessions/:sessionId',
                delete: 'DELETE /api/chat/sessions/:sessionId'
            },
            messages: {
                send: 'POST /api/chat/sessions/:sessionId/messages',
                getHistory: 'GET /api/chat/sessions/:sessionId/messages',
                stream: 'GET /api/chat/sessions/:sessionId/stream (SSE)'
            }
        },
        features: [
            'ChatGPT-like streaming responses',
            'Session persistence with Redis',
            'Tool calling (routes, Beckn transactions)',
            'Multi-provider AI support (OpenAI/LlamaEdge)',
            'Server-Sent Events for real-time updates'
        ]
    })
})

// ===== ERROR HANDLING MIDDLEWARE =====

// 404 handler for unknown routes
app.use(notFoundHandler)

// Global error handler
app.use(errorHandler)

// ===== DATABASE INITIALIZATION =====
export const db = new DBService()

// Clear all sessions on startup (optional - comment out for production)
if (process.env.NODE_ENV !== 'production') {
    await db.clear_all_sessions()
    logger.info('Development mode: Cleared all sessions on startup')
}

// ===== CLEANUP AND MAINTENANCE =====

// Periodic cleanup of inactive streams
setInterval(() => {
    webChatController.cleanup()
}, 5 * 60 * 1000) // Every 5 minutes

// Graceful shutdown handling
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...')

    // Cleanup active streams
    webChatController.cleanup()

    // Close database connections
    db.redisClient.quit()

    process.exit(0)
})

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...')

    // Cleanup active streams
    webChatController.cleanup()

    // Close database connections
    db.redisClient.quit()

    process.exit(0)
})

// ===== START SERVER =====
const PORT = process.env.SERVER_PORT || 3001

app.listen(PORT, () => {
    logger.info(`🚀 Beckn Action Bot Server running on port ${PORT}`)
    logger.info(`📡 Web Chat API available at http://localhost:${PORT}/api/`)
    logger.info(`📚 API Documentation: http://localhost:${PORT}/api/docs`)
    logger.info(`🏥 Health Check: http://localhost:${PORT}/api/health`)

    if (process.env.AI_PROVIDER) {
        logger.info(`🤖 AI Provider: ${process.env.AI_PROVIDER}`)
    }
})

export default app
