#!/usr/bin/env bash
# Run the ARQ worker locally using the worker-venv (Python 3.12 + torch + coqui-tts)
# Uses M1 MPS acceleration when available.
#
# Usage (from any directory):
#   ./backend/run-worker-local.sh              # run with main branch code
#   ./backend/run-worker-local.sh --new-code   # run with worktree (feat/production-quality-pipeline)

set -e

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_PYTHON="$BACKEND_DIR/worker-venv/bin/python"
WORKTREE_BACKEND="$BACKEND_DIR/../.worktrees/production-pipeline/backend"

if [ ! -f "$WORKER_PYTHON" ]; then
    echo "Error: worker-venv not found. Create it with:"
    echo "  ~/.pyenv/versions/3.12.7/bin/python -m venv backend/worker-venv"
    echo "  backend/worker-venv/bin/pip install -r backend/requirements-worker.txt"
    exit 1
fi

# Determine which app code to use
if [ "$1" = "--new-code" ] && [ -d "$WORKTREE_BACKEND" ]; then
    APP_DIR="$WORKTREE_BACKEND"
    echo "Using new code from: feat/production-quality-pipeline"
else
    APP_DIR="$BACKEND_DIR"
fi

export AUDIOBOOK_REDIS_URL="${AUDIOBOOK_REDIS_URL:-redis://localhost:6379}"
export AUDIOBOOK_DATABASE_URL="${AUDIOBOOK_DATABASE_URL:-postgresql+asyncpg://audiobook:audiobook_dev@localhost:5433/audiobook}"
export AUDIOBOOK_STORAGE_PATH="${AUDIOBOOK_STORAGE_PATH:-$BACKEND_DIR/storage}"

echo "Starting local ARQ worker..."
echo "  Code:     $APP_DIR"
echo "  Redis:    $AUDIOBOOK_REDIS_URL"
echo "  DB:       $AUDIOBOOK_DATABASE_URL"
echo "  Storage:  $AUDIOBOOK_STORAGE_PATH"

cd "$APP_DIR"
exec "$WORKER_PYTHON" -m arq app.worker.WorkerSettings
