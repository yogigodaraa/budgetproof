#!/usr/bin/env python3
"""Sort platform invoices into Australian financial-year folders.

    data_docs_pdf/<Platform>-Invoices/<FY>/...        e.g. Uber-Invoices/2025-2026/

The financial year is read from inside each PDF, never from the filename --
platform filenames are unreliable (DoorDash labels a statement "April 2027"
when it covers April 2026). AU FY runs 1 Jul -> 30 Jun and is named by the two
calendar years it spans.

Byte-identical duplicates are moved to a `_duplicates` folder inside the FY
rather than deleted, so nothing is lost and nothing is counted twice.

Usage:  python3 scripts/organise_invoices.py [--apply]     (default: dry run)
"""
from __future__ import annotations
import hashlib
import re
import shutil
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent / "data_docs_pdf"
MONTHS = {m: i + 1 for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June",
     "July", "August", "September", "October", "November", "December"])}
ABBR = {m[:3]: i + 1 for i, m in enumerate(MONTHS)}

# Uber monthly: "01-31 July 2025".  Uber annual: "FY 2025/2026".
UBER_MONTH = re.compile(r"\d{1,2}-\d{1,2}\s+([A-Z][a-z]+)\s+(\d{4})")
UBER_FY = re.compile(r"FY\s*(\d{4})/(\d{4})")
# DoorDash: "Oct 1-31 2025"
DD_PERIOD = re.compile(r"([A-Z][a-z]{2})\w*\s+\d{1,2}-\d{1,2},?\s*(\d{4})")
# DiDi: "Tax Summary for the Period 03/2026"
DIDI_PERIOD = re.compile(r"Period\s+(\d{2})/(\d{4})")


def fy_of(year: int, month: int) -> str:
    """AU financial year label for a calendar month."""
    start = year if month >= 7 else year - 1
    return f"{start}-{start + 1}"


def read_pdf(path: Path) -> tuple[str, str]:
    """-> (first-page text, full-document text). Cached per run by the caller."""
    with pdfplumber.open(path) as pdf:
        pages = [(p.extract_text() or "") for p in pdf.pages]
    return (pages[0] if pages else ""), "\n".join(pages)


def period_of(text: str) -> str | None:
    m = UBER_FY.search(text)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = UBER_MONTH.search(text)
    if m and m.group(1) in MONTHS:
        return fy_of(int(m.group(2)), MONTHS[m.group(1)])
    m = DD_PERIOD.search(text)
    if m and m.group(1) in ABBR:
        return fy_of(int(m.group(2)), ABBR[m.group(1)])
    m = DIDI_PERIOD.search(text)
    if m:
        return fy_of(int(m.group(2)), int(m.group(1)))
    return None


def main() -> int:
    apply = "--apply" in sys.argv
    moves, unknown = [], []
    seen: dict[str, Path] = {}

    for folder in sorted(f for f in ROOT.iterdir() if f.is_dir() and "invoice" in f.name.lower()):
        # Order matters: the first copy of a document seen becomes canonical and
        # the rest are parked. Prefer the plainly-named file over a "-2" re-download.
        pdfs = sorted((p for p in folder.rglob("*.pdf") if "_duplicates" not in p.parts),
                      key=lambda p: (bool(re.search(r"-\d\.pdf$", p.name)), p.name))
        for p in pdfs:
            try:
                head, full = read_pdf(p)
            except Exception:
                unknown.append(p)
                continue
            fy = period_of(head)
            if not fy:
                unknown.append(p)
                continue
            # Duplicate = same rendered content. These PDFs are regenerated per
            # download, so two copies of one statement differ byte-for-byte
            # while being the same document -- a bytes hash would miss them.
            digest = hashlib.md5(full.encode()).hexdigest()
            if digest in seen:
                dest = folder / fy / "_duplicates" / p.name
            else:
                seen[digest] = p
                dest = folder / fy / p.name
            if p != dest:
                moves.append((p, dest))

    for src, dest in moves:
        tag = "  [duplicate]" if "_duplicates" in dest.parts else ""
        rel = dest.relative_to(ROOT)
        print(f"  {src.name[:52]:<52} -> {rel.parent}{tag}")
        if apply:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))

    if unknown:
        print("\n  could not read a period from (left in place):")
        for p in unknown:
            print(f"    {p.relative_to(ROOT)}")

    print(f"\n{len(moves)} to move, {len(unknown)} unreadable"
          + ("" if apply else "   (dry run — pass --apply to move)"))
    if apply:
        for folder in sorted(f for f in ROOT.iterdir() if f.is_dir() and "invoice" in f.name.lower()):
            for d in sorted(folder.rglob("*")):
                if d.is_dir() and not any(d.iterdir()):
                    d.rmdir()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
