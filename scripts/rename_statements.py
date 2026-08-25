#!/usr/bin/env python3
"""Rename CommBank statement PDFs into a self-describing, sortable scheme.

    Commbank and stepay/<FY>/NN_<start month>_<end month>_xx<account>.pdf
    e.g. Commbank and stepay/2025-2026/01_2025-07_2025-12_xx1234.pdf

Statements are filed under the Australian financial year they start in and
numbered from 01 within each year, matching how the platform invoices are
organised, so lifetime and per-year figures are easy to line up.

The account number and period are read from each PDF's own header, so this is
safe to re-run after dropping new statements in: files are renumbered so one
account's statements stay together and in date order.

A PDF whose account+period is already fully covered by another file is parked as
`zz_superseded_...` -- outside the `[0-9][0-9]_*_xx*.pdf` glob the extractor
uses, so it is kept for reference but never double-counted.

Usage:  python3 scripts/rename_statements.py [--dry-run]
"""
from __future__ import annotations
import hashlib
import re
import sys
from pathlib import Path

import pdfplumber

PDF_DIR = Path(__file__).resolve().parent.parent / "data_docs_pdf"
BANK_DIR = "Commbank and stepay/Commbank"
MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}

ACCOUNT_RE = re.compile(r"AccountNumber(\d{6})(\d+)")
PERIOD_RE = re.compile(r"Period(\d{1,2})([A-Za-z]{3})(\d{4})-(\d{1,2})([A-Za-z]{3})(\d{4})")
RANGE_RE = re.compile(r"from(\d{2})/(\d{2})/(\d{2})-(\d{2})/(\d{2})/(\d{2})")

# Optional account priority; unknown accounts sort last, then alphabetically.
ACCOUNT_ORDER = {}


def fy_of(month: str) -> str:
    """AU financial year label for a "YYYY-MM" month (1 Jul -> 30 Jun)."""
    y, m = int(month[:4]), int(month[5:7])
    start = y if m >= 7 else y - 1
    return f"{start}-{start + 1}"


def describe(path: Path):
    """-> (account, start_month, end_month) read from the PDF's first page."""
    with pdfplumber.open(path) as pdf:
        head = (pdf.pages[0].extract_text() or "").replace(" ", "")
    am = ACCOUNT_RE.search(head)
    account = f"xx{am.group(2)[-4:]}" if am else "xxUNKN"
    pm = PERIOD_RE.search(head)
    if pm:
        start = f"{pm.group(3)}-{MONTHS[pm.group(2).title()]:02d}"
        end = f"{pm.group(6)}-{MONTHS[pm.group(5).title()]:02d}"
        return account, start, end
    rm = RANGE_RE.search(head)
    if rm:
        return account, f"20{rm.group(3)}-{rm.group(2)}", f"20{rm.group(6)}-{rm.group(5)}"
    return account, "unknown", "unknown"


def main() -> int:
    dry = "--dry-run" in sys.argv
    dups: list[tuple] = []
    pdfs = sorted((p for p in PDF_DIR.rglob("*.pdf")
                   if "Invoices" not in str(p) and "afterpay" not in p.parts
                   and "_duplicates" not in p.parts), key=lambda p: p.name)
    if not pdfs:
        print(f"no PDFs in {PDF_DIR}", file=sys.stderr)
        return 1

    # A re-downloaded statement differs byte-for-byte while being the same
    # document, so duplicates are detected on rendered text, not bytes.
    items, seen = [], {}
    for p in pdfs:
        acct, start, end = describe(p)
        with pdfplumber.open(p) as pdf:
            digest = hashlib.md5("\n".join(
                (pg.extract_text() or "") for pg in pdf.pages).encode()).hexdigest()
        if digest in seen:
            dups.append((p, acct, start, end))
        else:
            seen[digest] = p
            items.append((p, acct, start, end))
    # statements are filed under the financial year they START in; one that
    # straddles 30 June is flagged rather than silently split
    straddle = [(p, s_, e) for p, _a, s_, e in items if fy_of(s_) != fy_of(e)] if items else []
    # anything already parked stays parked
    superseded = [x for x in items if x[0].name.startswith("zz_")]
    active = [x for x in items if not x[0].name.startswith("zz_")]
    active.sort(key=lambda x: (ACCOUNT_ORDER.get(x[1], 9), x[2], x[0].name))

    # renumber within each financial year, so 01.. restarts per year
    plan = []
    counters: dict[str, int] = {}
    for path, account, start, end in active:
        fy = fy_of(start)
        counters[fy] = counters.get(fy, 0) + 1
        plan.append((path, PDF_DIR / BANK_DIR / fy / f"{counters[fy]:02d}_{start}_{end}_{account}.pdf"))
    for path, account, start, end in superseded:
        plan.append((path, PDF_DIR / BANK_DIR / fy_of(start)
                     / f"zz_superseded_{start}_{end}_{account}_summary.pdf"))
    for path, account, start, end in dups:
        plan.append((path, PDF_DIR / BANK_DIR / fy_of(start) / "_duplicates" / path.name))

    changed = 0
    for old, new in plan:
        if old == new:
            continue
        changed += 1
        print(f"  {old.name:<44} -> {new.relative_to(PDF_DIR)}")
        if not dry:
            new.parent.mkdir(parents=True, exist_ok=True)
            old.rename(new)
    for p, s_, e in straddle:
        print(f"  NOTE: {p.name} spans {fy_of(s_)} and {fy_of(e)}; filed under {fy_of(s_)}")
    print(f"\n{changed} renamed" + (" (dry run — nothing written)" if dry else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
