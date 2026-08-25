#!/usr/bin/env python3
"""Extract CommBank Smart Access statement PDFs into normalised JSON.

Strategy: the PDF collapses the Debit/Credit columns in plain text, so we use
each word's x-coordinate (right edge) to tell which money column it sits in:
    Debit   -> x1 ~ 389
    Credit  -> x1 ~ 442
    Balance -> x1 ~ 540 (carries a CR/DR suffix)
A transaction is closed by the line that carries a running balance. We then
reconcile the running balance forward as a correctness check.

Output: data/commbank.json  (does NOT convert to CSV, per request)
Usage:  python3 scripts/extract_commbank.py
"""
from __future__ import annotations
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "data_docs_pdf"
OUT = ROOT / "data" / "commbank.json"

# Statement PDFs are discovered, not hardcoded. Files are named
#     NN_<start month>_<end month>_xx<account>.pdf     e.g. 01_2025-07_2025-12_xx1234.pdf
# so the account and period are readable at a glance and statements for one
# account sort together. Anything outside that pattern is ignored on purpose --
# that is how a superseded duplicate (zz_superseded_*) is kept out of the feed
# without deleting it. Run scripts/rename_statements.py after adding a file.
# Searched recursively, so statements can live in per-financial-year subfolders
# (data_docs_pdf/Commbank and stepay/2025-2026/...) the same way the platform
# invoices do, without the extractor caring where they sit.
STMT_GLOB = "**/[0-9][0-9]_*_xx*.pdf"

MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}

# The posting date is usually its own word ("01Jul"), but on some pages the PDF
# kerning glues it to the description ("25MayFastTransferFromDIDI..."), so match
# the date as a PREFIX and hand the remainder back as description text. The month
# alternation is spelled out so a description like "12MonthPlan" cannot match.
DATE_RE = re.compile(
    r"^(\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(.*)$")
VALUEDATE_RE = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")       # 27/06/2025
# Transaction accounts print bare amounts ("165.00"); saver accounts prefix a
# dollar sign ("$165.00"). Accept either.
AMOUNT_RE = re.compile(r"^\$?([\d,]+\.\d{2})(CR|DR)?$")
PERIOD_RE = re.compile(r"Period\s*(\d{1,2})([A-Za-z]{3})(\d{4})")
ACCOUNT_RE = re.compile(r"AccountNumber\s*(\d{6})(\d+)")

# x1 (right edge) windows for each money column
DEBIT = (375, 402)
CREDIT = (425, 458)
BALANCE = (490, 999)

SKIP_PREFIXES = ("Statement", "AccountNumber", "Page", "Date", "Transaction", "Enquiries")

# Older statements print the page header as separate words that land on the
# same line band as the first transaction of the page, e.g.
#     (Page 3 of 14) 06 6134 11196441 Account Number Fast Transfer From - AMIT
# The transaction is real, so the header is stripped off the front rather than
# the whole line being skipped.
HEADER_WORDS = {"Your", "Statement", "(Page", "Page", "of", "Account",
                "Number", "Enquiries", "Period"}


def strip_header(texts, toks):
    """Drop leading page-header words, but only on a line that has one."""
    if not any(t in HEADER_WORDS for t in texts):
        return texts, toks
    i = 0
    while i < len(texts):
        t = texts[i]
        if t in HEADER_WORDS or t.isdigit() or re.fullmatch(r"\d+\)", t):
            i += 1
            continue
        break
    return texts[i:], toks[i:]


def col(x1: float):
    if DEBIT[0] <= x1 <= DEBIT[1]:
        return "debit"
    if CREDIT[0] <= x1 <= CREDIT[1]:
        return "credit"
    if x1 >= BALANCE[0]:
        return "balance"
    return None


def num(s: str) -> float:
    return float(s.replace(",", ""))


