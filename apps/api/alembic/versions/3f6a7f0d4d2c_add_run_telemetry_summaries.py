"""add durable per-run telemetry summaries

Revision ID: 3f6a7f0d4d2c
Revises: 4c0c4b7c1e5a
Create Date: 2026-08-18 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3f6a7f0d4d2c"
down_revision: Union[str, None] = "4c0c4b7c1e5a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "run_telemetry_summaries",
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("generated_messages", sa.BigInteger(), nullable=False),
        sa.Column("delivered_messages", sa.BigInteger(), nullable=False),
        sa.Column("unique_delivered_messages", sa.BigInteger(), nullable=False),
        sa.Column("persisted_messages", sa.BigInteger(), nullable=False),
        sa.Column("missing_messages", sa.BigInteger(), nullable=False),
        sa.Column("duplicate_messages", sa.BigInteger(), nullable=False),
        sa.Column("out_of_order_messages", sa.BigInteger(), nullable=False),
        sa.Column("healthy_delivered_messages", sa.BigInteger(), nullable=False),
        sa.Column("modeled_latency_p50_ms", sa.Double(), nullable=False),
        sa.Column("modeled_latency_p95_ms", sa.Double(), nullable=False),
        sa.Column("modeled_latency_p99_ms", sa.Double(), nullable=False),
        sa.Column("persistence_queue_high_water_mark", sa.BigInteger(), nullable=False),
        sa.Column("simulated_mission_duration_ms", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["simulation_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("run_id"),
    )


def downgrade() -> None:
    op.drop_table("run_telemetry_summaries")
