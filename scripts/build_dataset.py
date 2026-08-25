#!/usr/bin/env python3
"""Unify + categorise every source into one dataset the Terminus dashboard reads.

Inputs (all git-ignored, local only):
  data/commbank.json   - main bank feed            [extract_commbank.py]
  data/afterpay.csv    - Afterpay BNPL purchases    [extract_afterpay.py]
  data_docs_pdf/steppay.csv - StepPay BNPL feed
  data/income.json     - platform earnings (income source of truth)
  data/merchant_categories.json - LLM/manual map: merchant-key -> category (optional)
  data/overrides.json  - per-transaction category overrides: {txn_id: category} (optional)

Output: data/dataset.json  { meta, summary, income, spend, transactions }

Money model: BNPL repayments + internal/peer transfers are excluded from spend;
real BNPL spend comes from the purchase records (counted once). Income total =
platform table; bank platform credits kept only as a cross-check.
"""
from __future__ import annotations
import csv
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

from people_names import canonical_map
from taxonomy import (GROUPS, CAT_GROUP, GROUP_CLAIMABLE, categorize,
                      is_claimable, is_spend)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "dataset.json"


def merchant_key(desc: str) -> str:
    """Stable-ish merchant key: blank out digit runs (keeps merchant words that
    follow a reference number, e.g. DirectDebit209033SMARTRIDER), collapse, upper."""
    d = re.sub(r"\d+", " ", desc)             # digit runs -> space
    d = re.sub(r"[^A-Za-z&* ]", " ", d)
    d = re.sub(r"\s+", " ", d).strip().upper()
    return d[:28]


def txn_id(source: str, date: str, desc: str, amount: float) -> str:
    h = hashlib.sha1(f"{source}|{date}|{desc}|{amount}".encode()).hexdigest()
    return h[:12]


# alias map: normalise variants of the same person -> display name.
# Keep public defaults empty; users can add local aliases in their private copy.
PEER_ALIAS = {}
# tokens that look like a name but are not a person.
PEER_EXCLUDE = ("CBANETBANK", "NETBANK", "INSTITUT", "UBER", "DIDI", "WEMONEY",
                "DOORDASH", "SHERPA", "BEFOREPAY", "PTYLTD",
                "STEPPAY", "AFTERPAY", "MENULOG")

# words that end a name in a transfer description
NAME_STOP_PREFIX = ("PAYID", "TOPAYID", "FROMCOMMBANK", "COMMBANK", "PAYIDPHONE",
                    "PAYIDEMAIL", "FROMPAYID")
NAME_STOP = {"TO", "PAYID", "PHONE", "EMAIL", "COMMBANK", "APP", "FROM",
             "CREDITTOACCOUNT", "CREDIT", "PAYMENT", "PAYMENTFORSERVICES",
             "SAVING", "SAVINGS", "BSB", "ACC", "ACCOUNT", "REF", "VALUE", "DATE"}

_NOISE = {"AU", "AUS", "PTY", "LTD", "WA", "NSW", "VIC", "QLD", "SA", "NT", "ACT",
          "PERTH", "SYDNEY", "MELBOURNE", "THE", "PHONE", "PAYID", "FROM", "TO",
          "COMMBANK", "APP", "GIFT", "PYMT"}


def counterparty(desc: str):
    """Return a person/remittance name for peer transfers, else None."""
    u = desc.upper()
    if "RMTLY" in u or "REMITLY" in u:
        return "Remitly (international transfer)"
    # Older statements keep the spaces ("Fast Transfer From JANE SMITH");
    # newer ones collapse them ("FastTransferFromJANESMITH"). Tolerate both,
    # and take every name word up to the first structural word.
    m = re.search(r"(?:FAST\s*TRANSFER\s*FROM|TRANSFER\s*TO|TRANSFER\s*FROM)\s*-?\s*(.+)", u)
    if not m:
        return None
    words = []
    for w in re.findall(r"[A-Z][A-Z'\-]*", m.group(1)):
        # collapsed descriptions run the structural words together
        # ("PAYIDPHONEFROMCOMMBANKAPP"), so match on the prefix too
        if w in NAME_STOP or any(w.startswith(x) for x in NAME_STOP_PREFIX):
            break
        words.append(w)
    name = " ".join(words).strip("- ")
    first = name.split(" ")[0] if name else ""
    if not name or first in ("TO", "FROM", "XX") or first.startswith("XX"):
        return None
    if any(x in name.replace(" ", "") for x in PEER_EXCLUDE):
        return None
    # Names matching the user's own accounts should be handled as internal
    # transfers by project-specific rules, not as peer debt.
    flat = re.sub(r"^(MRS|MR|MS|DR)[\s\-]*", "", name.replace(" ", ""))
    return PEER_ALIAS.get(flat, name)


