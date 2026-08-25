"""Terminus category taxonomy (Australian rideshare driver) + rule engine.

Two levels: L1 group -> L2 category, plus a `claimable` flag for tax/GST.
Categorisation is layered (first match wins):
  1. BNPL repayments  2. Remittance/peer  3. Internal transfers
  4. merchant keyword rules  5. leftover person transfers  6. uncategorised
"""
from __future__ import annotations

import re

# L1 group -> list of L2 categories
GROUPS = {
    # "Uber" is deliberately separate from "Uber Eats"/"Uber X": both pay under a
    # single UBERBV descriptor, so a bank deposit can be identified as Uber but
    # never split between the two. The Eats/X split exists only in income.json,
    # which comes from the platform statements.
    "Income": ["Uber", "Uber Eats", "Uber X", "Didi", "DoorDash", "Sherpa",
               "WeMoney", "Menulog", "Other Income"],
    "Vehicle & Travel": ["Fuel", "Service & Repairs", "Insurance", "Rego & Licensing",
                          "Parking & Tolls", "Public Transport", "Car Wash"],
    "Work Expenses": ["Phone & Internet", "Platform Fees", "Equipment & Supplies",
                      "Bank & Merchant Fees"],
    "Living": ["Rent & Housing", "Groceries", "Food & Dining", "Utilities",
               "Health & Medical", "Health Insurance", "Shopping",
               "Electronics & Computers", "Clothing & Accessories",
               "Beauty & Personal Care", "Travel & Accommodation",
               "Rideshare & Taxi", "Events & Tickets", "Laundry",
               "Subscriptions", "Education", "Government & Admin",
               "Cash & ATM", "Other"],
    "BNPL": ["Afterpay Purchase", "StepPay Purchase"],
    "Transfers": ["Internal Transfer", "Peer / Remittance", "BNPL Repayment", "Refund"],
}

# default claimability by group (Vehicle/Work = yes, subject to work-use %)
GROUP_CLAIMABLE = {"Vehicle & Travel": True, "Work Expenses": True}

CAT_GROUP = {c: g for g, cats in GROUPS.items() for c in cats}
SPEND_GROUPS = {"Vehicle & Travel", "Work Expenses", "Living", "BNPL"}


def is_claimable(category: str) -> bool:
    return GROUP_CLAIMABLE.get(CAT_GROUP.get(category, ""), False)


def is_spend(category: str) -> bool:
    return CAT_GROUP.get(category) in SPEND_GROUPS


