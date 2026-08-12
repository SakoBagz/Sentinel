import random
from dataclasses import dataclass


@dataclass
class SeededRandom:
    seed: int

    def __post_init__(self) -> None:
        self._random = random.Random(self.seed)

    def random(self) -> float:
        return self._random.random()

    def uniform(self, start: float, end: float) -> float:
        return self._random.uniform(start, end)

    def randint(self, start: int, end: int) -> int:
        return self._random.randint(start, end)