# brand roll-up: (brand, [UPPERCASE keywords]) — first match wins
BRAND_RULES = [
    ("BP", ["BP"]), ("Caltex / Ampol", ["CALTEX", "AMPOL", "REDDYEXPRESS"]),
    ("United Petroleum", ["UNITED"]), ("Shell / Coles Express", ["SHELL", "COLESEXPRESS"]),
    ("EG / Puma", ["EGGROUP", "PUMA"]),
    ("Costco", ["COSTCO"]), ("Woolworths", ["WOOLWORTHS"]), ("Coles", ["COLES"]),
    ("Aldi", ["ALDI"]), ("IGA", ["IGA"]), ("Spudshed", ["SPUDSHED"]),
    ("Kmart", ["KMART"]), ("Big W", ["BIGW"]), ("Target", ["TARGET"]),
    ("Officeworks", ["OFFICEWORKS"]), ("Bunnings", ["BUNNINGS"]), ("JB Hi-Fi", ["JBHIFI"]),
    ("Amazon", ["AMAZON"]), ("Apple", ["APPLE"]), ("Google", ["GOOGLE"]),
    ("Microsoft", ["MICROSOFT"]), ("Sephora", ["SEPHORA"]), ("H&M", ["H&M", "HENNES"]),
    ("McDonald's", ["MCDONALD"]), ("Starbucks", ["STARBUCKS"]), ("Zambrero", ["ZAMBRERO"]),
    ("Dome", ["DOME"]), ("Guzman y Gomez", ["GUZMAN"]), ("Hungry Jack's", ["HUNGRYJACK"]),
    ("KFC", ["KFC"]), ("Subway", ["SUBWAY"]), ("Miss Maud", ["MISSMAUD"]),
    ("Afterpay", ["AFTERPAY"]), ("StepPay", ["STEPPAY"]), ("Beforepay", ["BEFOREPAY"]),
    ("Uber", ["UBER"]), ("DiDi", ["DIDI"]), ("Remitly", ["RMTLY", "REMITLY"]),
    ("Medibank", ["MEDIBANK"]), ("HBF", ["HBF"]), ("RAC", ["RACINSURANCE", "RAC "]),
    ("Telstra", ["TELSTRA"]), ("Optus", ["OPTUS"]), ("Vodafone", ["VODAFONE"]),
    ("Specsavers", ["SPECSAVERS"]), ("Chemist Warehouse", ["CHEMISTWAREHOUSE"]),
    ("EasyPark", ["EASYPARK"]), ("SmartRider", ["SMARTRIDER"]), ("Transperth", ["TRANSPERTH"]),
    ("LinkedIn", ["LINKEDIN"]), ("Netflix", ["NETFLIX"]), ("Spotify", ["SPOTIFY"]),
    ("Dept of Transport", ["DOTTRAFFIC", "TRANSPORTWA", "DEPTOFTRANSPORT"]),
    ("Medibank", ["MEDIBANK"]), ("UWA", ["UWA"]),
]


def brand(desc: str) -> str:
    u = desc.upper()
    for b, keys in BRAND_RULES:
        if any(k.replace(" ", "") in u.replace(" ", "") if " " not in k else k in u for k in keys):
            return b
    return merchant_label(desc)


def merchant_label(desc: str) -> str:
    d = re.sub(r"^(Afterpay|StepPay):\s*", "", desc)
    d = re.sub(r"(?i)\b(order from|payment:?)\b\s*", "", d)
    d = re.sub(r"\d+", " ", d)
    d = re.sub(r"[^A-Za-z &*]", " ", d)
    toks = [t for t in d.split() if t.upper() not in _NOISE and len(t) > 1]
    label = " ".join(toks[:3]).title().replace("*", "")
    return label.strip() or desc[:18]


def load_json(p: Path, default):
    return json.loads(p.read_text()) if p.exists() else default


# keys on an income.json monthly row that are not income sources
NON_PLATFORM_KEYS = {"month", "reported_total", "fees", "activity", "derived",
                     "payg_withheld", "employer_super"}