def parse_pdf(path: Path):
    """Parse one statement PDF. Statements for different accounts can sit side by
    side in data_docs_pdf/ -- each transaction carries the account it belongs to
    so balances are never reconciled across two different accounts."""
    txns = []
    start_year = start_month = None
    with pdfplumber.open(path) as pdf:
        # period header -> starting year/month
        head = pdf.pages[0].extract_text() or ""
        am = ACCOUNT_RE.search(head.replace(" ", ""))
        account = f"xx{am.group(2)[-4:]}" if am else "unknown"
        m = PERIOD_RE.search(head.replace(" ", ""))
        if m:
            start_month = MONTHS[m.group(2).title()]
            start_year = int(m.group(3))

        year = start_year
        prev_month = start_month

        # description buffer for the current (not yet closed) transaction
        buf_desc: list[str] = []
        post_date = None        # (day, month)
        value_date = None       # ISO string
        txn_has_date = False    # did THIS pending txn start with a date line?

        def resolve_year(month: int) -> int:
            nonlocal year, prev_month
            if prev_month is not None and month < prev_month - 1:
                # wrapped Dec -> Jan
                year += 1
            prev_month = month
            return year

        for page in pdf.pages:
            words = page.extract_words(use_text_flow=False)
            lines = defaultdict(list)
            for w in words:
                lines[round(w["top"])].append(w)

            for top in sorted(lines):
                toks = sorted(lines[top], key=lambda w: w["x0"])
                # Drop page furniture before anything else looks at the line:
                #  - the barcode strip (long run hard against the left margin)
                #  - the lone "(" / "$" glyphs older statements print in the
                #    debit column, which otherwise accumulate into descriptions
                # Anything ending left of x=40 is barcode: the Date column
                # starts around x=58, so nothing legitimate lives out there.
                # Older statements break the barcode into SHORT fragments
                # ("9R852ZZ"), which a length test lets through -- and once one
                # lands on a transaction's line the row loses its posting date
                # and is swallowed into the next description.
                toks = [t for t in toks
                        if t["x1"] >= 40
                        and t["text"] not in ("(", ")", "$")]
                texts = [t["text"] for t in toks]
                if not texts:
                    continue
                # Saver-account statements split the posting date into two words
                # ("01" "Jul") where transaction accounts fuse it ("01Jul").
                # Normalise to the fused form so one date rule covers both.
                if (len(texts) > 1 and re.fullmatch(r"\d{1,2}", texts[0])
                        and texts[1][:3] in MONTHS):
                    texts = [texts[0] + texts[1][:3]] + texts[2:]
                    toks = toks[1:]
                texts, toks = strip_header(texts, toks)
                if not texts:
                    continue
                first = texts[0]
                # skip page furniture
                if any(first.startswith(p) for p in SKIP_PREFIXES):
                    continue
                # repeated column header (Date col may be blank -> starts "Transaction")
                if {"Debit", "Credit", "Balance"} <= set(texts):
                    continue
                # end-of-statement summary box (Opening/Total debits/credits/Closing)
                if "Totaldebits" in texts or "Totalcredits" in texts:
                    continue

                # classify money tokens on this line
                amounts = {}
                for t in toks:
                    am = AMOUNT_RE.match(t["text"])
                    if am:
                        c = col(t["x1"])
                        if c:
                            amounts[c] = (num(am.group(1)), am.group(2))

                # a new posting date?
                dm = DATE_RE.match(first)
                if dm:
                    post_date = (int(dm.group(1)), MONTHS[dm.group(2)])
                    txn_has_date = True
                    # the rest of this line (minus the date) is description; any
                    # text fused onto the date token stays at the front of it
                    tail = dm.group(3)
                    rest = ([tail] if tail else []) + texts[1:]
                else:
                    rest = texts

                # capture value date if present and strip it from description
                desc_parts = []
                for t in rest:
                    vm = VALUEDATE_RE.match(t)
                    if vm:
                        value_date = f"{vm.group(3)}-{vm.group(2)}-{vm.group(1)}"
                        continue
                    if t == "ValueDate" or AMOUNT_RE.match(t) or t.startswith("Cardxx"):
                        continue
                    desc_parts.append(t)
                buf_desc.extend(desc_parts)

                desc_text = " ".join(buf_desc)

                # OPENING / CLOSING balance lines just set the running balance
                if "OPENINGBALANCE" in desc_text or "CLOSINGBALANCE" in desc_text:
                    buf_desc = []
                    value_date = None
                    txn_has_date = False
                    continue

                # transaction closes when a balance is present (and it is a real
                # dated transaction, not the end-of-statement summary values line)
                if "balance" in amounts and txn_has_date:
                    bal, balsfx = amounts["balance"]
                    balance = bal if balsfx != "DR" else -bal
                    amount = None
                    ttype = None
                    if "debit" in amounts:
                        amount, ttype = amounts["debit"][0], "debit"
                    elif "credit" in amounts:
                        amount, ttype = amounts["credit"][0], "credit"

                    if amount is not None and post_date is not None:
                        y = resolve_year(post_date[1])
                        iso = f"{y:04d}-{post_date[1]:02d}-{post_date[0]:02d}"
                        txns.append({
                            "date": iso,
                            "value_date": value_date or iso,
                            "description": desc_text.strip(),
                            "amount": round(amount, 2),
                            "type": ttype,
                            "balance": round(balance, 2),
                            "account": account,
                            "stmt": path.name,
                        })
                    buf_desc = []
                    value_date = None
                    txn_has_date = False
    return txns


