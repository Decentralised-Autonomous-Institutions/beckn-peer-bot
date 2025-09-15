#!/bin/bash

# LlamaEdge Installation Script for Beckn Action Bot
# This script installs WasmEdge runtime, downloads LLM models, and sets up LlamaEdge API server

set -e

# Default configurations
DEFAULT_MODEL="llama-2-7b-chat"
DEFAULT_CONTEXT_SIZE="4096"
DEFAULT_BATCH_SIZE="512"
DEFAULT_PORT="8080"
DEFAULT_MODEL_URL=""
DEFAULT_PROMPT_TEMPLATE="llama-2-chat"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show help
show_help() {
    echo "LlamaEdge Installation Script for Beckn Action Bot"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -m, --model MODEL_NAME       Model name (default: $DEFAULT_MODEL)"
    echo "  -u, --model-url URL          Direct URL to download model file"
    echo "  -c, --context-size SIZE      Context size (default: $DEFAULT_CONTEXT_SIZE)"
    echo "  -b, --batch-size SIZE        Batch size (default: $DEFAULT_BATCH_SIZE)"
    echo "  -p, --port PORT              API server port (default: $DEFAULT_PORT)"
    echo "  -t, --template TEMPLATE      Prompt template (default: $DEFAULT_PROMPT_TEMPLATE)"
    echo "  -h, --help                   Show this help message"
    echo ""
    echo "Available Models:"
    echo "  llama-2-7b-chat             Llama 2 7B Chat model"
    echo "  llama-2-13b-chat            Llama 2 13B Chat model"
    echo "  mistral-7b-instruct         Mistral 7B Instruct model"
    echo "  codellama-7b-instruct       CodeLlama 7B Instruct model"
    echo ""
    echo "Example:"
    echo "  $0 --model llama-2-7b-chat --context-size 8192 --port 8080"
    echo "  $0 --model-url https://example.com/model.gguf --template llama-2-chat"
}

# Parse command line arguments
MODEL_NAME="$DEFAULT_MODEL"
CONTEXT_SIZE="$DEFAULT_CONTEXT_SIZE"
BATCH_SIZE="$DEFAULT_BATCH_SIZE"
API_PORT="$DEFAULT_PORT"
MODEL_URL="$DEFAULT_MODEL_URL"
PROMPT_TEMPLATE="$DEFAULT_PROMPT_TEMPLATE"

while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--model)
            MODEL_NAME="$2"
            shift 2
            ;;
        -u|--model-url)
            MODEL_URL="$2"
            shift 2
            ;;
        -c|--context-size)
            CONTEXT_SIZE="$2"
            shift 2
            ;;
        -b|--batch-size)
            BATCH_SIZE="$2"
            shift 2
            ;;
        -p|--port)
            API_PORT="$2"
            shift 2
            ;;
        -t|--template)
            PROMPT_TEMPLATE="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Create directories
LLAMAEDGE_DIR="./llamaedge"
MODELS_DIR="$LLAMAEDGE_DIR/models"
BINARIES_DIR="$LLAMAEDGE_DIR/bin"

print_info "Creating LlamaEdge directories..."
mkdir -p "$MODELS_DIR" "$BINARIES_DIR"

# Function to detect OS and architecture
detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    case $ARCH in
        x86_64)
            ARCH="x86_64"
            ;;
        arm64|aarch64)
            ARCH="aarch64"
            ;;
        *)
            print_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac

    case $OS in
        linux)
            PLATFORM="linux"
            ;;
        darwin)
            PLATFORM="darwin"
            ;;
        *)
            print_error "Unsupported OS: $OS"
            exit 1
            ;;
    esac

    print_info "Detected platform: $PLATFORM-$ARCH"
}

# Function to install WasmEdge
install_wasmedge() {
    print_info "Installing WasmEdge runtime..."

    if command -v wasmedge &> /dev/null; then
        print_warning "WasmEdge is already installed. Skipping installation."
        return
    fi

    # Download and install WasmEdge using the v2 installer
    curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install_v2.sh | bash -s

    # Source the environment
    source ~/.wasmedge/env

    print_success "WasmEdge installed successfully"
}

