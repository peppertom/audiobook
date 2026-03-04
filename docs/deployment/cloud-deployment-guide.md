# Cloud Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloud Provider                            │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Frontend   │    │   Backend    │    │   Worker     │      │
│  │   (Next.js)  │◄──►│   (FastAPI)  │◄──►│   (Python)   │      │
│  │   :3000      │    │   :8000      │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                  │                   │                │
│         └──────────────────┼───────────────────┘                │
│                            │                                     │
│         ┌──────────────────┼───────────────────┐                │
│         │                  │                   │                │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐         │
│  │  Object     │    │  PostgreSQL │    │   Redis     │         │
│  │  Storage    │    │  Database   │    │   (Queue)  │         │
│  │  (S3/MinIO) │    │             │    │             │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Supported Cloud Platforms

### 1. Railway (Recommended for Simple Setup)
- PostgreSQL, Redis, Object Storage built-in
- Easy scaling
- https://railway.app

### 2. Render
- Free tier available
- PostgreSQL, Redis support
- Object storage via external service
- https://render.com

### 3. Fly.io
- Global deployment
- Volume storage for audio files
- PostgreSQL, Redis
- https://fly.io

### 4. AWS ECS / EKS
- Full control
- S3 for storage
- RDS for PostgreSQL
- ElastiCache for Redis

### 5. Google Cloud Run
- Serverless containers
- Cloud SQL for PostgreSQL
- Cloud Storage for files
- Memorystore for Redis

---

## Step-by-Step: Railway Deployment

### Prerequisites
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login
```

### 1. Create Railway Project
```bash
railway init
# Select "Empty Project"
```

### 2. Add Database Services
```bash
# Add PostgreSQL
railway add --plugin postgresql

# Add Redis
railway add --plugin redis

# Add RabbitMQ (for worker queue)
railway add --plugin rabbitmq
```

### 3. Configure Environment Variables

Create `railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 4. Update Backend Configuration

Create `backend/app/cloud_config.py`:
```python
import os

class CloudSettings(BaseSettings):
    # Use Railway provided URLs
    database_url: str = ""
    redis_url: str = ""
    storage_path: str = "/tmp/storage"
    
    # Object storage (S3 compatible)
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "audiobook"
    s3_region: str = "us-east-1"
    
    model_config = {"env_prefix": "AUDIOBOOK_"}

# Override settings
settings = CloudSettings()
```

### 5. Deploy Backend
```bash
cd backend
railway deploy
```

### 6. Deploy Frontend
```bash
cd frontend
railway deploy
```

---

## Step-by-Step: Render Deployment

### 1. Create Services on Render Dashboard

1. **Web Service** - Backend
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Environment: Python 3.12

2. **Web Service** - Frontend
   - Build Command: `npm run build`
   - Start Command: `npm run start`
   - Environment: Node 20

3. **PostgreSQL** - Database
   - Available on Render dashboard

4. **Redis** - Cache/Queue
   - Available on Render dashboard

### 2. Environment Variables

Backend:
```
AUDIOBOOK_DATABASE_URL=postgresql://user:pass@host:5432/db
AUDIOBOOK_REDIS_URL=redis://host:6379
AUDIOBOOK_STORAGE_PATH=/var/data/storage
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

---

## Step-by-Step: Docker Compose for Cloud

Update `docker-compose.yml` for production:

```yaml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=${API_URL}
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - AUDIOBOOK_REDIS_URL=redis://redis:6379
      - AUDIOBOOK_DATABASE_URL=postgresql://user:pass@postgres:5432/audiobook
      - AUDIOBOOK_STORAGE_PATH=/app/storage
    restart: unless-stopped
    depends_on:
      - redis
      - postgres

  worker:
    build: ./backend
    command: ["python", "-m", "arq", "app.worker.WorkerSettings"]
    environment:
      - AUDIOBOOK_REDIS_URL=redis://redis:6379
      - AUDIOBOOK_DATABASE_URL=postgresql://user:pass@postgres:5432/audiobook
      - AUDIOBOOK_STORAGE_PATH=/app/storage
    restart: unless-stopped
    depends_on:
      - redis
      - postgres

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=audiobook
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  redis_data:
  postgres_data:
