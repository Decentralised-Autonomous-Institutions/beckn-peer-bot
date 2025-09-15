// LlamaEdge Configuration for Beckn Action Bot
// This file contains default configurations and helper functions for LlamaEdge integration

export const LLAMAEDGE_DEFAULTS = {
    // API Configuration
    API_URL: process.env.LLAMAEDGE_API_URL || 'http://localhost:8080',
    MODEL_NAME: process.env.LLAMAEDGE_MODEL_NAME || 'llama-2-7b-chat',

    // Model Parameters
    CONTEXT_SIZE: parseInt(process.env.LLAMAEDGE_CONTEXT_SIZE) || 4096,
    BATCH_SIZE: parseInt(process.env.LLAMAEDGE_BATCH_SIZE) || 512,
    TEMPERATURE: parseFloat(process.env.LLAMAEDGE_TEMPERATURE) || 0.7,

    // API Endpoints
    ENDPOINTS: {
        CHAT_COMPLETIONS: '/v1/chat/completions',
        MODELS: '/v1/models',
        EMBEDDINGS: '/v1/embeddings'
    },

    // Request timeouts (in milliseconds)
    TIMEOUT: {
        CHAT: 120000,    // 2 minutes for chat completions
        EMBEDDING: 30000, // 30 seconds for embeddings
        HEALTH: 5000     // 5 seconds for health checks
    },

    // Retry configuration
    RETRY: {
        MAX_ATTEMPTS: 3,
        DELAY_MS: 1000,
        BACKOFF_FACTOR: 2
    }
};

// Prompt templates for different models
export const PROMPT_TEMPLATES = {
    'llama-2-chat': {
        system: '<s>[INST] <<SYS>>\n{system_message}\n<</SYS>>\n\n',
        user: '{user_message} [/INST]',
        assistant: ' {assistant_message} </s><s>[INST] ',
        format: 'llama2'
    },

    'mistral-instruct': {
        system: '<s>[INST] {system_message}\n',
        user: '{user_message} [/INST]',
        assistant: ' {assistant_message}</s> [INST] ',
        format: 'mistral'
    },

    'codellama-instruct': {
        system: '[INST] <<SYS>>\n{system_message}\n<</SYS>>\n\n',
        user: '{user_message} [/INST]',
        assistant: ' {assistant_message} [INST] ',
        format: 'codellama'
    },

    'default': {
        system: 'System: {system_message}\n',
        user: 'User: {user_message}\n',
        assistant: 'Assistant: {assistant_message}\n',
        format: 'chat'
    }
};

// Model-specific configurations
export const MODEL_CONFIGS = {
    'llama-2-7b-chat': {
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.9,
        template: 'llama-2-chat',
        supports: {
            functionCalling: true,
            jsonMode: true,
            streaming: true
        }
    },

    'llama-2-13b-chat': {
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.9,
        template: 'llama-2-chat',
        supports: {
            functionCalling: true,
            jsonMode: true,
            streaming: true
        }
    },

    'mistral-7b-instruct': {
        maxTokens: 8192,
        temperature: 0.7,
        topP: 0.9,
        template: 'mistral-instruct',
        supports: {
            functionCalling: true,
            jsonMode: true,
            streaming: true
        }
    },

    'codellama-7b-instruct': {
        maxTokens: 4096,
        temperature: 0.1,
        topP: 0.9,
        template: 'codellama-instruct',
        supports: {
            functionCalling: true,
            jsonMode: true,
            streaming: false
        }
    }
};

// Health check configuration
export const HEALTH_CHECK = {
    ENDPOINT: '/v1/models',
    EXPECTED_STATUS: 200,
    TIMEOUT: 5000
};

// Error codes and messages
export const ERROR_CODES = {
    CONNECTION_FAILED: 'LLAMAEDGE_CONNECTION_FAILED',
    MODEL_NOT_FOUND: 'LLAMAEDGE_MODEL_NOT_FOUND',
    INVALID_REQUEST: 'LLAMAEDGE_INVALID_REQUEST',
    TIMEOUT: 'LLAMAEDGE_TIMEOUT',
    RATE_LIMITED: 'LLAMAEDGE_RATE_LIMITED',
    SERVER_ERROR: 'LLAMAEDGE_SERVER_ERROR'
};

// Helper function to get full API URL
export function getApiUrl(endpoint = '') {
    const baseUrl = LLAMAEDGE_DEFAULTS.API_URL.replace(/\/$/, '');
    const cleanEndpoint = endpoint.replace(/^\//, '');
    return cleanEndpoint ? `${baseUrl}/${cleanEndpoint}` : baseUrl;
}

// Helper function to get model configuration
export function getModelConfig(modelName = null) {
    const model = modelName || LLAMAEDGE_DEFAULTS.MODEL_NAME;
    return MODEL_CONFIGS[model] || MODEL_CONFIGS['llama-2-7b-chat'];
}

// Helper function to get prompt template
export function getPromptTemplate(modelName = null) {
    const modelConfig = getModelConfig(modelName);
    return PROMPT_TEMPLATES[modelConfig.template] || PROMPT_TEMPLATES['default'];
}

// Helper function to format messages for LlamaEdge
export function formatMessagesForModel(messages, modelName = null) {
    const template = getPromptTemplate(modelName);
    let formattedMessages = [];

    for (const message of messages) {
        switch (message.role) {
            case 'system':
                formattedMessages.push({
                    role: 'system',
                    content: template.system.replace('{system_message}', message.content)
                });
                break;
            case 'user':
                formattedMessages.push({
                    role: 'user',
                    content: template.user.replace('{user_message}', message.content)
                });
                break;
            case 'assistant':
                formattedMessages.push({
                    role: 'assistant',
                    content: template.assistant.replace('{assistant_message}', message.content)
                });
                break;
            default:
                formattedMessages.push(message);
        }
    }

    return formattedMessages;
}

// Helper function to validate LlamaEdge configuration
export function validateConfig() {
    const errors = [];

    if (!LLAMAEDGE_DEFAULTS.API_URL) {
        errors.push('LLAMAEDGE_API_URL is required');
    }

    if (!LLAMAEDGE_DEFAULTS.MODEL_NAME) {
        errors.push('LLAMAEDGE_MODEL_NAME is required');
    }

    if (LLAMAEDGE_DEFAULTS.CONTEXT_SIZE < 512) {
        errors.push('LLAMAEDGE_CONTEXT_SIZE must be at least 512');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

export default {
    LLAMAEDGE_DEFAULTS,
    PROMPT_TEMPLATES,
    MODEL_CONFIGS,
    HEALTH_CHECK,
    ERROR_CODES,
    getApiUrl,
    getModelConfig,
    getPromptTemplate,
    formatMessagesForModel,
    validateConfig
};