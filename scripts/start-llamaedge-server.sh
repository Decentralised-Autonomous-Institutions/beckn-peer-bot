#!/bin/bash
# LlamaEdge API Server Startup Script

set -e

# Source WasmEdge environment
source ~/.wasmedge/env

# Configuration
MODEL_FILE="./llamaedge/models/llama-2-7b-chat.Q5_K_M.gguf"
SERVER_WASM="./llamaedge/bin/llama-api-server.wasm"
API_PORT=8080
CONTEXT_SIZE=4096
BATCH_SIZE=512
PROMPT_TEMPLATE=llama-2-chat

# Check if model file exists
if [ ! -f "$MODEL_FILE" ]; then
    echo "Error: Model file not found: $MODEL_FILE"
    exit 1
fi

# Check if server wasm exists
if [ ! -f "$SERVER_WASM" ]; then
    echo "Error: LlamaEdge API server not found: $SERVER_WASM"
    exit 1
fi

echo "Starting LlamaEdge API server..."
echo "Model: $MODEL_FILE"
echo "Port: $API_PORT"
echo "Context Size: $CONTEXT_SIZE"
echo "Batch Size: $BATCH_SIZE"

# Start the server
wasmedge --dir .:. \
    --nn-preload default:GGML:AUTO:$MODEL_FILE \
    $SERVER_WASM \
    --model-name llama-2-7b-chat \
    --ctx-size $CONTEXT_SIZE \
    --batch-size $BATCH_SIZE \
    --prompt-template $PROMPT_TEMPLATE \
    --port $API_PORT \
    --log-prompts \
    --log-stat