# Function to download LlamaEdge API server
download_llamaedge_server() {
    print_info "Downloading LlamaEdge API server..."

    detect_platform

    # LlamaEdge releases URL - using the correct repository and latest release
    SERVER_URL="https://github.com/second-state/LlamaEdge/releases/latest/download/llama-api-server.wasm"

    cd "$BINARIES_DIR"

    if [ ! -f "llama-api-server.wasm" ]; then
        curl -L -o llama-api-server.wasm "$SERVER_URL"
        print_success "LlamaEdge API server downloaded"
    else
        print_warning "LlamaEdge API server already exists. Skipping download."
    fi

    cd - > /dev/null
}

# Function to get model download URL
get_model_url() {
    local model_name="$1"

    case $model_name in
        llama-2-7b-chat)
            echo "https://huggingface.co/second-state/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q5_K_M.gguf"
            ;;
        llama-2-13b-chat)
            echo "https://huggingface.co/second-state/Llama-2-13B-Chat-GGUF/resolve/main/llama-2-13b-chat.Q5_K_M.gguf"
            ;;
        mistral-7b-instruct)
            echo "https://huggingface.co/second-state/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3.Q5_K_M.gguf"
            ;;
        codellama-7b-instruct)
            echo "https://huggingface.co/second-state/CodeLlama-7B-Instruct-GGUF/resolve/main/CodeLlama-7b-Instruct.Q5_K_M.gguf"
            ;;
        *)
            print_error "Unknown model: $model_name"
            print_info "Available models: llama-2-7b-chat, llama-2-13b-chat, mistral-7b-instruct, codellama-7b-instruct"
            exit 1
            ;;
    esac
}

# Function to download model
download_model() {
    print_info "Downloading model: $MODEL_NAME"

    cd "$MODELS_DIR"

    if [ -n "$MODEL_URL" ]; then
        # Use custom URL
        MODEL_FILE=$(basename "$MODEL_URL")
        if [ ! -f "$MODEL_FILE" ]; then
            print_info "Downloading from custom URL: $MODEL_URL"
            curl -L -o "$MODEL_FILE" "$MODEL_URL"
        else
            print_warning "Model file $MODEL_FILE already exists. Skipping download."
        fi
    else
        # Use predefined model
        MODEL_DOWNLOAD_URL=$(get_model_url "$MODEL_NAME")
        
        # Extract the actual filename from the URL
        MODEL_FILE=$(basename "$MODEL_DOWNLOAD_URL")

        if [ ! -f "$MODEL_FILE" ]; then
            print_info "Downloading from: $MODEL_DOWNLOAD_URL"
            curl -L -o "$MODEL_FILE" "$MODEL_DOWNLOAD_URL"
        else
            print_warning "Model file $MODEL_FILE already exists. Skipping download."
        fi
    fi

    print_success "Model downloaded: $MODEL_FILE"
    cd - > /dev/null
}

