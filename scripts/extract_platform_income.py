#!/usr/bin/env python3
"""Extract per-month income and platform fees from the platform tax documents.

Reads what each platform officially reports, rather than inferring income from
bank deposits -- most income never lands in the tracked accounts, and Uber pays
net of its service fee, so the bank alone understates earnings.

Sources (data_docs_pdf/<Platform>-Invoices/<FY>/):
  Uber   "<Year> <Month> Monthly Summary.pdf"          -> Rasier (rideshare)
                                                          + Portier (delivery)
         "... Monthly Summary for Delivery - Pack and Deliver.pdf"
                                                       -> Uber Cado, a SEPARATE
                                                          entity not included in
                                                          the main summary
  DoorDash "Statement - <Month> <Year>.pdf"
  DiDi     "DiDi Tax Summary <YYYY-MM>.pdf"

Output: data/platform_income.json  { months: { "YYYY-MM": {...} }, checks: [...] }
Usage:  python3 scripts/extract_platform_income.py
"""
from __future__ import annotations
import json
import re
from collections import defaultdict
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "data_docs_pdf"
OUT = ROOT / "data" / "platform_income.json"

MONTHS = {m: i + 1 for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June",
     "July", "August", "September", "October", "November", "December"])}
ABBR = {m[:3]: i + 1 for i, m in enumerate(MONTHS)}

PERIOD = re.compile(r"(\d{1,2})-(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})")
DD_PERIOD = re.compile(r"([A-Z][a-z]{2})\w*\s+\d{1,2}-\d{1,2},?\s*(\d{4})")
DIDI_PERIOD = re.compile(r"Period\s+(\d{2})/(\d{4})")


