#!/usr/bin/env python3
"""Merge the StepPay CSV exports and split them into financial-year files.

StepPay is exported in overlapping windows -- the same transaction appears in
several downloads -- so the merge is overlap-safe: for each identical
(date, amount, description) it keeps the HIGHEST count seen in any single
export, never the sum. That removes cross-file duplication while preserving a
genuine repeat (two identical purchases on one day appear twice in one export,
and stay twice).

Output: data_docs_pdf/Commbank and stepay/Step-pay/<FY>/steppay_<FY>.csv
Usage:  python3 scripts/organise_steppay.py [--dry-run]
"""
from __future__ import annotations
import csv
import shutil
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "data_docs_pdf" / "Commbank and stepay"
OUT = BASE / "Step-pay"


def fy_of(iso: str) -> str:
    y, m = int(iso[:4]), int(iso[5:7])
    start = y if m >= 7 else y - 1
    return f"{start}-{start + 1}"


def read(path: Path) -> list[tuple[str, str, str]]:
    rows = []
    with path.open(newline="") as fh:
        for r in csv.reader(fh):
            if len(r) >= 3 and r[0].count("/") == 2:
                d, mth, y = r[0].split("/")
                rows.append((f"{y}-{mth}-{d}", r[1], r[2]))
    return rows


def main() -> int:
    dry = "--dry-run" in sys.argv
    sources = sorted(p for p in BASE.rglob("*.csv") if p.parent.name != "_merged")
    if not sources:
        print(f"no CSVs under {BASE}", file=sys.stderr)
        return 1

    merged: Counter = Counter()
    total_read = 0
    for p in sources:
        rows = read(p)
        total_read += len(rows)
        counts = Counter(rows)
        print(f"  {p.name:<20} {len(rows):>5} rows  {min(r[0] for r in rows)} -> {max(r[0] for r in rows)}")
        for key, n in counts.items():
            merged[key] = max(merged[key], n)      # overlap-safe

    kept = sum(merged.values())
    print(f"\n  read {total_read} rows across {len(sources)} exports")
    print(f"  {kept} unique rows kept, {total_read - kept} duplicate rows dropped")

    by_fy: dict[str, list] = {}
    for (iso, amount, desc), n in merged.items():
        for _ in range(n):
            by_fy.setdefault(fy_of(iso), []).append((iso, amount, desc))

    print()
    for fy in sorted(by_fy):
        rows = sorted(by_fy[fy], reverse=True)
        dest = OUT / fy / f"steppay_{fy}.csv"
        print(f"  {fy}  {len(rows):>5} rows -> {dest.relative_to(BASE)}")
        if dry:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("w", newline="") as fh:
            w = csv.writer(fh, quoting=csv.QUOTE_ALL)
            for iso, amount, desc in rows:
                y, m, d = iso.split("-")
                w.writerow([f"{d}/{m}/{y}", amount, desc, ""])

    if not dry:
        # keep the raw exports, but out of the way of the loaders
        raw = OUT / "_raw_exports"
        raw.mkdir(parents=True, exist_ok=True)
        for p in sources:
            if p.parent.name.startswith("20"):
                continue
            shutil.move(str(p), str(raw / p.name))
    print("\n(dry run — nothing written)" if dry else "\ndone")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
