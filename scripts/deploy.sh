#!/bin/bash

# Manual deployment script for VPS
# This script can be run directly on the VPS for manual deployments

set -e  # Exit on any error

# Configuration
DEPLOY_DIR="/opt/webhook"
REPO_URL="https://github.com/kittens-inc/webhook.git"
BRANCH="main"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   log_error "This script should not be run as root for security reasons"
   exit 1
fi

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker is not running or user doesn't have permission to access Docker."
    log_info "Try: sudo usermod -aG docker $USER && newgrp docker"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    log_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Use docker compose or docker-compose based on availability
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

log_info "Starting deployment process..."

# Create deployment directory if it doesn't exist
if [ ! -d "$DEPLOY_DIR" ]; then
    log_info "Creating deployment directory: $DEPLOY_DIR"
    sudo mkdir -p "$DEPLOY_DIR"
    sudo chown $USER:$USER "$DEPLOY_DIR"
fi

# Navigate to deployment directory
cd "$DEPLOY_DIR"

# Clone or update repository
if [ -d ".git" ]; then
    log_info "Updating existing repository..."
    git fetch origin
    git reset --hard origin/$BRANCH
    git clean -fd
else
    log_info "Cloning repository..."
    git clone "$REPO_URL" .
    git checkout "$BRANCH"
fi

# Check if config.toml exists
if [ ! -f "config.toml" ]; then
    log_warn "config.toml not found!"
    log_info "Please create config.toml with your configuration."
    log_info "You can copy from config.example.toml and modify the values."
    
    if [ -f "config.example.toml" ]; then
        log_info "Copying example configuration..."
        cp config.example.toml config.toml
        log_warn "Please edit config.toml with your actual values before continuing."
        log_info "Required values: GitHub webhook secret, Discord webhook URL"
        exit 1
    else
        log_error "config.example.toml not found. Cannot create configuration."
        exit 1
    fi
fi

# Create debug directory
mkdir -p debug

# Stop existing containers
log_info "Stopping existing containers..."
$DOCKER_COMPOSE down || true

# Build and start new containers
log_info "Building and starting containers..."
$DOCKER_COMPOSE up -d --build

# Wait for application to start
log_info "Waiting for application to start..."
sleep 10

# Check if containers are running
if $DOCKER_COMPOSE ps | grep -q "Up"; then
    log_info "✅ Deployment successful!"
    $DOCKER_COMPOSE ps
    
    # Test health endpoint if available
    if command -v curl &> /dev/null; then
        log_info "Testing health endpoint..."
        if curl -f http://localhost:3000/health &> /dev/null; then
            log_info "✅ Health check passed!"
        else
            log_warn "Health check endpoint not responding (this may be normal if no health endpoint exists)"
        fi
    fi
else
    log_error "❌ Deployment failed!"
    log_error "Container status:"
    $DOCKER_COMPOSE ps
    log_error "Container logs:"
    $DOCKER_COMPOSE logs
    exit 1
fi

# Clean up old Docker images
log_info "Cleaning up old Docker images..."
docker image prune -f

log_info "🎉 Deployment completed successfully!"
log_info "Application is running on port 3000"
log_info "Use '$DOCKER_COMPOSE logs -f' to view logs"
log_info "Use '$DOCKER_COMPOSE down' to stop the application"
