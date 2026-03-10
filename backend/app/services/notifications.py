"""Notification service: in-app DB notifications + optional email via Resend."""
import logging
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Notification
from app.config import settings

logger = logging.getLogger(__name__)


async def _send_email(to_email: str, subject: str, html: str) -> None:
    """Send email via Resend API. Silently skipped if AUDIOBOOK_RESEND_API_KEY is not set."""
    if not settings.resend_api_key:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to_email],
                    "subject": subject,
                    "html": html,
                },
            )
            if not resp.is_success:
                logger.warning(f"Email send failed ({resp.status_code}): {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Email send error: {e}")


async def notify_job_done(
    db: AsyncSession,
    job_id: int,
    user_id: str,
    user_email: str,
    email_notifications: bool,
    chapter_title: str,
    chapter_number: int,
    book_title: str,
) -> None:
    label = chapter_title or f"Chapter {chapter_number}"
    title = f"Audio ready: {label}"
    body = f'"{book_title}" – {label} has been generated successfully.'

    notif = Notification(
        user_id=user_id,
        type="job_done",
        title=title,
        body=body,
        job_id=job_id,
    )
    db.add(notif)
    await db.commit()

    if email_notifications:
        html = f"""
        <h2 style="color:#16a34a">Your audiobook chapter is ready!</h2>
        <p>{body}</p>
        <p>Open the app to listen.</p>
        """
        await _send_email(user_email, title, html)


async def notify_job_failed(
    db: AsyncSession,
    job_id: int,
    user_id: str,
    user_email: str,
    email_notifications: bool,
    chapter_title: str,
    chapter_number: int,
    book_title: str,
    error: str,
) -> None:
    label = chapter_title or f"Chapter {chapter_number}"
    title = f"Generation failed: {label}"
    body = f'"{book_title}" – {label} could not be generated. Error: {error[:200]}'

    notif = Notification(
        user_id=user_id,
        type="job_failed",
        title=title,
        body=body,
        job_id=job_id,
    )
    db.add(notif)
    await db.commit()

    if email_notifications:
        html = f"""
        <h2 style="color:#dc2626">Audio generation failed</h2>
        <p>{body}</p>
        <p>You can retry from the Queue page.</p>
        """
        await _send_email(user_email, title, html)
