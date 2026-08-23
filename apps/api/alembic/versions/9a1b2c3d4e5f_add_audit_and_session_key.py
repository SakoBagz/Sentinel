"""add audit_events and simulation_runs.session_key

Revision ID: 9a1b2c3d4e5f
Revises: 3f6a7f0d4d2c
Create Date: 2026-08-23 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9a1b2c3d4e5f"
down_revision: Union[str, None] = "3f6a7f0d4d2c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("simulation_runs", sa.Column("session_key", sa.String(length=128), nullable=True))
    op.create_index("ix_simulation_runs_session_key", "simulation_runs", ["session_key"])
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            UPDATE simulation_runs
            SET session_key = configuration->>'session_key'
            WHERE configuration->>'session_key' IS NOT NULL
            """
        )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("actor_subject", sa.String(length=128), nullable=False),
        sa.Column("actor_role", sa.String(length=32), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_created", "audit_events", ["created_at"])
    op.create_index("ix_audit_events_resource", "audit_events", ["resource_type", "resource_id"])
    op.create_index("ix_audit_events_actor", "audit_events", ["actor_subject"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_actor", table_name="audit_events")
    op.drop_index("ix_audit_events_resource", table_name="audit_events")
    op.drop_index("ix_audit_events_created", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_simulation_runs_session_key", table_name="simulation_runs")
    op.drop_column("simulation_runs", "session_key")