def reconcile(txns):
    """Walk balances forward; flag rows where running balance != stated."""
    issues = []
    prev = None
    prev_stmt = None
    for i, t in enumerate(txns):
        if prev is not None and (t["stmt"], t["account"]) == prev_stmt:
            delta = t["amount"] if t["type"] == "credit" else -t["amount"]
            expected = round(prev + delta, 2)
            if abs(expected - t["balance"]) > 0.01:
                issues.append({"index": i, "date": t["date"],
                               "desc": t["description"][:40],
                               "expected": expected, "stated": t["balance"]})
        prev = t["balance"]
        prev_stmt = (t["stmt"], t["account"])
    return issues


def dedupe(txns):
    """Drop rows that two OVERLAPPING statements both report.

    Scoped deliberately: only a row matching one from a *different* statement is
    a duplicate. Within a single statement an identical row can be genuine -- a
    transfer out and straight back in repeats the amount, description AND the
    running balance -- so intra-statement repeats are always kept.
    """
    seen = {}
    out = []
    dropped = 0
    for t in txns:
        key = (t["account"], t["date"], t["description"], t["amount"], t["type"], t["balance"])
        if key in seen and seen[key] != t["stmt"]:
            dropped += 1
            continue
        seen[key] = t["stmt"]
        out.append(t)
    return out, dropped


def main():
    files = sorted(PDF_DIR.glob(STMT_GLOB), key=lambda p: p.name)
    if not files:
        print(f"!! no {STMT_GLOB} in {PDF_DIR}", file=sys.stderr)
        return

    all_txns = []
    for p in files:
        rows = parse_pdf(p)
        span = f"{rows[0]['date']} -> {rows[-1]['date']}" if rows else "empty"
        acct = rows[0]["account"] if rows else "?"
        print(f"{p.name}: {len(rows)} transactions  [{acct}]  ({span})")
        all_txns.extend(rows)

    all_txns, dropped = dedupe(all_txns)
    if dropped:
        print(f"deduped: dropped {dropped} rows already covered by another statement")

    issues = reconcile(all_txns)   # runs in statement order, before re-sorting
    # statements are parsed per account, so sort the merged feed chronologically
    all_txns.sort(key=lambda t: (t["date"], t["account"]))
    debit = round(sum(t["amount"] for t in all_txns if t["type"] == "debit"), 2)
    credit = round(sum(t["amount"] for t in all_txns if t["type"] == "credit"), 2)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "commbank",
        "accounts": sorted({t["account"] for t in all_txns}),
        "count": len(all_txns),
        "totals": {"debit": debit, "credit": credit},
        "reconciliation_issues": len(issues),
        "transactions": all_txns,
    }, indent=2))

    span = f"{all_txns[0]['date']} -> {all_txns[-1]['date']}" if all_txns else "empty"
    print(f"\nCoverage: {span}")
    print(f"Total: {len(all_txns)} txns | debits ${debit:,.2f} | credits ${credit:,.2f}")
    print(f"Reconciliation mismatches: {len(issues)}")
    for x in issues[:15]:
        print(f"  [{x['index']}] {x['date']} {x['desc']!r} expected {x['expected']} got {x['stated']}")
    print(f"\nWrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
