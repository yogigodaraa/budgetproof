#!/usr/bin/env python3
"""Turn raw transfer descriptions into one canonical name per person.

Bank descriptions name the same person several ways -- "JANE SMITH",
"J SMITH", "Mr Alex Smith" -- and often run a payment note straight on
after the name ("- AMIT Gift"). This resolves those to a single display name.

Two stages:
  1. clean_name()  strips honorifics and trailing payment notes.
  2. canonical_map() merges an initial + surname into the full name when
     exactly ONE full name matches that surname and initial. Where two people
     share both (A Sharma -> Arsh or Alok Sharma) it merges nothing and reports
     the ambiguity, because guessing would silently misattribute money.

MANUAL_ALIAS holds pairs the user confirmed that no rule could infer. Keep the
public default empty; store real aliases only in private local copies.
"""
from __future__ import annotations
import re
from collections import defaultdict

HONORIFICS = {"MR", "MRS", "MS", "MISS", "DR", "SHRI", "SMT"}

# words that follow a name as a payment note, never part of it
NOTE_WORDS = {
    "GIFT", "BILL", "BILLS", "PIZZA", "ICE", "CREAM", "FOOD", "RENT", "LOAN",
    "HELP", "MONEY", "CASH", "FEES", "FEE", "VISA", "CAR", "PETROL", "FUEL",
    "GROCERY", "GROCERIES", "SAVING", "SAVINGS", "REPAY", "REPAYMENT", "BACK",
    "SENT", "HOLD", "MEDS", "SWIM", "LESSONS", "WEEKLY", "EXPENSES", "MONTH",
    "SURVEY", "FEEL", "WELL-BEING", "EMOTIONAL", "INSPECTION", "SERVICE",
    "TRANSFER", "OTHER", "BANK", "THANK", "YOU", "PAYMENT", "SALARY", "FIRST",
    "CREDITTOACCOUNT", "MACBOOK", "PHONE", "INTERNET", "TICKET", "FLIGHT",
    "RETURN", "RETURNING", "IPHONE", "LAPTOP", "JONI", "HERE", "THANKS",
}

MANUAL_ALIAS = {}
# names that must never be merged into anyone else
KEEP_DISTINCT = set()


def clean_name(raw: str) -> str | None:
    """Normalise one raw name; None if it is not a person."""
    words = [w for w in re.split(r"[\s\-]+", raw.upper()) if w]
    while words and words[0] in HONORIFICS:
        words.pop(0)
    out: list[str] = []
    for w in words:
        if w in NOTE_WORDS or len(w) > 20:
            break
        if not re.fullmatch(r"[A-Z']{1,}", w):
            break
        if not out or out[-1] != w:     # "AMIT AMIT" -> "AMIT"
            out.append(w)
        if len(out) == 3:              # no real name here runs longer
            break
    if not out or (len(out) == 1 and len(out[0]) < 2):
        return None
    return " ".join(out)


def split_collapsed(name: str, surnames: set[str]) -> str:
    """"JANESMITH" -> "JANE SMITH", using surnames seen elsewhere.

    Newer statements strip the spaces out of a name, so the same person appears
    both collapsed and spaced. Splitting on a surname already observed in the
    data is what lets the two forms meet.
    """
    if " " in name or len(name) < 5:
        return name
    for sn in sorted(surnames, key=len, reverse=True):
        if len(sn) >= 4 and name.endswith(sn) and len(name) > len(sn) + 0:
            given = name[: -len(sn)]
            if given:
                return f"{given} {sn}"
    return name


def canonical_map(names) -> tuple[dict[str, str], list[str]]:
    """-> ({RAW UPPER: display name}, [ambiguity notes])"""
    cleaned = {}
    for n in names:
        c = clean_name(n)
        if c:
            cleaned[n.upper()] = c

    # surnames observed as the last word of any spaced name, plus those implied
    # by the confirmed aliases -- the vocabulary used to split collapsed names
    surnames = {c.split()[-1] for c in cleaned.values() if " " in c}
    surnames |= {v.split()[-1].upper() for v in MANUAL_ALIAS.values() if " " in v}
    cleaned = {raw: split_collapsed(c, surnames) for raw, c in cleaned.items()}

    # full names (2+ words, first word longer than an initial) per surname+initial
    full: dict[tuple[str, str], set[str]] = defaultdict(set)
    for c in set(cleaned.values()):
        parts = c.split()
        if len(parts) >= 2 and len(parts[0]) > 1 and c not in KEEP_DISTINCT:
            full[(parts[-1], parts[0][0])].add(c)

    notes: list[str] = []
    resolved: dict[str, str] = {}
    for raw, c in cleaned.items():
        if c in KEEP_DISTINCT:
            resolved[raw] = c.title()
            continue
        if c in MANUAL_ALIAS:
            resolved[raw] = MANUAL_ALIAS[c]
            continue
        parts = c.split()
        # "A SHARMA" -> the only full name with surname SHARMA starting with A
        if len(parts) == 2 and len(parts[0]) == 1:
            cands = full.get((parts[-1], parts[0]), set())
            if len(cands) == 1:
                resolved[raw] = next(iter(cands)).title()
                continue
            if len(cands) > 1:
                notes.append(f"{c.title()} is ambiguous: {', '.join(sorted(x.title() for x in cands))}")
        resolved[raw] = c.title()
    return resolved, notes
