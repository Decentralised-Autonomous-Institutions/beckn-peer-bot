import OpenAI from 'openai';
import LlamaEdgeClient from '../services/LlamaEdgeClient.js';
import logger from '../utils/logger.js';

/**
 * Model Controller
 * Manages AI model providers (OpenAI and LlamaEdge) with automatic fallback
 */
class ModelController {
    constructor() {
        this.primaryProvider = process.env.AI_PROVIDER || 'llamaedge';
        this.fallbackEnabled = process.env.AI_FALLBACK_ENABLED !== 'false';

        this.providers = {};
        this.activeProvider = null;

        this._initializeProviders();
    }

    /**
     * Initialize both AI providers
     */
    _initializeProviders() {
        try {
            // Initialize LlamaEdge provider
            if (process.env.LLAMAEDGE_API_URL) {
                this.providers.llamaedge = new LlamaEdgeClient();
                logger.info('LlamaEdge provider initialized');
            }

            // Initialize OpenAI provider
            if (process.env.OPENAI_AI_KEY) {
                this.providers.openai = new OpenAI({
                    apiKey: process.env.OPENAI_AI_KEY,
                });
                logger.info('OpenAI provider initialized');
            }

            // Set active provider
            if (this.providers[this.primaryProvider]) {
                this.activeProvider = this.primaryProvider;
                logger.info(`Active AI provider: ${this.activeProvider}`);
            } else {
                // Fallback to available provider
                const availableProviders = Object.keys(this.providers);
                if (availableProviders.length > 0) {
                    this.activeProvider = availableProviders[0];
                    logger.warn(`Primary provider '${this.primaryProvider}' not available, using '${this.activeProvider}'`);
                } else {
                    throw new Error('No AI providers are configured and available');
                }
            }

        } catch (error) {
            logger.error('Failed to initialize AI providers:', error.message);
            throw error;
        }
    }

    /**
     * Get the current active provider instance
     */
    getActiveProvider() {
        return this.providers[this.activeProvider];
    }

    /**
     * Get provider type (openai or llamaedge)
     */
    getProviderType() {
        return this.activeProvider;
    }

    /**
     * Switch to a different provider
     */
    async switchProvider(providerName) {
        if (!this.providers[providerName]) {
            throw new Error(`Provider '${providerName}' is not available`);
        }

        const oldProvider = this.activeProvider;
        this.activeProvider = providerName;

        logger.info(`Switched AI provider from '${oldProvider}' to '${providerName}'`);

        // Test the new provider
        const isHealthy = await this.healthCheck();
        if (!isHealthy) {
            // Revert if unhealthy
            this.activeProvider = oldProvider;
            throw new Error(`Provider '${providerName}' is not healthy, reverted to '${oldProvider}'`);
        }

        return true;
    }

    /**
     * Check health of current provider
     */
    async healthCheck() {
        try {
            const provider = this.getActiveProvider();

            if (this.activeProvider === 'llamaedge') {
                const health = await provider.healthCheck();
                return health.healthy;
            } else if (this.activeProvider === 'openai') {
                // Simple test for OpenAI
                const response = await provider.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Test' }],
                    max_tokens: 1
                });
                return response.choices && response.choices.length > 0;
            }

            return false;
        } catch (error) {
            logger.error(`Health check failed for ${this.activeProvider}:`, error.message);
            return false;
        }
    }

    /**
     * Create chat completion with automatic fallback
     */
    async createChatCompletion(options, enableFallback = this.fallbackEnabled) {
        const maxRetries = enableFallback ? Object.keys(this.providers).length : 1;
        let lastError;
        let attempts = 0;

        const providerOrder = [this.activeProvider, ...Object.keys(this.providers).filter(p => p !== this.activeProvider)];

        for (const providerName of providerOrder) {
            if (attempts >= maxRetries) break;

            if (!this.providers[providerName]) continue;

            attempts++;

            try {
                logger.verbose(`Attempting chat completion with ${providerName} (attempt ${attempts}/${maxRetries})`);

                let response;

                if (providerName === 'llamaedge') {
                    response = await this.providers[providerName].createChatCompletion(options);
                } else if (providerName === 'openai') {
                    // Transform options for OpenAI format
                    const openaiOptions = {
                        model: options.model || process.env.OPENAI_MODEL_ID || 'gpt-3.5-turbo',
                        messages: options.messages,
                        temperature: options.temperature,
                        max_tokens: options.max_tokens,
                        tools: options.tools,
                        tool_choice: options.tool_choice,
                        response_format: options.response_format,
                        stream: options.stream
                    };

                    response = await this.providers[providerName].chat.completions.create(openaiOptions);
                }

                // Success - update active provider if we switched
                if (providerName !== this.activeProvider) {
                    logger.info(`Successfully failed over to ${providerName}`);
                    this.activeProvider = providerName;
                }

                return {
                    ...response,
                    _provider: providerName,
                    _attempt: attempts
                };

            } catch (error) {
                lastError = error;
                logger.warn(`Chat completion failed with ${providerName}: ${error.message}`);

                // Don't try fallback for certain error types
                if (error.code === 'INVALID_REQUEST' || error.status === 400) {
                    throw error;
                }

                continue;
            }
        }

        // All providers failed
        logger.error(`Chat completion failed with all available providers after ${attempts} attempts`);
        throw lastError || new Error('All AI providers failed');
    }

    /**
     * Get information about all providers
     */
    async getProvidersInfo() {
        const info = {
            activeProvider: this.activeProvider,
            primaryProvider: this.primaryProvider,
            fallbackEnabled: this.fallbackEnabled,
            providers: {}
        };

        for (const [name, provider] of Object.entries(this.providers)) {
            try {
                if (name === 'llamaedge') {
                    info.providers[name] = await provider.getServerInfo();
                } else if (name === 'openai') {
                    info.providers[name] = {
                        server: 'OpenAI',
                        healthy: await this.healthCheck(),
                        model: process.env.OPENAI_MODEL_ID || 'gpt-3.5-turbo'
                    };
                }
            } catch (error) {
                info.providers[name] = {
                    server: name,
                    healthy: false,
                    error: error.message
                };
            }
        }

        return info;
    }

    /**
     * Test all providers
     */
    async testAllProviders() {
        const results = {};

        for (const [name, provider] of Object.entries(this.providers)) {
            try {
                if (name === 'llamaedge') {
                    results[name] = await provider.testConnection();
                } else if (name === 'openai') {
                    const response = await provider.chat.completions.create({
                        model: process.env.OPENAI_MODEL_ID || 'gpt-3.5-turbo',
                        messages: [{ role: 'user', content: 'Hello, respond with just "OK"' }],
                        max_tokens: 10
                    });

                    results[name] = {
                        success: true,
                        response: response.choices[0]?.message?.content || '',
                        server: 'OpenAI'
                    };
                }
            } catch (error) {
                results[name] = {
                    success: false,
                    error: error.message,
                    server: name
                };
            }
        }

        return results;
    }

    /**
     * Get list of available providers
     */
    getAvailableProviders() {
        return Object.keys(this.providers);
    }

    /**
     * Check if a specific provider is available
     */
    isProviderAvailable(providerName) {
        return this.providers[providerName] !== undefined;
    }
}

export default ModelController;