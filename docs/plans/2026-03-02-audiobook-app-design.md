# Audiobook Web App — Design Document

**Date**: 2026-03-02
**Status**: Approved

## Summary

A local-first web app where users upload EPUB books and listen to them read aloud by custom cloned voices. Voices are created from YouTube audio clips or uploaded recordings using XTTS-v2 (open-source TTS with native Hungarian support). Built with Next.js frontend and Python FastAPI backend, with a non-blocking job queue for TTS generation.

## Architecture

```
[Next.js UI]  <-->  [FastAPI Backend]  -->  [ARQ Job Queue]  -->  [TTS Worker]
                          |                                          |
                     [SQLite DB]                              [XTTS-v2 Model]
                     [File Storage]                           (MPS on Apple Silicon)
```

### Services

| Service | Role | Runtime |
|---------|------|---------|
| Frontend | Next.js UI on port 3000 | Docker |
| Backend | FastAPI on port 8000 | Docker |
| Redis | ARQ queue broker on port 6379 | Docker |
| Worker | ARQ worker running XTTS-v2 | Native Python (MPS GPU access) |

Worker runs natively (not in Docker) on M1 Mac to access Apple Silicon GPU via MPS. For cloud deployment, worker moves into Docker with nvidia-container-toolkit.

### File Storage Layout

```
./storage/
  books/       # Uploaded EPUB files
  audio/       # Generated audio (MP3), keyed by chapter_id + voice_id
  voices/      # Voice reference clips (WAV, 6-10s)
```

## Data Model

```sql
books
  id, title, author, language, original_filename,
  chapter_count, created_at

chapters
  id, book_id (FK), chapter_number, title,
  text_content, word_count

voices
  id, name, description, language,
  sample_audio_path, reference_clip_path,
  source (youtube/upload/preset), created_at

jobs
  id, chapter_id (FK), voice_id (FK),
  status (queued/processing/done/failed),
  audio_output_path, duration_seconds,
  error_message, created_at, completed_at

playback_state
  id, book_id (FK), voice_id (FK),
  current_chapter_id (FK), position_seconds, updated_at
```

- Jobs are per-chapter so audio generates incrementally
- Playback state tracks position per book+voice combination
- Audio is cached: same chapter+voice combo never regenerated

## User Flows

### Upload a Book

1. Drag & drop or file pick an EPUB file
2. Backend extracts text and chapters using `ebooklib`
3. Book appears in library with chapter list

### Create a Voice

**From YouTube:**
1. Paste YouTube URL
2. Backend: `yt-dlp` downloads audio -> `demucs` isolates vocals -> user trims to 6-10s clip in waveform editor
3. Reference clip stored as WAV

**From upload:**
1. Upload MP3/WAV recording directly
2. Trim to reference clip

**Presets:**
- Ship with 2-3 built-in Hungarian voices (male/female)

### Listen to a Book

1. Select book -> select voice -> hit play
2. If cached audio exists -> plays immediately
3. If not -> enqueues TTS jobs per chapter, shows progress
4. Plays chapter 1 as soon as ready, queues ahead
5. Playback controls: play/pause, skip chapter, speed, progress bar
6. Position remembered across sessions

## Pages

| Page | Purpose |
|------|---------|
| Library | Grid of uploaded books, upload button |
| Book Detail | Chapter list, voice picker, play/generate |
| Voices | Manage voices, create from YouTube/upload |
| Player | Persistent bottom bar with playback controls |
| Queue | View active/pending TTS jobs and progress |

## Tech Stack

### Frontend
- Next.js 14+ (App Router), TypeScript
- Tailwind CSS
- Wavesurfer.js (voice clip trimmer waveform)
- Native `<audio>` or Howler.js for playback
- SSE for real-time job progress

### Backend
- FastAPI (async)
- SQLite via aiosqlite + SQLAlchemy
- ARQ + Redis for job queue
- XTTS-v2 loaded once in worker, kept in memory

### Voice Pipeline
- yt-dlp (YouTube audio download)
- demucs (Meta's vocal isolation model)
- ffmpeg (trim, normalize, convert)

### TTS Generation
- XTTS-v2 with MPS backend (Apple Silicon)
- Chapters split into ~500 char chunks for XTTS-v2 context window, concatenated
- Output as MP3, cached by chapter_id + voice_id
- Worker processes one job at a time (GPU bound)

### Performance on M1 Pro
- ~0.5-1x realtime (10s audio takes ~10-20s to generate)
- Non-blocking: user listens while later chapters generate

## Not in v1

- No user accounts / auth (single user, local app)
- No MEK catalog browsing
- No PDF or TXT support (EPUB only)
- No real-time streaming TTS (full chapter generation, then play)
- No mobile app (responsive web only)

## Future Considerations

- MEK integration for free Hungarian book catalog
- PDF and TXT format support
- Cloud deployment with NVIDIA GPU for faster generation
- Multi-user with authentication
- Real-time streaming TTS as models improve
