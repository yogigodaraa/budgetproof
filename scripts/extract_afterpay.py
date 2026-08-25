#!/usr/bin/env python3
"""Combine all Afterpay 'Pay in 4' monthly statement PDFs into one CSV.

Afterpay rows come in two kinds:
  * charge  -> "Order from <merchant>  $22.36"      (an actual purchase / spend)
  * payment -> "Payment: ... +$5.59" / "Payment 2 of 4 +$7.08"  (instalment repaid)
We keep both, tagged by `direction`, so spend can be aggregated from charges
without double-counting the repayments (which also appear in the bank feed).

Output: data/afterpay.csv
Usage:  python3 scripts/extract_afterpay.py
"""
from __future__ import annotations
import csv
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
AP_DIR = ROOT / "data_docs_pdf" / "afterpay"
if not AP_DIR.exists():                      # tolerate the folder being moved
    _found = sorted((ROOT / "data_docs_pdf").rglob("afterpay"))
    AP_DIR = _found[0] if _found else AP_DIR
OUT = ROOT / "data" / "afterpay.csv"

MONTHS = {m: i + 1 for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"])}

# "19 July - 18 Aug 2025"  /  "19 December - 18 January 2026"
PERIOD_RE = re.compile(
    r"(\d{1,2})\s+([A-Za-z]+)\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})")
ROW_RE = re.compile(r"^(\d{2})/(\d{2})\s+(.*?)\s+([+]?)\$([\d,]+\.\d{2})\s*$")
# bundled sub-rows: "700325306 Payment 2 of 4 +$7.08" (no date)
SUB_RE = re.compile(r"^(\d{6,})\s+(.*?)\s+([+]?)\$([\d,]+\.\d{2})\s*$")


def month3(name: str) -> int:
    for full, n in MONTHS.items():
        if full.lower().startswith(name.lower()[:3]):
            return n
    raise KeyError(name)


def period_year_map(text: str):
    """Map each month-number in the statement period to its calendar year."""
    m = PERIOD_RE.search(text)
    if not m:
        return {}
    d1, mon1, d2, mon2, year = m.groups()
    end_m, end_y = month3(mon2), int(year)
    start_m = month3(mon1)
    start_y = end_y - 1 if start_m > end_m else end_y  # Dec -> Jan wrap
    return {start_m: start_y, end_m: end_y}


def parse_pdf(path: Path):
    rows = []
    with pdfplumber.open(path) as pdf:
        full = "\n".join((p.extract_text() or "") for p in pdf.pages)
    ymap = period_year_map(full)
    cur_date = None
    for line in full.splitlines():
        line = line.strip()
        m = ROW_RE.match(line)
        if m:
            day, mon, desc, sign, amt = m.groups()
            mon_i = int(mon)
            year = ymap.get(mon_i) or (max(ymap.values()) if ymap else 0)
            cur_date = f"{year:04d}-{mon_i:02d}-{day}"
            # split order-no off the front of desc if present
            parts = desc.split(None, 1)
            if parts and (parts[0].isdigit() or parts[0] == "See"):
                order_no = parts[0] if parts[0].isdigit() else "bundled"
                description = parts[1] if len(parts) > 1 else ""
                if parts[0] == "See":  # "See Below"
                    description = description.replace("Below", "", 1).strip()
            else:
                order_no, description = "", desc
            if description.startswith("Bundled Payment"):
                direction = "payment-bundle"   # summary of the child rows below
            elif sign == "+":
                direction = "payment"
            else:
                direction = "charge"
            rows.append([cur_date, order_no, description, direction,
                         float(amt.replace(",", ""))])
            continue
        m = SUB_RE.match(line)
        if m and cur_date:
            order_no, desc, sign, amt = m.groups()
            rows.append([cur_date, order_no, desc,
                         "payment" if sign == "+" else "charge",
                         float(amt.replace(",", ""))])
    return rows


def main():
    files = sorted(AP_DIR.glob("statement-*.pdf"))
    all_rows = []
    for f in files:
        r = parse_pdf(f)
        print(f"{f.name}: {len(r)} rows")
        all_rows.extend(r)

    all_rows.sort(key=lambda x: x[0])
    OUT.parent.mkdir(exist_ok=True)
    with OUT.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "order_no", "description", "direction", "amount"])
        w.writerows(all_rows)

    charges = sum(r[4] for r in all_rows if r[3] == "charge")
    payments = sum(r[4] for r in all_rows if r[3] == "payment")
    bundles = sum(r[4] for r in all_rows if r[3] == "payment-bundle")
    print(f"\nTotal {len(all_rows)} rows from {len(files)} statements")
    print(f"Charges (purchases): ${charges:,.2f} | Payments (repaid): ${payments:,.2f}"
          f" | Bundle summaries (excluded): ${bundles:,.2f}")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
