#!/usr/bin/env python3
"""Restore verified Ultravasan sources from an authenticated private checkout.

Only aggregate counts are logged. Source contents and participant identifiers
are never printed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> tuple[int, str]:
    checksum = hashlib.sha256()
    size = 0
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            size += len(chunk)
            checksum.update(chunk)
    return size, checksum.hexdigest()


def destination(relative: str) -> Path:
    prefix = "source/"
    if not relative.startswith(prefix):
        raise SystemExit("Private manifest contains an unapproved Ultravasan path")
    target = Path(relative.removeprefix(prefix))
    approved = target == Path("data/ultravasan.sqlite") or (
        target.parent == Path("data/routes") and target.suffix.lower() == ".gpx"
    ) or (target.parts and target.parts[0] == "source")
    if not approved or target.is_absolute() or ".." in target.parts:
        raise SystemExit("Private manifest contains an unapproved Ultravasan path")
    return ROOT / target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--private-root", required=True, type=Path)
    args = parser.parse_args()
    project = args.private_root.resolve() / "ultravasan"
    manifest_path = project / "SOURCE_MANIFEST.json"
    if not manifest_path.is_file():
        raise SystemExit("Private Ultravasan source manifest is unavailable")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest.get("files")
    if not isinstance(files, list) or len(files) != 17:
        raise SystemExit("Private Ultravasan source manifest is invalid")

    restored = 0
    for entry in files:
        relative = entry.get("path")
        if not isinstance(relative, str):
            raise SystemExit("Private Ultravasan source manifest is invalid")
        source = project / relative
        expected = (entry.get("bytes"), entry.get("sha256"))
        if not source.is_file() or digest(source) != expected:
            raise SystemExit("A private Ultravasan source failed integrity verification")
        target = destination(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        if digest(target) != expected:
            raise SystemExit("A restored Ultravasan source failed verification")
        restored += 1
    print(f"Private Ultravasan sources restored and verified: {restored}")


if __name__ == "__main__":
    main()
