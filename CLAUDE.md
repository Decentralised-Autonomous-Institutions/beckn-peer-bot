# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `beckn-action-bot`, a Node.js application that integrates AI models (OpenAI or LlamaEdge) with the Beckn protocol to enable economic transactions across the Beckn open network using natural language text inputs. The bot functions as both a traditional chatbot and a transaction facilitator for services like food ordering, taxi booking, route finding, appointments, and grocery shopping.

## Key Architecture

The application follows a service-oriented architecture with these main components:

- **Express Server** (`server.js`): Main entry point with webhook endpoints
- **Controllers**: Handle HTTP requests and coordinate between services
  - `Agent.js`: Main conversation controller that orchestrates AI, DB, and Map services
  - `ControlCenter.js`: Administrative controls for bookings and catalog management
- **Services**: Core business logic
  - `AI.js`: AI service integration (OpenAI/LlamaEdge) with function calling for Beckn transactions
  - `Actions.js`: Twilio integration for WhatsApp messaging and API calls
  - `DBService.js`: Session management and data persistence
  - `MapService.js`: Google Maps integration for route planning
- **Utils**: Logging and language processing utilities

### Service Integration Pattern

The `Agent.js` controller demonstrates the key integration pattern:
1. Retrieves user session from database
2. Initializes AI, Map, and DB services with shared session context
3. Sets up available tools for AI function calling (routes, Beckn actions)
4. Processes user message through AI with context
5. Updates session and sends response via Twilio

## Development Commands

### Environment Setup
```bash
cp .env.sample .env  # Configure environment variables
npm install          # Install dependencies
```

### Development
```bash
npm run dev          # Start development server with nodemon
npm start            # Start server with environment file
```

### Testing
```bash
npm test             # Run all tests (unit + API tests)
npm run test:unit    # Run only unit tests
npm run test:apis    # Run only API tests
```

### Code Quality
```bash
npm run lint         # ESLint check
npm run prettify     # Format code with Prettier
```

### Docker Development
```bash
npm run docker:dev      # Run development server in Docker
npm run docker:test     # Run tests in Docker
npm run docker:lint     # Run linting in Docker
```

## LlamaEdge Setup (Recommended)

### Installation
```bash
# Install LlamaEdge with default Llama 2 7B model
bash scripts/install-llamaedge.sh

# Or install with specific model and configuration
bash scripts/install-llamaedge.sh --model mistral-7b-instruct --context-size 8192 --port 8080

# Or install with custom model URL
bash scripts/install-llamaedge.sh --model-url https://example.com/model.gguf --template llama-2-chat
```

### Starting LlamaEdge Server
```bash
# Start in foreground
bash scripts/start-llamaedge.sh

# Start in daemon mode
bash scripts/start-llamaedge.sh --daemon

# Check status
bash scripts/start-llamaedge.sh --status

# Stop server
bash scripts/start-llamaedge.sh --kill

# Restart server
bash scripts/start-llamaedge.sh --restart
```

## Environment Configuration

### AI Provider Selection
Set `AI_PROVIDER=llamaedge` or `AI_PROVIDER=openai` in `.env`

### LlamaEdge Configuration (Recommended)
- `LLAMAEDGE_API_URL`: LlamaEdge server endpoint (default: http://localhost:8080)
- `LLAMAEDGE_MODEL_NAME`: Model name (default: llama-2-7b-chat)
- `LLAMAEDGE_CONTEXT_SIZE`: Context window size (default: 4096)
- `LLAMAEDGE_BATCH_SIZE`: Batch processing size (default: 512)
- `LLAMAEDGE_TEMPERATURE`: Sampling temperature (default: 0.7)

### OpenAI Configuration (Legacy)
- `OPENAI_AI_KEY`: OpenAI API key for GPT integration
- `OPENAI_MODEL_ID`: Model identifier (default: gpt-3.5-turbo-1106)

### Other Required Variables
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER`: WhatsApp messaging
- `GOOGLE_MAPS_API_KEY`: Route planning and location services
- `SERVER_PORT`: Application port (default: 3001)
- `STRAPI_*_TOKEN`: Domain-specific Beckn registry tokens

## Testing Strategy

The project uses Mocha for testing with a 15-minute timeout for API tests. Tests are organized into:
- `tests/unit/`: Unit tests for individual services
- `tests/apis/`: Integration tests for API endpoints
- `tests/utils/`: Utility function tests

## Code Standards

- ESLint configuration extends Node.js recommended rules with Prettier integration
- ES modules used throughout (`"type": "module"` in package.json)
- Winston logger for structured logging
- Husky pre-commit hooks for code quality (lint-staged configuration present)