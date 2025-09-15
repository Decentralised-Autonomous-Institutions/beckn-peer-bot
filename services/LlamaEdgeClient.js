import axios from 'axios';
import logger from '../utils/logger.js';
import {
    LLAMAEDGE_DEFAULTS,
    ERROR_CODES,
    getModelConfig,
    validateConfig
} from '../config/llamaedge.config.js';

/**
 * LlamaEdge HTTP Client Service
 * Provides OpenAI-compatible API interface for LlamaEdge server
 */
class LlamaEdgeClient {
    constructor() {
        this.baseURL = LLAMAEDGE_DEFAULTS.API_URL;
        this.modelName = LLAMAEDGE_DEFAULTS.MODEL_NAME;
        this.timeout = LLAMAEDGE_DEFAULTS.TIMEOUT;
        this.retryConfig = LLAMAEDGE_DEFAULTS.RETRY;

        // Validate configuration on initialization
        const validation = validateConfig();
        if (!validation.isValid) {
            logger.error('LlamaEdge configuration validation failed:', validation.errors);
            throw new Error(`LlamaEdge configuration error: ${validation.errors.join(', ')}`);
        }

        // Create axios instance with default configuration
        this.httpClient = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout.CHAT,
            headers: {
                'Content-Type': 'application/json',
            }
        });

        // Add request/response interceptors for logging and error handling
        this._setupInterceptors();

        logger.info(`LlamaEdge client initialized: ${this.baseURL}`);
    }

    /**
     * Setup axios interceptors for logging and error handling
     */
    _setupInterceptors() {
        // Request interceptor
        this.httpClient.interceptors.request.use(
            (config) => {
                logger.verbose(`LlamaEdge Request: ${config.method?.toUpperCase()} ${config.url}`);
                logger.verbose(`Request data: ${JSON.stringify(config.data, null, 2)}`);
                return config;
            },
            (error) => {
                logger.error('LlamaEdge request error:', error);
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.httpClient.interceptors.response.use(
            (response) => {
                logger.verbose(`LlamaEdge Response: ${response.status} ${response.statusText}`);
                logger.verbose(`Response data: ${JSON.stringify(response.data, null, 2)}`);
                return response;
            },
            (error) => {
                this._handleResponseError(error);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Handle response errors and map them to standard error codes
     */
    _handleResponseError(error) {
        if (error.response) {
            // Server responded with error status
            const status = error.response.status;
            logger.error(`LlamaEdge server error: ${status} ${error.response.statusText}`);

            switch (status) {
                case 404:
                    error.code = ERROR_CODES.MODEL_NOT_FOUND;
                    break;
                case 400:
                    error.code = ERROR_CODES.INVALID_REQUEST;
                    break;
                case 429:
                    error.code = ERROR_CODES.RATE_LIMITED;
                    break;
                case 500:
                case 502:
                case 503:
                    error.code = ERROR_CODES.SERVER_ERROR;
                    break;
                default:
                    error.code = ERROR_CODES.SERVER_ERROR;
            }
        } else if (error.request) {
            // Request made but no response received
            logger.error('LlamaEdge connection error:', error.message);
            error.code = ERROR_CODES.CONNECTION_FAILED;
        } else {
            // Something else happened
            logger.error('LlamaEdge request setup error:', error.message);
            error.code = ERROR_CODES.INVALID_REQUEST;
        }
    }

    /**
     * Retry mechanism for failed requests
     */
    async _withRetry(operation, maxAttempts = this.retryConfig.MAX_ATTEMPTS) {
        let lastError;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;

                // Don't retry on certain error types
                if (error.code === ERROR_CODES.INVALID_REQUEST ||
                    error.code === ERROR_CODES.MODEL_NOT_FOUND) {
                    throw error;
                }

                if (attempt < maxAttempts) {
                    const delay = this.retryConfig.DELAY_MS * Math.pow(this.retryConfig.BACKOFF_FACTOR, attempt - 1);
                    logger.warn(`LlamaEdge request failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    logger.error(`LlamaEdge request failed after ${maxAttempts} attempts`);
                }
            }
        }

        throw lastError;
    }

    /**
     * Check if LlamaEdge server is healthy and responsive
     */
    async healthCheck() {
        try {
            const response = await this.httpClient.get('/v1/models', {
                timeout: this.timeout.HEALTH
            });

            return {
                healthy: true,
                models: response.data?.data || [],
                server: 'LlamaEdge'
            };
        } catch (error) {
            logger.error('LlamaEdge health check failed:', error.message);
            return {
                healthy: false,
                error: error.message,
                server: 'LlamaEdge'
            };
        }
    }

    /**
     * Get available models from LlamaEdge server
     */
    async getModels() {
        return this._withRetry(async () => {
            const response = await this.httpClient.get('/v1/models');
            return response.data;
        });
    }

    /**
     * Create chat completion using LlamaEdge API
     * Compatible with OpenAI chat completions format
     */
    async createChatCompletion(options) {
        const {
            messages,
            model = this.modelName,
            temperature = LLAMAEDGE_DEFAULTS.TEMPERATURE,
            max_tokens,
            tools,
            tool_choice,
            response_format,
            stream = false,
            ...otherOptions
        } = options;

        // Get model-specific configuration
        const modelConfig = getModelConfig(model);

        // Prepare the request payload
        const requestData = {
            model,
            messages,
            temperature,
            max_tokens: max_tokens || modelConfig.maxTokens,
            stream,
            ...otherOptions
        };

        // Add tools if provided and supported by model
        if (tools && modelConfig.supports.functionCalling) {
            requestData.tools = tools;
            if (tool_choice) {
                requestData.tool_choice = tool_choice;
            }
        }

        // Add response format if provided and supported
        if (response_format && modelConfig.supports.jsonMode) {
            requestData.response_format = response_format;
        }

        return this._withRetry(async () => {
            const response = await this.httpClient.post('/v1/chat/completions', requestData);

            // Transform response to match OpenAI format if needed
            return this._transformChatResponse(response.data);
        });
    }

    /**
     * Transform LlamaEdge response to ensure OpenAI compatibility
     */
    _transformChatResponse(response) {
        // Ensure the response has the expected OpenAI format
        if (!response.choices || !Array.isArray(response.choices)) {
            logger.warn('LlamaEdge response missing choices array, transforming...');
            return {
                id: response.id || `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: response.model || this.modelName,
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: response.content || response.text || ''
                    },
                    finish_reason: 'stop'
                }],
                usage: response.usage || {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            };
        }

        // Ensure each choice has proper message structure
        response.choices = response.choices.map((choice, index) => ({
            index: choice.index || index,
            message: {
                role: choice.message?.role || 'assistant',
                content: choice.message?.content || choice.text || '',
                ...(choice.message?.tool_calls && { tool_calls: choice.message.tool_calls })
            },
            finish_reason: choice.finish_reason || 'stop'
        }));

        return response;
    }

    /**
     * Create embeddings (if supported by the model)
     */
    async createEmbeddings(options) {
        const { input, model = this.modelName } = options;

        return this._withRetry(async () => {
            const response = await this.httpClient.post('/v1/embeddings', {
                input,
                model
            }, {
                timeout: this.timeout.EMBEDDING
            });

            return response.data;
        });
    }

    /**
     * Test connection and basic functionality
     */
    async testConnection() {
        try {
            // Test health check
            const health = await this.healthCheck();
            if (!health.healthy) {
                throw new Error(`Health check failed: ${health.error}`);
            }

            // Test basic chat completion
            const testResponse = await this.createChatCompletion({
                messages: [{ role: 'user', content: 'Hello, can you respond with just "OK"?' }],
                max_tokens: 10
            });

            if (!testResponse.choices || testResponse.choices.length === 0) {
                throw new Error('Invalid response format from LlamaEdge');
            }

            logger.info('LlamaEdge connection test successful');
            return {
                success: true,
                response: testResponse.choices[0].message.content,
                server: 'LlamaEdge'
            };
        } catch (error) {
            logger.error('LlamaEdge connection test failed:', error.message);
            return {
                success: false,
                error: error.message,
                server: 'LlamaEdge'
            };
        }
    }

    /**
     * Get server information and status
     */
    async getServerInfo() {
        try {
            const [healthCheck, models] = await Promise.all([
                this.healthCheck(),
                this.getModels().catch(() => ({ data: [] }))
            ]);

            return {
                server: 'LlamaEdge',
                baseURL: this.baseURL,
                healthy: healthCheck.healthy,
                models: models.data || [],
                config: {
                    modelName: this.modelName,
                    contextSize: LLAMAEDGE_DEFAULTS.CONTEXT_SIZE,
                    batchSize: LLAMAEDGE_DEFAULTS.BATCH_SIZE,
                    temperature: LLAMAEDGE_DEFAULTS.TEMPERATURE
                }
            };
        } catch (error) {
            logger.error('Failed to get LlamaEdge server info:', error.message);
            throw error;
        }
    }
}

export default LlamaEdgeClient;