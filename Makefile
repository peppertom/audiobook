# Audiobook project — top-level Makefile
# Usage: make <target>

DOCKER_COMPOSE  := docker compose
WORKER_PYTHON   := backend/worker-venv/bin/python
BACKEND_VENV    := backend/.venv/bin
WORKTREE_BACKEND := backend/../.worktrees/production-pipeline/backend

.PHONY: help up down restart logs \
        worker worker-new worker-setup worker-check \
        dev dev-infra \
        test lint \
        db-shell redis-shell \
        build rebuild

# ── default ──────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Development"
	@echo "  -----------"
	@echo "  make up              Start Docker services (infra + backend + frontend, no worker)"
	@echo "  make dev             Same as up + reminder to start local worker"
	@echo "  make dev-infra       Start only Redis + Postgres in Docker"
	@echo "  make worker          Start local ARQ worker on MPS (run in separate terminal)"
	@echo "  make worker-new      Start local ARQ worker from production-pipeline worktree"
	@echo "  make worker-setup    Create worker-venv with torch + coqui-tts (run once)"
	@echo ""
	@echo "  Management"
	@echo "  ----------"
	@echo "  make down            Stop all Docker services"
	@echo "  make restart         Restart backend Docker container"
	@echo "  make rebuild         Rebuild and restart all Docker containers"
	@echo "  make logs            Follow all Docker service logs"
	@echo "  make logs-backend    Follow backend logs only"
	@echo ""
	@echo "  Quality"
	@echo "  -------"
	@echo "  make test            Run backend test suite"
	@echo "  make lint            Run frontend ESLint"
	@echo ""
	@echo "  Database / Cache"
	@echo "  ----------------"
	@echo "  make db-shell        Open psql shell in the Postgres container"
	@echo "  make redis-shell     Open redis-cli in the Redis container"
	@echo ""

# ── docker services ───────────────────────────────────────────────────────────
up:
	$(DOCKER_COMPOSE) up -d

down:
	$(DOCKER_COMPOSE) down

restart:
	$(DOCKER_COMPOSE) restart backend

rebuild:
	$(DOCKER_COMPOSE) up -d --build

logs:
	$(DOCKER_COMPOSE) logs -f

logs-backend:
	$(DOCKER_COMPOSE) logs -f backend

# Start only infra (Redis + Postgres) — backend and worker run locally
dev-infra:
	$(DOCKER_COMPOSE) up -d redis postgres

# ── local development (MPS worker) ───────────────────────────────────────────

# Full dev: everything in Docker except the ARQ worker (runs locally on MPS).
# In a separate terminal run: make worker-new
dev: worker-check
	$(DOCKER_COMPOSE) up -d redis postgres backend frontend
	@echo ""
	@echo "Docker services started (redis, postgres, backend, frontend)."
	@echo "Now run the local MPS worker in a new terminal:"
	@echo ""
	@echo "  make worker-new"
	@echo ""
	@echo "  Backend:  http://localhost:9000"
	@echo "  Frontend: http://localhost:3000"

# Local worker — main branch code
worker: worker-check
	cd backend && \
	AUDIOBOOK_REDIS_URL=redis://localhost:6379 \
	AUDIOBOOK_DATABASE_URL=postgresql+asyncpg://audiobook:audiobook_dev@localhost:5433/audiobook \
	AUDIOBOOK_STORAGE_PATH=$(CURDIR)/backend/storage \
	$(CURDIR)/backend/worker-venv/bin/arq app.worker.WorkerSettings

# Local worker — feat/production-quality-pipeline worktree code
worker-new: worker-check
	@if [ ! -d "$(WORKTREE_BACKEND)" ]; then \
	  echo "Worktree not found at $(WORKTREE_BACKEND)"; \
	  echo "Run: git worktree add .worktrees/production-pipeline -b feat/production-quality-pipeline origin/feat/production-quality-pipeline"; \
	  exit 1; \
	fi
	cd $(WORKTREE_BACKEND) && \
	AUDIOBOOK_REDIS_URL=redis://localhost:6379 \
	AUDIOBOOK_DATABASE_URL=postgresql+asyncpg://audiobook:audiobook_dev@localhost:5433/audiobook \
	AUDIOBOOK_STORAGE_PATH=$(CURDIR)/backend/storage \
	$(CURDIR)/backend/worker-venv/bin/arq app.worker.WorkerSettings

# Check that worker-venv exists
worker-check:
	@if [ ! -f "$(WORKER_PYTHON)" ]; then \
	  echo "worker-venv not found. Run: make worker-setup"; \
	  exit 1; \
	fi

# Create worker-venv with full ML stack (run once, takes ~10 minutes)
worker-setup:
	@echo "Creating worker-venv with Python 3.12..."
	~/.pyenv/versions/3.12.7/bin/python -m venv backend/worker-venv
	@echo "Installing worker dependencies (torch + coqui-tts — this takes a while)..."
	backend/worker-venv/bin/pip install -r backend/requirements-worker.txt
	@echo ""
	@echo "Done. Run: make worker-new"

# ── quality ───────────────────────────────────────────────────────────────────
test:
	cd backend && $(CURDIR)/$(BACKEND_VENV)/pytest tests/ -v

lint:
	cd frontend && npm run lint

# ── database / cache ──────────────────────────────────────────────────────────
db-shell:
	docker exec -it audiobook-postgres-1 psql -U audiobook -d audiobook

redis-shell:
	docker exec -it audiobook-redis-1 redis-cli
