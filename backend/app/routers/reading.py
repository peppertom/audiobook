from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ReadingState
from app.schemas import ReadingStateOut, ReadingStateUpdate
from app.auth import get_current_user

router = APIRouter(prefix="/api/reading", tags=["reading"])


@router.get("/{book_id}", response_model=ReadingStateOut)
async def get_reading_state(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(ReadingState).where(
            ReadingState.user_id == current_user.id,
            ReadingState.book_id == book_id,
        )
    )
    state = result.scalar_one_or_none()
    if not state:
        raise HTTPException(status_code=404, detail="No reading state found")
    return state


@router.put("/{book_id}", response_model=ReadingStateOut)
async def save_reading_state(
    book_id: int,
    body: ReadingStateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(ReadingState).where(
            ReadingState.user_id == current_user.id,
            ReadingState.book_id == book_id,
        )
    )
    state = result.scalar_one_or_none()

    if state:
        state.current_chapter_id = body.current_chapter_id
        state.scroll_position = body.scroll_position
        state.paragraph_index = body.paragraph_index
        state.reading_progress = body.reading_progress
        state.audio_position = body.audio_position
        state.voice_id = body.voice_id
    else:
        state = ReadingState(
            user_id=current_user.id,
            book_id=book_id,
            current_chapter_id=body.current_chapter_id,
            scroll_position=body.scroll_position,
            paragraph_index=body.paragraph_index,
            reading_progress=body.reading_progress,
            audio_position=body.audio_position,
            voice_id=body.voice_id,
        )
        db.add(state)

    await db.commit()
    await db.refresh(state)
    return state