def main():
    merchant_map = load_json(DATA / "merchant_categories.json", {})
    overrides = load_json(DATA / "overrides.json", {})
    income = json.loads((DATA / "income.json").read_text())

    txns = []

    def add(source, date, desc, amount, dirn, cat_desc=None, account=None):
        # cat_desc = string used for categorisation/brand (the real merchant for
        # BNPL purchases); display `desc` keeps the Afterpay:/StepPay: prefix.
        src = cat_desc if cat_desc is not None else desc
        cat = categorize(src, dirn)
        if not cat:                                   # try LLM/manual merchant map
            cat = merchant_map.get(merchant_key(src), "")
        if not cat:
            cat = "Other Income" if dirn == "credit" else ""   # blank spend = uncategorised
        tid = txn_id(source, date, desc, amount)
        if tid in overrides:                          # user wins
            cat = overrides[tid]
        txns.append({
            "id": tid, "date": date, "description": desc, "amount": round(amount, 2),
            "dir": dirn, "source": source, "category": cat or "Uncategorised",
            "group": CAT_GROUP.get(cat, "Uncategorised" if not cat else "Other"),
            "claimable": is_claimable(cat),
            "merchant": merchant_label(src),
            "brand": brand(src),
            "counterparty": counterparty(desc),
            # which bank account it landed in (CommBank only; None for BNPL feeds)
            "account": account,
        })

    # --- CommBank ---
    cb = json.loads((DATA / "commbank.json").read_text())
    for t in cb["transactions"]:
        add("commbank", t["date"], t["description"], t["amount"], t["type"],
            account=t.get("account"))

    # --- Afterpay (only purchases are spend; categorise by the real merchant) ---
    with (DATA / "afterpay.csv").open() as f:
        for r in csv.DictReader(f):
            if r["direction"] == "charge":
                merchant = re.sub(r"(?i)^order from\s*", "", r["description"]).strip()
                add("afterpay", r["date"], f"Afterpay: {r['description']}",
                    float(r["amount"]), "debit", cat_desc=merchant)

    # --- StepPay ---
    # StepPay is split into one file per financial year by
    # scripts/organise_steppay.py, which also removes the overlap between the
    # raw exports. Read every year file; skip _raw_exports, which still holds
    # the original overlapping downloads.
    sp_files = sorted(p for p in (ROOT / "data_docs_pdf").rglob("steppay_*.csv")
                      if "_raw_exports" not in p.parts)
    for sp in sp_files:
        with sp.open() as f:
            for row in csv.reader(f):
                if len(row) < 3:
                    continue
                d, amt, desc = row[0], row[1], row[2]
                try:
                    a = float(amt.replace("+", "").replace(",", ""))
                except ValueError:
                    continue
                iso = f"{d[6:10]}-{d[3:5]}-{d[0:2]}"
                if a >= 0:
                    add("steppay", iso, f"StepPay: {desc.strip()}", a, "credit",
                        cat_desc=desc.strip())
                else:
                    # Afterpay-via-StepPay already counted in Afterpay charges
                    if "AFTERPAY" in desc.upper():
                        continue
                    add("steppay", iso, f"StepPay: {desc.strip()}", abs(a), "debit",
                        cat_desc=desc.strip())

    txns.sort(key=lambda t: t["date"])

    # --- resolve people names across the whole feed ---
    # Done in one pass over every year at once, because "H Singh" can only be
    # matched to "Harvinder Singh" if both are in view. Names that clean to
    # nothing (payment notes, "Other Bank") stop being people at all.
    SPECIAL = {"Remitly (international transfer)", "Self (own accounts)"}
    raw_names = {t["counterparty"] for t in txns
                 if t["counterparty"] and t["counterparty"] not in SPECIAL}
    name_map, ambiguities = canonical_map(raw_names)
    for t in txns:
        cp = t["counterparty"]
        if not cp or cp in SPECIAL:
            continue
        t["counterparty"] = name_map.get(cp.upper())
    resolved = len({t["counterparty"] for t in txns if t["counterparty"]})
    print(f"people: {len(raw_names)} raw names -> {resolved} resolved")
    for a in ambiguities:
        print(f"  ambiguous, left unmerged: {a}")

    # tag StepPay/Afterpay purchase categories explicitly where still blank
    for t in txns:
        if t["category"] == "Uncategorised":
            if t["source"] == "afterpay":
                t["category"], t["group"] = "Afterpay Purchase", "BNPL"
            elif t["source"] == "steppay" and t["dir"] == "debit":
                t["category"], t["group"] = "StepPay Purchase", "BNPL"

    # --- aggregates ---
    spend_by_cat, spend_by_group, spend_by_month = (defaultdict(float) for _ in range(3))
    claimable_by_cat = defaultdict(float)
    bank_platform_income = 0.0
    uncategorised = 0
    for t in txns:
        g = CAT_GROUP.get(t["category"], "")
        if g == "Income" and t["dir"] == "credit":
            bank_platform_income += t["amount"]
        if t["dir"] == "debit" and is_spend(t["category"]):
            spend_by_cat[t["category"]] += t["amount"]
            spend_by_group[CAT_GROUP[t["category"]]] += t["amount"]
            spend_by_month[t["date"][:7]] += t["amount"]
            if t["claimable"]:
                claimable_by_cat[t["category"]] += t["amount"]
        if t["category"] == "Uncategorised":
            uncategorised += 1

    total_spend = round(sum(spend_by_cat.values()), 2)
    total_claimable = round(sum(claimable_by_cat.values()), 2)
    total_income = income["platform_totals"]["grand_total"]
    # GST applies to rideshare/delivery only — exclude WeMoney and salary (ECU/ACU jobs)
    # salary is not a taxable supply; the Tax page applies the registration date
    non_gst = income["platform_totals"].get("wemoney", 0) + income["platform_totals"].get("ecu", 0)
    rideshare_income = round(total_income - non_gst, 2)
    gst_on_income = round(rideshare_income / 11, 2)
    gst_credits = round(total_claimable / 11, 2)

    dataset = {
        "meta": {
            "app": "Terminus", "currency": "AUD",
            "period": {"from": income["monthly"][0]["month"], "to": income["monthly"][-1]["month"]},
            "txn_count": len(txns), "uncategorised": uncategorised,
            "taxonomy": {"groups": GROUPS, "group_claimable": GROUP_CLAIMABLE},
            "notes": income.get("note", ""),
        },
        "summary": {
            "total_income": round(total_income, 2),
            "total_spend": total_spend,
            "net": round(total_income - total_spend, 2),
            "total_claimable": total_claimable,
            "bank_platform_income_crosscheck": round(bank_platform_income, 2),
            "gst": {
                "rideshare_income_base": rideshare_income,
                "gst_on_income": gst_on_income,
                "gst_credits_on_expenses": gst_credits,
                "net_gst_payable": round(gst_on_income - gst_credits, 2),
                "note": "WeMoney excluded from GST base pending confirmation.",
            },
        },
        "income": {
            "by_platform": {k: v for k, v in income["platform_totals"].items() if k != "grand_total"},
            # full per-platform monthly rows so the UI can compute GST dynamically
            "monthly": [{"month": m["month"], "income": m["reported_total"],
                         "fees": round(sum(m.get("fees", {}).values()), 2),
                         "payg_withheld": m.get("payg_withheld", 0),
                         "activity": m.get("activity", {}),
                         # platform columns only -- everything else on the row
                         # (fees, activity, flags) is not an income source
                         "platforms": {k: v for k, v in m.items()
                                       if k not in NON_PLATFORM_KEYS
                                       and isinstance(v, (int, float))}}
                        for m in income["monthly"]],
        },
        "spend": {
            "by_group": {k: round(v, 2) for k, v in sorted(spend_by_group.items(), key=lambda x: -x[1])},
            "by_category": {k: round(v, 2) for k, v in sorted(spend_by_cat.items(), key=lambda x: -x[1])},
            "by_month": {k: round(v, 2) for k, v in sorted(spend_by_month.items())},
            "claimable_by_category": {k: round(v, 2) for k, v in sorted(claimable_by_cat.items(), key=lambda x: -x[1])},
        },
        "transactions": txns,
    }
    OUT.write_text(json.dumps(dataset, separators=(",", ":")))

    print(f"unified {len(txns)} txns | uncategorised spend rows: {uncategorised}")
    print(f"  income ${total_income:,.2f} | spend ${total_spend:,.2f} | net ${total_income-total_spend:,.2f}")
    print(f"  claimable ${total_claimable:,.2f} | GST income ${gst_on_income:,.2f} credits ${gst_credits:,.2f}")
    print("  spend by group:")
    for k, v in sorted(spend_by_group.items(), key=lambda x: -x[1]):
        print(f"     {k:18s} ${v:,.2f}")
    print(f"  -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size//1024} KB)")


if __name__ == "__main__":
    main()
