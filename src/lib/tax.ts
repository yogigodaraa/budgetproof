// Australian tax helpers (estimates only — not tax advice).

export interface LogEntry { id: string; date: string; km: number; purpose: string; }
export interface TaxConfig {
  salaryIncome: number | null; // TFN salary (PAYG); null = auto from ECU
  paygWithheld: number;        // tax already withheld on salary
  kmRate: number;              // cents-per-km rate
  /** Exempt from the Medicare levy (e.g. holding a Medicare Entitlement
   *  Statement). Levy withheld on PAYG salary is then refundable. */
  medicareExempt: boolean;
  /**
   * How the car is claimed. The ATO allows ONE method, not both:
   *  "km"     cents-per-km, capped at 5,000 business km, no receipts needed
   *  "actual" real running costs (fuel, servicing, insurance, rego)
   * Choosing "km" therefore excludes actual vehicle costs from deductions,
   * and vice versa -- claiming both would be double-dipping.
   */
  vehicleMethod: "km" | "actual";
  /**
   * Share of car running costs that is business use, 0-100. The actual-cost
   * method requires a logbook to establish this; only that share is claimable.
   * Ignored when vehicleMethod is "km".
   */
  businessUsePct: number;
}

export const TAX_DEFAULT: TaxConfig = {
  salaryIncome: null,
  paygWithheld: 0,
  kmRate: 0.88,
  medicareExempt: true,
  vehicleMethod: "km",
  businessUsePct: 100,
};

// Resident income tax, 2024-25 / 2025-26 rates.
const BRACKETS: [number, number, number][] = [
  // [upTo, rate, cumulativeTaxAtLowerBound]
  [18200, 0, 0],
  [45000, 0.16, 0],
  [135000, 0.3, 4288],
  [190000, 0.37, 31288],
  [Infinity, 0.45, 51638],
];
const LOWER = [0, 18200, 45000, 135000, 190000];

export function incomeTax(taxable: number): number {
  if (taxable <= 0) return 0;
  for (let i = BRACKETS.length - 1; i >= 0; i--) {
    if (taxable > LOWER[i]) {
      const [, rate, cum] = BRACKETS[i];
      return Math.round((cum + (taxable - LOWER[i]) * rate) * 100) / 100;
    }
  }
  return 0;
}

// Medicare levy 2% (simplified; low-income threshold ~ $27,222 for singles).
// `exempt` short-circuits it: an exempt taxpayer owes nothing, and any levy
// withheld through PAYG comes back on assessment rather than being a real cost.
export function medicareLevy(taxable: number, exempt = false): number {
  if (exempt || taxable <= 27222) return 0;
  return Math.round(taxable * 0.02 * 100) / 100;
}

// Cents-per-km method: min(business km, 5000) × rate. 2025-26 rate ~ $0.88/km.
export const KM_RATE_DEFAULT = 0.88;
export const MEDICARE_RATE = 0.02;
/** L1 group holding real car running costs, for the km-vs-actual choice. */
export const VEHICLE_GROUP = "Vehicle & Travel";
export const KM_CAP = 5000;
export function logbookDeduction(businessKm: number, ratePerKm = KM_RATE_DEFAULT): number {
  return Math.round(Math.min(businessKm, KM_CAP) * ratePerKm * 100) / 100;
}

// Which BAS quarter a YYYY-MM month falls in (AU FY quarters).
export function basQuarter(month: string): string {
  const m = Number(month.slice(5, 7));
  const y = Number(month.slice(0, 4));
  if (m >= 7 && m <= 9) return `Q1 Jul–Sep ${y}`;
  if (m >= 10 && m <= 12) return `Q2 Oct–Dec ${y}`;
  if (m >= 1 && m <= 3) return `Q3 Jan–Mar ${y}`;
  return `Q4 Apr–Jun ${y}`;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
