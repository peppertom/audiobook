from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import PlaybackState
from app.schemas import PlaybackStateUpdate, PlaybackStateOut

router = APIRouter(prefix="/api/playback", tags=["playback"])


@router.put("", response_model=PlaybackStateOut)
async def save_playback_state(state: PlaybackStateUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaybackState).where(
            PlaybackState.book_id == state.book_id,
            PlaybackState.voice_id == state.voice_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.current_chapter_id = state.current_chapter_id
        existing.position_seconds = state.position_seconds
    else:
        existing = PlaybackState(**state.model_dump())
        db.add(existing)
    await db.commit()
    await db.refresh(existing)
    return existing


@router.get("", response_model=PlaybackStateOut)
async def get_playback_state(
    book_id: int = Query(...), voice_id: int = Query(...), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PlaybackState).where(
            PlaybackState.book_id == book_id,
            PlaybackState.voice_id == voice_id,
        )
    )
    state = result.scalar_one_or_none()
    if not state:
        raise HTTPException(404, "No playback state found")
    return state
