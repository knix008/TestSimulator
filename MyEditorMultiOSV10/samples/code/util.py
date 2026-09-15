"""Python — type hints, dataclasses, comprehensions, f-strings."""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class FileInfo:
    path: Path
    size: int = 0
    tags: list[str] = field(default_factory=list)

    def describe(self) -> str:
        return f"{self.path.name}: {self.size:,} bytes {' '.join('#' + t for t in self.tags)}"


def scan(root: Path) -> list[FileInfo]:
    return [FileInfo(p, p.stat().st_size) for p in root.iterdir() if p.is_file()]


if __name__ == "__main__":
    for info in scan(Path(sys.argv[1] if len(sys.argv) > 1 else ".")):
        print(info.describe())