```

---

## Production Database Migration

Replace SQLite with PostgreSQL:

### 1. Install PostgreSQL
```bash
pip install psycopg2-binary
```

### 2. Migrate Data
```bash
# Export from SQLite
python -c "
import sqlite3
import json

conn = sqlite3.connect('storage/audiobook.db')
cursor = conn.cursor()

# Export tables
for table in ['books', 'voices', 'jobs', 'audio_segments']:
    cursor.execute(f'SELECT * FROM {table}')
    rows = cursor.fetchall()
    cursor.execute(f'PRAGMA table_info({table})')
    columns = [col[1] for col in cursor.fetchall()]
    print(f'{table}: {columns}')
    print(rows)
"
```

### 3. Update Config
```python
# Use PostgreSQL URL
database_url = os.getenv(
    "AUDIOBOOK_DATABASE_URL",
    "postgresql://user:pass@localhost:5432/audiobook"
)
```

---

## Object Storage for Audio Files

For production, use S3-compatible storage:

### 1. Create S3 Bucket
- Railway: Create via dashboard (natively supported)
- AWS S3: Create bucket, set CORS
- MinIO: Self-hosted alternative

### 2. Update Storage Service

Create `backend/app/services/cloud_storage.py`:
```python
import boto3
from botocore.config import Config
from typing import BinaryIO
import os

class CloudStorage:
    def __init__(self):
        self.s3 = boto3.client(
            's3',
            endpoint_url=os.getenv('S3_ENDPOINT'),
            aws_access_key_id=os.getenv('S3_ACCESS_KEY'),
            aws_secret_access_key=os.getenv('S3_SECRET_KEY'),
            region_name=os.getenv('S3_REGION', 'us-east-1'),
            config=Config(signature_version='s3v4')
        )
        self.bucket = os.getenv('S3_BUCKET', 'audiobook')
    
    async def upload_audio(self, book_id: str, filename: str, data: bytes):
        key = f"audio/{book_id}/{filename}"
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data)
        return f"s3://{self.bucket}/{key}"
    
    async def get_audio_url(self, book_id: str, filename: str) -> str:
        key = f"audio/{book_id}/{filename}"
        return self.s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': self.bucket, 'Key': key},
            ExpiresIn=3600
        )
    
    async def delete_audio(self, book_id: str, filename: str):
        key = f"audio/{book_id}/{filename}"
        self.s3.delete_object(Bucket=self.bucket, Key=key)
```

---

## Health Checks

Add health check endpoints:

### Backend (`backend/app/main.py`)
```python
from fastapi import FastAPI
from fastapi.responses import JSONResponse

@app.get("/health")
async def health_check():
    # Check database
    try:
        await database.session.execute("SELECT 1")
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"
    
    # Check Redis
    try:
        await redis.ping()
        redis_status = "healthy"
    except Exception:
        redis_status = "unhealthy"
    
    return JSONResponse({
        "status": "ok" if db_status == "healthy" else "degraded",
        "database": db_status,
        "redis": redis_status
    })
```

---

## Recommended Deployment Options by Use Case

### Small Project / Development
- **Railway** - Easiest setup, good free tier
- PostgreSQL + Redis included

### Production App
- **Render** - Better scaling options
- Or **Fly.io** for global deployment

### Enterprise / High Traffic
- **AWS ECS/EKS** or **GKE**
- Full control over infrastructure
- S3 + RDS + ElastiCache

### Budget Option
- **Railway** ($5/month base)
- **Hetzner** (cheap VPS) + Docker Compose

---

## Quick Start: Railway

```bash
# 1. Install CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize
railway init audiobook-app

# 4. Add plugins
railway add postgresql
railway add redis
railway add rabbitmq

# 5. Deploy
railway up
```

---

## Notes

1. **Worker Deployment**: The current worker uses MPS (Apple GPU) which won't work in cloud. For cloud deployment, use CPU TTS or cloud GPU services (RunPod, Paperspace).

2. **Database**: Always use PostgreSQL in production - SQLite doesn't handle concurrent writes well.

3. **File Storage**: Use object storage (S3) for audio files, not local filesystem.

4. **Secrets**: Never commit API keys - use environment variables.
