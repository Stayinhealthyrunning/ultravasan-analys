#!/usr/bin/env python3
"""Activate U3 modular loading by removing synchronous monolith preload."""
from __future__ import annotations

import argparse
from pathlib import Path

MONOLITH_TAG = '<script src="data/ultravasan-data.js"></script>'


def activate(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if MONOLITH_TAG not in text:
        return False
    path.write_text(text.replace(MONOLITH_TAG + "\n", "").replace(MONOLITH_TAG, ""), encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path, default=[Path("docs/index.html")])
    args = parser.parse_args()
    changed = []
    for path in args.paths:
        if activate(path):
            changed.append(str(path))
    print("U3 modular loading active:", ", ".join(changed) if changed else "already active")


if __name__ == "__main__":
    main()
