"""user_id NOT NULL on books, voices, jobs, playback_state

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Delete rows with NULL user_id (orphaned data from before auth)
    op.execute("DELETE FROM jobs WHERE user_id IS NULL")
    op.execute("DELETE FROM playback_state WHERE user_id IS NULL")
    op.execute("DELETE FROM voices WHERE user_id IS NULL")
    op.execute("DELETE FROM books WHERE user_id IS NULL")

    # Alter columns to NOT NULL with CASCADE on delete
    with op.batch_alter_table("books") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.String(36), nullable=False)

    with op.batch_alter_table("voices") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.String(36), nullable=False)

    with op.batch_alter_table("jobs") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.String(36), nullable=False)

    with op.batch_alter_table("playback_state") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.String(36), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.String(36), nullable=True)

    with op.batch_alter_table("voices") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.String(36), nullable=True)

    with op.batch_alter_table("jobs") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.String(36), nullable=True)

    with op.batch_alter_table("playback_state") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.String(36), nullable=True)