# ---- merchant keyword rules: (category, [UPPERCASE substrings]) ----------
# checked in order AFTER the transfer pre-filters below.
MERCHANT_RULES = [
    ("Cash & ATM", ["WDLATM", "WDL ATM", "CARDLESSCASH", "CARDLESS CASH"]),
    ("Fuel", ["BPHALLS", "BPEXPRESS", "BPEX", "BPX", "BP ", " BP", "BPTHORNLIE",
              "BPPALMS", "BPSINGLETON", "BPPIARAWATERS", "CALTEX", "AMPOL", "SHELL",
              "COLESEXPRESS", "7-ELEVEN", "7ELEVEN", "UNITEDPETROL", "PUMAENERGY",
              "EGGROUP", "GURU SAHIB", "BPAPPLECROSS", "VIBEPETROL", "FUEL", "PETROL",
              "LIBERTY", "METROFUEL"]),
    ("Service & Repairs", ["MOTORS", "MECHANIC", "AUTOELEC", "TYRE", "REPCO",
                           "AUTOBARN", "MUFFLER", "BRAKE", "CARSERVICE", "PANELBEAT",
                           "TRANSMISSION", "ULTRATUNE", "MIDAS", "KMARTAUTO", "AUTOMOTIVE",
                           "ZLRGEMS", "EZAUTOWORX"]),
    ("Health Insurance", ["MEDIBANK", "OVHC", "AHMHEALTH", "AHM HEALTH",
                          "AHMINSURANCE", "BUPAHEALTH", "BUPA HEALTH",
                          "BUPAINSURANCE", "NIBHEALTH", "NIB HEALTH",
                          "HBF", "HEALTHINSURANCE", "HEALTH INSURANCE"]),
    ("Insurance", ["INSURANCE", "RACINSURANCE", "AAMI", "ALLIANZ", "BUDGETDIRECT",
                   "QBE", "NRMA", "YOUI", "SGIO", "GIO", "WOOLWORTHSINS"]),
    ("Rego & Licensing", ["LICENSING", "TRANSPORTWA", "DEPTOFTRANSPORT", "DOTLICENS",
                          "REGISTRATION", "VEHICLELIC"]),
    ("Parking & Tolls", ["EASYPARK", "CELLOPARK", "WILSONPARK", "PARKING", "CPP",
                         "HISMAJESTYS", "TOLL", "LINKT", "SECUREPARK", "CARPARK"]),
    ("Public Transport", ["SMARTRIDER", "TRANSPERTH", "PUBLICTRANSPORT", "METRONET"]),
    ("Car Wash", ["CARWASH", "CAR WASH", "AUTOWASH", "SPLASHCARWASH"]),
    ("Rideshare & Taxi", ["DIDICHUXING", "DIDIMOBILITY", "DIDI MOBIL", "TAXI",
                          "CABCHARGE"]),
    ("Phone & Internet", ["TELSTRA", "OPTUS", "VODAFONE", "AMAYSIM", "BELONG", "BOOSTMOBILE",
                          "GOOGLEONE", "GOOGLE ONE", "DODO", "TPGINTERNET", "MORETELECOM",
                          "SPINTEL", "AUSSIEBROADBAND", "IINET"]),
    ("Platform Fees", ["UBER*TRIP", "UB*TRIP", "UBERTRIP", "RIDESHAREFEE", "DRIVERFEE"]),
    ("Equipment & Supplies", ["OFFICEWORKS", "JAYCAR", "SUPERCHEAPAUTO"]),
    ("Bank & Merchant Fees", ["UNPAIDPAYMENTFEE", "INTERNATIONALTRANSACTION", "INTERNATIONAL TRANSACTION",
                              "DEBITINTEREST", "DEBITEXCESSINTEREST", "DISHONOUR", "OVERDRAWN",
                              "OVERDRAWFEE", "ACCOUNTFEE", "ATMOPERATORFEE", "FOREIGNFEE",
                              "EXCESSINTEREST", "LATEFEE"]),
    ("Events & Tickets", ["TICKETEK", "TICKETMASTER", "MOSHTIX", "BSIDES", "TICKETS"]),
    ("Rent & Housing", ["REALESTATE", "REAL ESTATE", "RAYWHITE", "RENTPAYMENT", "PROPERTY",
                        "REALTY", "LJHOOKER", "HARCOURTS", "LANDLORD", "BONDADMIN"]),
    ("Groceries", ["COLES", "WOOLWORTHS", "ALDI", "IGA", "COSTCO", "SPUDSHED", "DRAKES",
                   "FARMERJACK", "FOODWORKS", "INDIA GROCER"]),
    ("Food & Dining", ["MCDONALD", "KFC", "STARBUCKS", "ZAMBRERO", "DOME", "SUSHI", "CAFE",
                       "RESTAURANT", "GUZMAN", "HUNGRYJACK", "GRILL", "CHURRO", "YO-CHI",
                       "JAFFLE", "NANDO", "SUBWAY", "DOMINO", "PIZZA", "CHICKEN", "KITCHEN",
                       "EATERY", "BAKERY", "COFFEE", "JUICE", "GELATO", "DESSERT", "GOODLIFE",
                       "NOODLE", "THAI", "INDIAN", "CURRY", "BURGER", "TACO", "BUBBLE",
                       "CHATIME", "BOOSTJUICE", "REDROOSTER", "OPORTO", "BWS", "LIQUOR",
                       "DANMURPHY", "PUB", "TAVERN", "BAR", "UBER*EATS", "UBER *EATS",
                       "UBER EATS"]),
    ("Travel & Accommodation", ["EDREAMS", "AIRBNB", "BOOKING.COM", "BOOKINGCOM",
                                "EXPEDIA", "AGODA", "JETSTAR", "QANTAS", "VIRGINAUSTRALIA",
                                "SINGAPOR6182451674983", "MERCURE HOTEL", "HOTELSPI"]),
    ("Utilities", ["SYNERGY", "WATERCORP", "WATER CORP", "ALINTA", "AGL", "ORIGINENERGY",
                   "KLEENHEAT", "GASBILL", "ELECTRICITY"]),
    ("Health & Medical", ["CHEMIST", "PHARMACY", "MEDICAL", "DENTAL", "CLINIC", "PRICELINE",
                          "TERRYWHITE", "DOCTOR", "PHYSIO", "OPTICAL", "PATHOLOGY", "HOSPITAL",
                          "MEDICARE", "GUARDIANPHARM"]),
    ("Electronics & Computers", ["APPLE R", "AUSTRALIANCOMPUTER",
                                 "AUSTRALIAN COMPUTER", "JBHIFI", "JB HI FI",
                                 "AMAZONWEBSERVICES", "AMAZON WEB SERVICES",
                                 "HARVEYNORMAN", "THEGOODGUYS", "KOGAN"]),
    ("Clothing & Accessories", ["RALPH LAUREN", "SUNGLASS", "H&M", "HENNES",
                                "NIKE", "COTTONON", "UNIQLO", "DAVIDJONES"]),
    ("Beauty & Personal Care", ["SEPHORA", "MECCA", "BEAUTY", "BARBER",
                                "HAIRDRESS", "SALON"]),
    ("Shopping", ["KMART", "BIGW", "TARGET", "AMAZON", "EBAY", "MYER", "ANACONDA",
                  "TEMU", "REJECTSHOP", "BUNNINGS", "IKEA", "CHEMISTWAREHOUSE"]),
    ("Subscriptions", ["NETFLIX", "SPOTIFY", "APPLE.COM/BILL", "APPLE.COM", "GOOGLE*", "YOUTUBE",
                       "DISNEY", "AMAZONPRIME", "PRIMEVIDEO", "CRUNCHYROLL", "ICLOUD", "OPENAI",
                       "CHATGPT", "ANTHROPIC", "CLAUDE.AI", "AUDIBLE", "PATREON", "BINGE",
                       "STAN", "PARAMOUNT", "KAYO", "TWITCH", "CANVA", "ADOBE", "MICROSOFT365"]),
    ("Education", ["INSTITUT", "UNIVERSITY", "TAFE", "COLLEGE", "TUITION", "ACADEMY",
                   "SCHOOL", "UDEMY", "COURSERA", "VUE", "TESTING EXAM", "NIT AUSTRALIA"]),
    ("Laundry", ["LAUNDRY", "LAUNDROMAT", "LAUNDRETTE"]),
]