def text_of(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


def money(text: str, label: str) -> float:
    """Amount following a label. Handles both "$1,234.56" and "A$1,234.56"."""
    m = re.search(rf"{re.escape(label)}\s*A?\$([\d,]+\.\d{{2}})", text)
    return float(m.group(1).replace(",", "")) if m else 0.0


# Activity metrics the documents actually carry. NOTE: none of them report
# HOURS -- not Uber, not DoorDash -- so an hourly rate cannot be derived from
# these files. km/trips are real; DoorDash reports payout counts only, with no
# distance, delivery count or time at all.
def blank_month() -> dict:
    return {k: 0.0 for k in (
        "uber_x", "uber_eats", "uber_other", "uber_pnd",
        "uber_service_fee", "uber_other_charges", "uber_third_party",
        "didi_gross", "didi_fee", "doordash",
        "uber_km", "uber_trips", "uber_pnd_km", "uber_pnd_trips",
        "didi_km", "doordash_payouts")}


def main() -> int:
    months: dict[str, dict] = defaultdict(blank_month)
    checks: list[str] = []
    seen_uber_months: set[str] = set()

    # ---- Uber: main monthly summaries (Rasier + Portier) ----
    for p in sorted((DOCS / "Uber-Invoices").rglob("*Monthly Summary.pdf")):
        if "_duplicates" in p.parts or "Pack and Deliver" in p.name:
            continue
        t = text_of(p)
        m = PERIOD.search(t)
        if not m or m.group(3) not in MONTHS:
            checks.append(f"unreadable period: {p.name}")
            continue
        key = f"{m.group(4)}-{MONTHS[m.group(3)]:02d}"
        seen_uber_months.add(key)
        r = months[key]
        r["uber_x"] += money(t, "Total Transportation income")
        r["uber_eats"] += money(t, "Total Delivery income")
        r["uber_other"] += money(t, "Total Other Income")
        r["uber_service_fee"] += money(t, "Uber service fee (transportation leads)*")
        r["uber_other_charges"] += money(t, "Other charges from Uber")
        r["uber_third_party"] += money(t, "Charges from 3rd parties (tolls/airports/government)")
        hm = re.search(r"([\d,]+) km\s+([\d,]+)\s+\$", t)
        if hm:
            r["uber_km"] += float(hm.group(1).replace(",", ""))
            r["uber_trips"] += float(hm.group(2).replace(",", ""))

    # ---- Uber: Pack and Deliver (Uber Cado) -- a separate entity ----
    for p in sorted((DOCS / "Uber-Invoices").rglob("*Pack and Deliver*.pdf")):
        if "_duplicates" in p.parts or "Yearly" in p.name:
            continue
        t = text_of(p)
        m = PERIOD.search(t)
        if not m or m.group(3) not in MONTHS:
            continue
        key = f"{m.group(4)}-{MONTHS[m.group(3)]:02d}"
        months[key]["uber_pnd"] += (money(t, "Total Pack and Deliver income")
                                    + money(t, "Total Other Income"))
        km = re.search(r"On Trip Mileage\s+([\d,]+) km", t)
        if km:
            months[key]["uber_pnd_km"] += float(km.group(1).replace(",", ""))
        tr = re.search(r"([\d,]+)\s+\$[\d,.]+\s*\nTrips Tips", t)
        if tr:
            months[key]["uber_pnd_trips"] += float(tr.group(1).replace(",", ""))

    # ---- DoorDash ----
    for p in sorted((DOCS / "Doordash Invoices").rglob("*.pdf")):
        if "_duplicates" in p.parts:
            continue
        t = text_of(p)
        m = DD_PERIOD.search(t)
        if not m or m.group(1) not in ABBR:
            continue                      # empty month: no payouts
        key = f"{m.group(2)}-{ABBR[m.group(1)]:02d}"
        net = money(t, "Net Total")
        months[key]["doordash"] += net or money(t, "Payout Subtotal")
        n = re.search(r"Independent Payouts \((\d+)\)", t)
        if n:
            months[key]["doordash_payouts"] += float(n.group(1))

    # ---- DiDi ----
    for p in sorted((DOCS / "DIDI Invoices").rglob("*.pdf")):
        if "_duplicates" in p.parts:
            continue
        t = text_of(p)
        m = DIDI_PERIOD.search(t)
        if not m:
            continue
        key = f"{m.group(2)}-{int(m.group(1)):02d}"
        r = months[key]
        r["didi_gross"] += money(t, "SUB-TOTAL") + money(t, "Rewards")
        r["didi_fee"] += money(t, "DiDi Service Fee")
        km = re.search(r"ON TRIP DISTANCE\s+([\d,.]+) Km", t, re.I)
        if km:
            r["didi_km"] += float(km.group(1).replace(",", ""))

    # ---- reconcile the monthly rows against each Uber annual summary ----
    # The annual summary is authoritative. Where exactly one monthly file is
    # absent, the shortfall IS that month and is filled in (flagged "derived").
    # Any other shortfall is reported, never silently absorbed.
    for p in sorted((DOCS / "Uber-Invoices").rglob("*Annual tax Summary*.pdf")):
        if "_duplicates" in p.parts:
            continue
        t = text_of(p)
        fy = re.search(r"FY\s*(\d{4})/(\d{4})", t)
        if not fy:
            continue
        y0 = int(fy.group(1))
        rng = [f"{y0}-{m:02d}" for m in range(7, 13)] + [f"{y0+1}-{m:02d}" for m in range(1, 7)]
        got = round(sum(months[k]["uber_x"] + months[k]["uber_eats"] + months[k]["uber_other"]
                        for k in rng), 2)
        # newer layout; the FY2022/23 summary uses an older one ("Total A$...")
        want = round(money(t, "Transportation income") + money(t, "Delivery income")
                     + money(t, "Other Income"), 2)
        if not want:
            want = round(money(t, "Delivery fee") + money(t, "Delivery incentives")
                         + money(t, "Tips"), 2)
        if not want:
            continue
        gap = round(want - got, 2)
        if abs(gap) <= 0.01:
            checks.append(f"FY{y0}-{y0+1} Uber: monthly sum matches annual ({got:,.2f})")
            continue
        absent = [k for k in rng if k not in seen_uber_months]
        if len(absent) == 1 and gap > 0:
            months[absent[0]]["uber_eats"] += gap
            months[absent[0]]["derived"] = True
            checks.append(f"FY{y0}-{y0+1} Uber: {absent[0]} summary missing; "
                          f"derived {gap:,.2f} from the annual total")
        elif not absent:
            # every month is present, so the difference is Uber's own: report it
            # per component so a trivial tips rounding is not mistaken for a
            # missing statement.
            parts = []
            for label, key, annual in (
                ("transport", "uber_x", money(t, "Transportation income")),
                ("delivery", "uber_eats", money(t, "Delivery income")),
                ("other", "uber_other", money(t, "Other Income")),
            ):
                sub = round(sum(months[k][key] for k in rng), 2)
                if abs(sub - annual) > 0.01:
                    parts.append(f"{label} {sub - annual:+,.2f}")
            checks.append(f"FY{y0}-{y0+1} Uber: all 12 summaries present; monthly sum differs "
                          f"from annual by {gap:,.2f} in Uber's own figures ("
                          + ", ".join(parts) + "); monthly figures kept")
        else:
            checks.append(f"FY{y0}-{y0+1} Uber: monthly sum {got:,.2f} != annual {want:,.2f} "
                          f"(gap {gap:,.2f}; {len(absent)} months without a summary)")

    clean = {k: {kk: (round(vv, 2) if isinstance(vv, float) else vv) for kk, vv in v.items()}
             for k, v in sorted(months.items())}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"months": clean, "checks": checks}, indent=2) + "\n")

    print(f"{len(clean)} months  ({min(clean)} -> {max(clean)})")
    for c in checks:
        print(f"  {c}")
    print(f"\nWrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
