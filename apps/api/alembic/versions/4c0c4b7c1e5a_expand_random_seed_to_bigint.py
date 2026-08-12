"""expand simulation run seeds to bigint

Revision ID: 4c0c4b7c1e5a
Revises: 8b28d94d876b
Create Date: 2026-08-12 14:35:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4c0c4b7c1e5a"
down_revision: Union[str, None] = "8b28d94d876b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    with op.batch_alter_table("simulation_runs") as batch_op:
        batch_op.alter_column(
            "random_seed",
            existing_type=sa.Integer(),
            type_=sa.BigInteger(),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("simulation_runs") as batch_op:
        batch_op.alter_column(
            "random_seed",
            existing_type=sa.BigInteger(),
            type_=sa.Integer(),
            existing_nullable=False,
        )
