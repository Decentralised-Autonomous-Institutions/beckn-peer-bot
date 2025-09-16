import { v4 as uuidv4 } from 'uuid';
import AI from '../services/AI.js';
import DBService from '../services/DBService.js';
import MapService from '../services/MapService.js';
import ModelController from './ModelController.js';
import logger from '../utils/logger.js';
import { EMPTY_SESSION } from '../config/constants.js';

/**
 * Web Chat Controller
 * Handles web-based chat interactions, adapting Agent.js logic for REST API format
 */
class WebChatController {
    constructor() {
        this.db = new DBService();
        this.activeStreams = new Map(); // Track active SSE connections
    }

    /**
     * Create a new chat session
     * POST /api/chat/sessions
     */
    async createSession(req, res) {
        try {
            const sessionId = uuidv4();
            const userAgent = req.get('User-Agent') || 'Unknown';
            const clientIP = req.ip || req.connection.remoteAddress || 'Unknown';

            // Create enhanced session with metadata
            const sessionData = {
                ...EMPTY_SESSION,
                metadata: {
                    sessionId,
                    createdAt: new Date().toISOString(),
                    userAgent,
                    clientIP,
                    lastActivity: new Date().toISOString(),
                    messageCount: 0,
                    sessionType: 'web'
                }
            };

            // Save session to database
            const saveResult = await this.db.update_session(sessionId, sessionData);

            if (!saveResult.status) {
                throw new Error('Failed to create session in database');
            }

            logger.info(`Created new web session: ${sessionId} from ${clientIP}`);

            res.status(201).json({
                success: true,
                sessionId,
                message: 'Session created successfully',
                metadata: {
                    createdAt: sessionData.metadata.createdAt,
                    sessionType: 'web'
                }
            });

        } catch (error) {
            logger.error('Failed to create session:', error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to create session',
                message: error.message
            });
        }
    }

    /**
     * Send a message to an existing session
     * POST /api/chat/sessions/:sessionId/messages
     */
    async sendMessage(req, res) {
        try {
            const { sessionId } = req.params;
            const { message, stream = false } = req.body;

            // Validate input
            if (!message || typeof message !== 'string' || message.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Message is required and must be a non-empty string'
                });
            }

            // Get session from database
            const sessionResponse = await this.db.get_session(sessionId);
            if (!sessionResponse.status) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            let session = sessionResponse.data;

            // Initialize AI services (similar to Agent.js)
            const ai = new AI();
            const map = new MapService();
            ai.session = map.session = session;

            // Setup tools
            const available_tools = {
                get_routes: map.getRoutes.bind(map),
                select_route: map.selectRoute.bind(map),
                perform_beckn_action: ai.perform_beckn_transaction.bind(ai),
            };
            ai.tools = available_tools;

            // Build message history
            let messages = [
                ...session.text,
                { role: 'user', content: message.trim() }
            ];

            const startTime = Date.now();

            // Handle streaming vs non-streaming responses
            if (stream) {
                return this._handleStreamingResponse(req, res, ai, messages, session, sessionId, startTime);
            } else {
                return this._handleRegularResponse(res, ai, messages, session, sessionId, startTime);
            }

        } catch (error) {
            logger.error('Failed to process message:', error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to process message',
                message: error.message
            });
        }
    }

    /**
     * Handle regular (non-streaming) response
     */
    async _handleRegularResponse(res, ai, messages, session, sessionId, startTime) {
        try {
            // Get AI response
            const aiResponse = await ai.get_response_or_perform_action(messages, false);
            const processingTime = Date.now() - startTime;

            // Update session with new messages
            messages.push(aiResponse);
            session.text = messages;
            session.metadata.lastActivity = new Date().toISOString();
            session.metadata.messageCount += 2; // User message + AI response

            // Save updated session
            await this.db.update_session(sessionId, session);

            // Prepare response
            const response = {
                success: true,
                sessionId,
                messageId: uuidv4(),
                message: {
                    role: aiResponse.role || 'assistant',
                    content: aiResponse.content || '',
                    timestamp: new Date().toISOString()
                },
                metadata: {
                    processingTime,
                    provider: this._getActiveProvider(),
                    messageCount: session.metadata.messageCount,
                    hasToolCalls: !!(aiResponse.tool_calls && aiResponse.tool_calls.length > 0)
                }
            };

            // Add tool call information if present
            if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
                response.toolCalls = aiResponse.tool_calls.map(tool => ({
                    id: tool.id,
                    function: tool.function.name,
                    arguments: tool.function.arguments,
                    status: 'executed'
                }));
            }

            logger.info(`Processed message for session ${sessionId} in ${processingTime}ms`);
            res.json(response);

        } catch (error) {
            logger.error('Error in regular response handling:', error.message);
            throw error;
        }
    }

    /**
     * Handle streaming response using Server-Sent Events
     */
    async _handleStreamingResponse(req, res, ai, messages, session, sessionId, startTime) {
        try {
            // Set up SSE headers
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });

            // Track this connection
            this.activeStreams.set(sessionId, { res, req, startTime });

            // Send initial event
            this._sendSSEEvent(res, 'start', {
                sessionId,
                timestamp: new Date().toISOString(),
                message: 'Processing your message...'
            });

            // Get AI response (for now, we'll send it as chunks)
            const aiResponse = await ai.get_response_or_perform_action(messages, false);
            const processingTime = Date.now() - startTime;

            // Update session
            messages.push(aiResponse);
            session.text = messages;
            session.metadata.lastActivity = new Date().toISOString();
            session.metadata.messageCount += 2;
            await this.db.update_session(sessionId, session);

            // Send response in chunks (simulating streaming)
            const content = aiResponse.content || '';
            const chunks = this._splitIntoChunks(content, 20); // Split into smaller chunks

            for (let i = 0; i < chunks.length; i++) {
                this._sendSSEEvent(res, 'chunk', {
                    sessionId,
                    chunkIndex: i,
                    content: chunks[i],
                    isLast: i === chunks.length - 1
                });

                // Small delay to simulate real streaming
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Send completion event
            this._sendSSEEvent(res, 'complete', {
                sessionId,
                messageId: uuidv4(),
                processingTime,
                provider: this._getActiveProvider(),
                messageCount: session.metadata.messageCount,
                toolCalls: aiResponse.tool_calls || []
            });

            // Clean up
            this.activeStreams.delete(sessionId);
            res.end();

        } catch (error) {
            this._sendSSEEvent(res, 'error', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            });

            this.activeStreams.delete(sessionId);
            res.end();
            throw error;
        }
    }

    /**
     * Get chat history for a session
     * GET /api/chat/sessions/:sessionId/messages
     */
    async getMessages(req, res) {
        try {
            const { sessionId } = req.params;
            const { limit = 50, offset = 0 } = req.query;

            const sessionResponse = await this.db.get_session(sessionId);
            if (!sessionResponse.status) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            const session = sessionResponse.data;
            const messages = session.text || [];

            // Apply pagination
            const startIndex = parseInt(offset);
            const endIndex = startIndex + parseInt(limit);
            const paginatedMessages = messages.slice(startIndex, endIndex);

            // Format messages for frontend
            const formattedMessages = paginatedMessages.map((msg, index) => ({
                id: uuidv4(),
                role: msg.role,
                content: msg.content || '',
                timestamp: msg.timestamp || new Date().toISOString(),
                index: startIndex + index,
                toolCalls: msg.tool_calls || []
            }));

            res.json({
                success: true,
                sessionId,
                messages: formattedMessages,
                pagination: {
                    total: messages.length,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: endIndex < messages.length
                },
                metadata: session.metadata
            });

        } catch (error) {
            logger.error('Failed to get messages:', error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve messages',
                message: error.message
            });
        }
    }

    /**
     * Get session information
     * GET /api/chat/sessions/:sessionId
     */
    async getSession(req, res) {
        try {
            const { sessionId } = req.params;

            const sessionResponse = await this.db.get_session(sessionId);
            if (!sessionResponse.status) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            const session = sessionResponse.data;

            res.json({
                success: true,
                sessionId,
                metadata: session.metadata,
                stats: {
                    messageCount: session.metadata?.messageCount || 0,
                    createdAt: session.metadata?.createdAt,
                    lastActivity: session.metadata?.lastActivity,
                    sessionType: session.metadata?.sessionType || 'web'
                },
                isActive: this.activeStreams.has(sessionId)
            });

        } catch (error) {
            logger.error('Failed to get session:', error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve session',
                message: error.message
            });
        }
    }

    /**
     * Delete a session
     * DELETE /api/chat/sessions/:sessionId
     */
    async deleteSession(req, res) {
        try {
            const { sessionId } = req.params;

            // Close any active streams
            if (this.activeStreams.has(sessionId)) {
                const stream = this.activeStreams.get(sessionId);
                stream.res.end();
                this.activeStreams.delete(sessionId);
            }

            // Delete from database
            const deleteResult = await this.db.delete_session(sessionId);

            if (!deleteResult.status) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            logger.info(`Deleted session: ${sessionId}`);

            res.json({
                success: true,
                message: 'Session deleted successfully',
                sessionId
            });

        } catch (error) {
            logger.error('Failed to delete session:', error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to delete session',
                message: error.message
            });
        }
    }

    /**
     * Health check endpoint
     * GET /api/health
     */
    async healthCheck(req, res) {
        try {
            // Check database connection
            await this.db.get_session('health-check-test');
            const dbHealthy = true; // If we get here, Redis is working

            // Check AI provider
            const modelController = new ModelController();
            const aiHealthy = await modelController.healthCheck();
            const providersInfo = await modelController.getProvidersInfo();

            res.json({
                success: true,
                status: 'healthy',
                timestamp: new Date().toISOString(),
                services: {
                    database: dbHealthy ? 'healthy' : 'unhealthy',
                    ai: aiHealthy ? 'healthy' : 'unhealthy'
                },
                ai: {
                    activeProvider: providersInfo.activeProvider,
                    availableProviders: Object.keys(providersInfo.providers),
                    fallbackEnabled: providersInfo.fallbackEnabled
                },
                stats: {
                    activeStreams: this.activeStreams.size,
                    serverUptime: process.uptime()
                }
            });

        } catch (error) {
            logger.error('Health check failed:', error.message);
            res.status(503).json({
                success: false,
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Helper methods

    /**
     * Send Server-Sent Event
     */
    _sendSSEEvent(res, event, data) {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    /**
     * Split content into chunks for streaming simulation
     */
    _splitIntoChunks(text, chunkSize) {
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks.length > 0 ? chunks : [''];
    }

    /**
     * Get active AI provider name
     */
    _getActiveProvider() {
        try {
            const modelController = new ModelController();
            return modelController.getProviderType();
        } catch (error) {
            return 'unknown';
        }
    }

    /**
     * Clean up inactive streams (call this periodically)
     */
    cleanup() {
        const now = Date.now();
        const timeout = 5 * 60 * 1000; // 5 minutes

        for (const [sessionId, stream] of this.activeStreams.entries()) {
            if (now - stream.startTime > timeout) {
                logger.info(`Cleaning up inactive stream for session: ${sessionId}`);
                stream.res.end();
                this.activeStreams.delete(sessionId);
            }
        }
    }
}

export default WebChatController;