# Function to create configuration files
create_config() {
    print_info "Creating LlamaEdge configuration..."

    # Create .env updates
    cat > "$LLAMAEDGE_DIR/llamaedge.env" << EOF
# LlamaEdge Configuration
LLAMAEDGE_API_URL=http://localhost:$API_PORT
LLAMAEDGE_MODEL_NAME=$MODEL_NAME
LLAMAEDGE_CONTEXT_SIZE=$CONTEXT_SIZE
LLAMAEDGE_BATCH_SIZE=$BATCH_SIZE
LLAMAEDGE_API_PORT=$API_PORT
LLAMAEDGE_PROMPT_TEMPLATE=$PROMPT_TEMPLATE
EOF

    # Determine the actual model filename
    if [ -n "$MODEL_URL" ]; then
        ACTUAL_MODEL_FILE=$(basename "$MODEL_URL")
    else
        MODEL_DOWNLOAD_URL=$(get_model_url "$MODEL_NAME")
        ACTUAL_MODEL_FILE=$(basename "$MODEL_DOWNLOAD_URL")
    fi

    # Create startup script
    cat > "$LLAMAEDGE_DIR/start-server.sh" << EOF
#!/bin/bash
# LlamaEdge API Server Startup Script

set -e

# Source WasmEdge environment
source ~/.wasmedge/env

# Configuration
MODEL_FILE="$MODELS_DIR/$ACTUAL_MODEL_FILE"
SERVER_WASM="$BINARIES_DIR/llama-api-server.wasm"
API_PORT=$API_PORT
CONTEXT_SIZE=$CONTEXT_SIZE
BATCH_SIZE=$BATCH_SIZE
PROMPT_TEMPLATE=$PROMPT_TEMPLATE

# Check if model file exists
if [ ! -f "\$MODEL_FILE" ]; then
    echo "Error: Model file not found: \$MODEL_FILE"
    exit 1
fi

# Check if server wasm exists
if [ ! -f "\$SERVER_WASM" ]; then
    echo "Error: LlamaEdge API server not found: \$SERVER_WASM"
    exit 1
fi

echo "Starting LlamaEdge API server..."
echo "Model: \$MODEL_FILE"
echo "Port: \$API_PORT"
echo "Context Size: \$CONTEXT_SIZE"
echo "Batch Size: \$BATCH_SIZE"

# Start the server
wasmedge --dir .:. \\
    --nn-preload default:GGML:AUTO:\$MODEL_FILE \\
    \$SERVER_WASM \\
    --model-name $MODEL_NAME \\
    --ctx-size \$CONTEXT_SIZE \\
    --batch-size \$BATCH_SIZE \\
    --prompt-template \$PROMPT_TEMPLATE \\
    --port \$API_PORT \\
    --log-prompts \\
    --log-stat
EOF

    chmod +x "$LLAMAEDGE_DIR/start-server.sh"

    print_success "Configuration files created in $LLAMAEDGE_DIR/"
}

# Function to create npm scripts
update_package_scripts() {
    print_info "Creating npm scripts for LlamaEdge..."

    # Create a helper script that can be added to package.json
    cat > "$LLAMAEDGE_DIR/npm-scripts.json" << EOF
{
  "llamaedge:start": "cd llamaedge && ./start-server.sh",
  "llamaedge:install": "bash scripts/install-llamaedge.sh",
  "llamaedge:status": "curl -s http://localhost:$API_PORT/v1/models || echo 'LlamaEdge server not running'",
  "dev:llamaedge": "npm run llamaedge:start & npm run dev"
}
EOF

    print_info "Suggested npm scripts created in $LLAMAEDGE_DIR/npm-scripts.json"
    print_info "Add these scripts to your package.json manually:"
    cat "$LLAMAEDGE_DIR/npm-scripts.json"
}

# Main installation process
main() {
    print_info "Starting LlamaEdge installation for Beckn Action Bot"
    print_info "Configuration:"
    print_info "  Model: $MODEL_NAME"
    print_info "  Context Size: $CONTEXT_SIZE"
    print_info "  Batch Size: $BATCH_SIZE"
    print_info "  API Port: $API_PORT"
    print_info "  Prompt Template: $PROMPT_TEMPLATE"

    if [ -n "$MODEL_URL" ]; then
        print_info "  Custom Model URL: $MODEL_URL"
    fi

    echo ""
    read -p "Continue with installation? (y/N): " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Installation cancelled."
        exit 0
    fi

    install_wasmedge
    download_llamaedge_server
    download_model
    create_config
    update_package_scripts

    print_success "LlamaEdge installation completed successfully!"
    echo ""
    print_info "Next steps:"
    print_info "1. Update your .env file with LlamaEdge configuration:"
    print_info "   cat $LLAMAEDGE_DIR/llamaedge.env >> .env"
    print_info ""
    print_info "2. Start the LlamaEdge server:"
    print_info "   cd $LLAMAEDGE_DIR && ./start-server.sh"
    print_info ""
    print_info "3. Test the API:"
    print_info "   curl -X POST http://localhost:$API_PORT/v1/chat/completions \\"
    print_info "     -H 'Content-Type: application/json' \\"
    print_info "     -d '{\"messages\":[{\"role\":\"user\",\"content\":\"Hello!\"}]}'"
    print_info ""
    print_info "4. Update your application code to use LlamaEdge instead of OpenAI"
}

# Run main function
main "$@"