def categorize(desc: str, dirn: str) -> str:
    """Return an L2 category for a description. dirn is 'debit' or 'credit'."""
    raw = desc.upper()
    u = raw.replace(" ", "").replace("-", "").replace("'", "")

    # 1. BNPL repayments (financing, not spend)
    if any(k in u for k in ("STEPPAYREPAYMENT", "STEPPAYPYMT")) or \
       ("AFTERPAY" in u and "AFTERPAY.COM" in u):
        return "BNPL Repayment"

    # 2. remittance / peer transfers
    if any(k in u for k in ("RMTLY", "REMITLY", "WISE.COM", "WESTERNUNION", "MONEYGRAM")):
        return "Peer / Remittance"
    if "PAYID" in u or "GIFT" in raw:
        return "Peer / Remittance"

    # 2b. platform income (credits). Runs BEFORE the transfer/refund rules: an
    # Uber payment reference can contain "XX", which the internal-transfer rule
    # would otherwise mistake for an own-account transfer.
    if dirn == "credit" and not (
        "REFUND" in u or "REVERSAL" in u or raw.startswith("Return")
    ):
        # CommBank writes Uber as both "UBERBV" and "UBER B.V." -- strip
        # punctuation so one rule covers every spelling.
        flat = u.replace(".", "")
        if "UBERBV" in flat or "UBEREATS" in flat:
            return "Uber"
        if "DIDIMOBILITY" in flat or "DIDI" in flat:
            return "Didi"
        if "DOORDASH" in flat:
            return "DoorDash"
        if "SHERPA" in flat:
            return "Sherpa"
        if "MENULOG" in flat:
            return "Menulog"
        # Payroll may arrive through multiple rails; keep this generic for the
        # public app and let users add project-specific rails in local rules.
        if "WEMONEY" in flat:
            return "WeMoney"

    # 3. internal transfers between own accounts (xx#### refs)
    if re.search(r"^(TO|FROM)\s*XX\d{3,5}\b", raw) or \
       ("TRANSFER" in u and "XX" in u):
        return "Internal Transfer"

    # 4. refunds
    if any(k in u for k in ("STEPPAYREFUND", "REFUND", "REVERSAL")) or raw.startswith("RETURN"):
        return "Refund"
    # Store reimbursement credits can arrive with "RE ..." descriptions.
    if dirn == "credit" and re.search(r"\bRE[A-Z]", raw.upper()):
        return "Refund"

    # 5. merchant keyword rules
    for cat, keys in MERCHANT_RULES:
        if any(k.replace(" ", "") in u if " " not in k else k in raw for k in keys):
            return cat

    # 6. leftover named person transfers (TransferTo-/FastTransferFrom- without PayID)
    if "TRANSFERTO-" in u or "FASTTRANSFERFROM-" in u or "FASTTRANSFERFROM" in u:
        return "Peer / Remittance"
    if u.startswith("TRANSFERTO") or u.startswith("TRANSFERFROM") or u.startswith("DIRECTCREDIT"):
        return "Peer / Remittance"

    return ""   # uncategorised -> LLM/manual fills in
