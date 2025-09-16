/**
 * Response Formatter Utility
 * Standardizes API responses for web interface
 */

/**
 * Standard success response format
 */
export function successResponse(data = {}, message = 'Success', statusCode = 200) {
    return {
        success: true,
        message,
        timestamp: new Date().toISOString(),
        ...data
    };
}

/**
 * Standard error response format
 */
export function errorResponse(error, message = 'An error occurred', statusCode = 500) {
    const response = {
        success: false,
        message,
        timestamp: new Date().toISOString(),
        error: typeof error === 'string' ? error : error.message
    };

    // Add stack trace in development mode
    if (process.env.NODE_ENV === 'development' && error.stack) {
        response.stack = error.stack;
    }

    return response;
}

/**
 * Chat message response format
 */
export function chatMessageResponse(sessionId, aiResponse, metadata = {}) {
    return successResponse({
        sessionId,
        messageId: metadata.messageId || generateMessageId(),
        message: {
            role: aiResponse.role || 'assistant',
            content: aiResponse.content || '',
            timestamp: new Date().toISOString(),
            toolCalls: aiResponse.tool_calls || []
        },
        metadata: {
            processingTime: metadata.processingTime || 0,
            provider: metadata.provider || 'unknown',
            messageCount: metadata.messageCount || 0,
            hasToolCalls: !!(aiResponse.tool_calls && aiResponse.tool_calls.length > 0),
            ...metadata
        }
    }, 'Message processed successfully');
}

/**
 * Session creation response format
 */
export function sessionCreatedResponse(sessionId, sessionData) {
    return successResponse({
        sessionId,
        metadata: {
            createdAt: sessionData.metadata?.createdAt || new Date().toISOString(),
            sessionType: sessionData.metadata?.sessionType || 'web'
        }
    }, 'Session created successfully', 201);
}

/**
 * Messages list response format
 */
export function messagesListResponse(sessionId, messages, pagination, sessionMetadata) {
    return successResponse({
        sessionId,
        messages: messages.map(formatMessageForResponse),
        pagination,
        metadata: sessionMetadata
    }, 'Messages retrieved successfully');
}

/**
 * Session info response format
 */
export function sessionInfoResponse(sessionId, session, isActive = false) {
    return successResponse({
        sessionId,
        metadata: session.metadata,
        stats: {
            messageCount: session.metadata?.messageCount || 0,
            createdAt: session.metadata?.createdAt,
            lastActivity: session.metadata?.lastActivity,
            sessionType: session.metadata?.sessionType || 'web'
        },
        isActive
    }, 'Session retrieved successfully');
}

/**
 * Health check response format
 */
export function healthCheckResponse(services, ai, stats) {
    const allHealthy = Object.values(services).every(status => status === 'healthy');

    return {
        success: true,
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        services,
        ai,
        stats
    };
}

/**
 * Streaming event formats for Server-Sent Events
 */
export const StreamingEvents = {
    start: (sessionId, metadata = {}) => ({
        event: 'start',
        data: {
            sessionId,
            timestamp: new Date().toISOString(),
            message: 'Processing your message...',
            ...metadata
        }
    }),

    chunk: (sessionId, content, chunkIndex, isLast = false) => ({
        event: 'chunk',
        data: {
            sessionId,
            chunkIndex,
            content,
            isLast,
            timestamp: new Date().toISOString()
        }
    }),

    complete: (sessionId, metadata = {}) => ({
        event: 'complete',
        data: {
            sessionId,
            messageId: metadata.messageId || generateMessageId(),
            processingTime: metadata.processingTime || 0,
            provider: metadata.provider || 'unknown',
            messageCount: metadata.messageCount || 0,
            toolCalls: metadata.toolCalls || [],
            timestamp: new Date().toISOString()
        }
    }),

    error: (sessionId, error) => ({
        event: 'error',
        data: {
            sessionId,
            error: typeof error === 'string' ? error : error.message,
            timestamp: new Date().toISOString()
        }
    }),

    toolCall: (sessionId, toolCall, status = 'executing') => ({
        event: 'tool_call',
        data: {
            sessionId,
            toolCall: {
                id: toolCall.id,
                function: toolCall.function?.name,
                arguments: toolCall.function?.arguments,
                status
            },
            timestamp: new Date().toISOString()
        }
    })
};

/**
 * Format a single message for API response
 */
function formatMessageForResponse(message, index = 0) {
    return {
        id: message.id || generateMessageId(),
        role: message.role,
        content: message.content || '',
        timestamp: message.timestamp || new Date().toISOString(),
        index,
        toolCalls: message.tool_calls || []
    };
}

/**
 * Generate a unique message ID
 */
function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validation error response
 */
export function validationErrorResponse(errors) {
    return errorResponse(
        'Validation failed',
        'Request validation failed',
        400
    );
}

/**
 * Not found response
 */
export function notFoundResponse(resource = 'Resource') {
    return errorResponse(
        `${resource} not found`,
        `${resource} not found`,
        404
    );
}

/**
 * Rate limit response
 */
export function rateLimitResponse(retryAfter = 60) {
    return {
        success: false,
        message: 'Rate limit exceeded',
        timestamp: new Date().toISOString(),
        error: 'Too many requests',
        retryAfter
    };
}

/**
 * Express middleware for consistent error handling
 */
export function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || err.status || 500;
    const response = errorResponse(err, err.message || 'Internal server error', statusCode);

    res.status(statusCode).json(response);
}

/**
 * Express middleware for 404 handling
 */
export function notFoundHandler(req, res) {
    const response = notFoundResponse('Endpoint');
    res.status(404).json(response);
}

export default {
    successResponse,
    errorResponse,
    chatMessageResponse,
    sessionCreatedResponse,
    messagesListResponse,
    sessionInfoResponse,
    healthCheckResponse,
    StreamingEvents,
    validationErrorResponse,
    notFoundResponse,
    rateLimitResponse,
    errorHandler,
    notFoundHandler
};