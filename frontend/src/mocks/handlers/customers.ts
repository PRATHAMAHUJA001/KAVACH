import { http } from "msw";
import type { CustomerAlertDTO, CustomerDTO, CustomerDetailDTO, CustomerListDTO, ScoreDriverDTO } from "@/services/api/dto";
import { maskName, maskPan, mockRole } from "../db";
import { DAY, json, latency, notFound } from "../util";

/**
 * A synthetic book of 30 customers. Enough that paging (25 a page), every sort and
 * every band filter visibly do something.
 */
type Seed = [name: string, pan: string, city: string, state: string, segment: string, score: number | null, alerts: number, accounts: number, balance: number, pep: boolean, kyc: string, category: string, occupation: string];

const SEEDS: Seed[] = [
  ["Anjali Deshpande", "AKQPD6428G", "Mumbai", "Maharashtra", "HNI", 0.94, 5, 4, 18_450_000, true, "VERIFIED", "HIGH", "Business owner"],
  ["Rohit Malhotra", "BNTPM1193K", "Delhi", "Delhi", "HNI", 0.91, 4, 3, 12_900_000, false, "PENDING", "HIGH", "Exporter"],
  ["Sunita Iyer", "CMRPI7741L", "Chennai", "Tamil Nadu", "PREMIUM", 0.88, 3, 2, 6_720_000, false, "VERIFIED", "HIGH", "Doctor"],
  ["Imran Qureshi", "DLZPQ2286M", "Hyderabad", "Telangana", "MSME", 0.86, 6, 3, 4_310_000, false, "EXPIRED", "HIGH", "Trader"],
  ["Meera Nair", "EKYPN9037N", "Kochi", "Kerala", "NRI", 0.81, 2, 2, 9_150_000, false, "VERIFIED", "MEDIUM", "Software engineer"],
  ["Vikram Singh", "FJXPS4512P", "Jaipur", "Rajasthan", "MSME", 0.78, 3, 2, 2_880_000, true, "VERIFIED", "HIGH", "Contractor"],
  ["Priya Banerjee", "GHWPB8865Q", "Kolkata", "West Bengal", "PREMIUM", 0.74, 1, 3, 5_460_000, false, "PENDING", "MEDIUM", "Architect"],
  ["Arjun Reddy", "HGVPR3390R", "Bengaluru", "Karnataka", "HNI", 0.71, 2, 4, 15_020_000, false, "VERIFIED", "MEDIUM", "Founder"],
  ["Fatima Shaikh", "IFUPS7724S", "Pune", "Maharashtra", "RETAIL", 0.68, 4, 1, 740_000, false, "VERIFIED", "HIGH", "Shopkeeper"],
  ["Deepak Joshi", "JETPJ1158T", "Ahmedabad", "Gujarat", "MSME", 0.66, 1, 2, 3_390_000, false, "VERIFIED", "MEDIUM", "Textile wholesaler"],
  ["Lakshmi Rao", "KDSPR5582U", "Visakhapatnam", "Andhra Pradesh", "PREMIUM", 0.61, 2, 2, 4_120_000, false, "VERIFIED", "MEDIUM", "Professor"],
  ["Harpreet Kaur", "LCRPK9916V", "Ludhiana", "Punjab", "MSME", 0.58, 1, 3, 2_640_000, false, "PENDING", "MEDIUM", "Manufacturer"],
  ["Sameer Kulkarni", "MBQPK4340W", "Nagpur", "Maharashtra", "RETAIL", 0.55, 0, 1, 385_000, false, "VERIFIED", "LOW", "Teacher"],
  ["Nisha Agarwal", "NAPPA8774X", "Indore", "Madhya Pradesh", "PREMIUM", 0.52, 2, 2, 3_910_000, false, "VERIFIED", "MEDIUM", "Chartered accountant"],
  ["Tarun Ghosh", "OZOPG2108Y", "Bhubaneswar", "Odisha", "SALARY", 0.49, 0, 1, 268_000, false, "VERIFIED", "LOW", "Analyst"],
  ["Kavita Menon", "PYNPM6532Z", "Thiruvananthapuram", "Kerala", "NRI", 0.46, 1, 2, 7_480_000, false, "VERIFIED", "MEDIUM", "Nurse"],
  ["Rakesh Yadav", "QXMPY0966A", "Lucknow", "Uttar Pradesh", "RETAIL", 0.42, 1, 1, 512_000, false, "EXPIRED", "MEDIUM", "Driver"],
  ["Sneha Pillai", "RWLPP5290B", "Coimbatore", "Tamil Nadu", "SALARY", 0.38, 0, 1, 331_000, false, "VERIFIED", "LOW", "HR manager"],
  ["Manish Gupta", "SVKPG9724C", "Kanpur", "Uttar Pradesh", "MSME", 0.35, 1, 2, 1_870_000, false, "VERIFIED", "LOW", "Distributor"],
  ["Aditi Verma", "TUJPV3148D", "Bhopal", "Madhya Pradesh", "PREMIUM", 0.31, 0, 2, 2_960_000, false, "VERIFIED", "LOW", "Consultant"],
  ["Suresh Patil", "UTIPP7572E", "Nashik", "Maharashtra", "RETAIL", 0.28, 0, 1, 196_000, false, "PENDING", "LOW", "Farmer"],
  ["Zoya Ansari", "VSHPA1906F", "Bhopal", "Madhya Pradesh", "SALARY", 0.24, 0, 1, 289_000, false, "VERIFIED", "LOW", "Designer"],
  ["Gaurav Chauhan", "WRGPC6330G", "Dehradun", "Uttarakhand", "RETAIL", 0.21, 0, 1, 157_000, false, "VERIFIED", "LOW", "Electrician"],
  ["Ritu Saxena", "XQFPS0764H", "Agra", "Uttar Pradesh", "SALARY", 0.18, 0, 1, 224_000, false, "VERIFIED", "LOW", "Accountant"],
  ["Nikhil Bhatt", "YPEPB4188J", "Surat", "Gujarat", "MSME", 0.15, 0, 2, 1_340_000, false, "VERIFIED", "LOW", "Jeweller"],
  ["Divya Krishnan", "ZODPK8512K", "Madurai", "Tamil Nadu", "SALARY", 0.12, 0, 1, 178_000, false, "VERIFIED", "LOW", "Researcher"],
  ["Ashok Mehta", "ANCPM2936L", "Rajkot", "Gujarat", "RETAIL", 0.09, 0, 1, 143_000, false, "VERIFIED", "LOW", "Retired"],
  ["Pooja Sharma", "BMBPS7360M", "Gurugram", "Haryana", "PREMIUM", 0.06, 0, 2, 3_080_000, false, "VERIFIED", "LOW", "Product manager"],
  ["Farhan Khan", "CLAPK1784N", "Srinagar", "Jammu and Kashmir", "RETAIL", null, 0, 1, 118_000, false, "PENDING", "LOW", "Shopkeeper"],
  ["Ananya Bose", "DKZPB6108P", "Guwahati", "Assam", "NRI", null, 1, 2, 5_930_000, true, "VERIFIED", "MEDIUM", "Civil servant"],
];

const CHANNELS = ["BRANCH", "ONLINE", "DSA", "MOBILE"];
const REGION_OF: Record<string, string> = {
  Maharashtra: "WEST", Gujarat: "WEST", Rajasthan: "WEST", Delhi: "NORTH", Punjab: "NORTH", Haryana: "NORTH",
  "Uttar Pradesh": "NORTH", Uttarakhand: "NORTH", "Jammu and Kashmir": "NORTH", "Madhya Pradesh": "CENTRAL",
  "Tamil Nadu": "SOUTH", Kerala: "SOUTH", Karnataka: "SOUTH", Telangana: "SOUTH", "Andhra Pradesh": "SOUTH",
  "West Bengal": "EAST", Odisha: "EAST", Assam: "EAST",
};
const TYPOLOGIES = ["STRUCTURING", "RAPID_PASSTHROUGH", "CASH_REPORTING", "MULE_RING", "INCOME_MISMATCH", "DORMANT_REACTIVATION"];
const DRIVERS = ["ACCOUNT_AGE_DAYS", "BENEFICIARY_COUNT", "RISK_CATEGORY_NUM", "ACCOUNT_STATUS_NUM"];

const id = (i: number) => `CUST${String(i + 1).padStart(6, "0")}`;

const CUSTOMERS: CustomerDTO[] = SEEDS.map(([name, pan, city, , segment, score, alerts, accounts, balance, pep, kyc, category], i) => ({
  customer_id: id(i),
  customer_name: name,
  pan,
  city,
  segment,
  risk_category: category,
  is_pep: pep,
  kyc_status: kyc,
  account_count: accounts,
  total_balance_inr: balance,
  risk_score: score,
  open_alerts: alerts,
}));

/** Reviewers see masked names and PANs, the same way the real masking policies behave. */
function mask(c: CustomerDTO): CustomerDTO {
  if (mockRole() !== "KAVACH_REVIEWER") return c;
  return { ...c, customer_name: maskName(c.customer_name ?? ""), pan: maskPan(c.pan ?? "") };
}

const band = (c: CustomerDTO, b: string): boolean => {
  const s = c.risk_score;
  if (b === "high") return s != null && s >= 0.65;
  if (b === "medium") return s != null && s >= 0.45 && s < 0.65;
  if (b === "low") return s == null || s < 0.45;
  if (b === "pep") return c.is_pep;
  if (b === "alerted") return c.open_alerts > 0;
  return true;
};

const SORTS: Record<string, (a: CustomerDTO, b: CustomerDTO) => number> = {
  risk: (a, b) => (b.risk_score ?? -1) - (a.risk_score ?? -1) || a.customer_id.localeCompare(b.customer_id),
  alerts: (a, b) => b.open_alerts - a.open_alerts || (b.risk_score ?? -1) - (a.risk_score ?? -1),
  balance: (a, b) => b.total_balance_inr - a.total_balance_inr,
  name: (a, b) => (a.customer_name ?? "").localeCompare(b.customer_name ?? ""),
  city: (a, b) => (a.city ?? "").localeCompare(b.city ?? ""),
  segment: (a, b) => (a.segment ?? "").localeCompare(b.segment ?? ""),
  id: (a, b) => a.customer_id.localeCompare(b.customer_id),
};

function detailFor(index: number): CustomerDetailDTO {
  const c = CUSTOMERS[index]!;
  const [, , , state, , score, alertCount, accounts, , , , , occupation] = SEEDS[index]!;
  const now = Date.parse("2024-09-30T00:00:00Z");
  const accountRows = Array.from({ length: accounts }, (_, k) => {
    const s = score == null ? null : Math.max(0.01, score - k * 0.07);
    return {
      account_id: `ACC${String(index * 7 + k + 1001).padStart(7, "0")}`,
      account_type: ["SAVINGS", "CURRENT", "LOAN", "FD"][k % 4]!,
      status: k === 0 ? "ACTIVE" : (["ACTIVE", "DORMANT", "ACTIVE", "FROZEN"][k % 4]! as string),
      branch_code: `BR0${String(100 + ((index * 13 + k) % 480)).padStart(3, "0")}`,
      open_date: new Date(now - (600 + index * 37 + k * 210) * DAY).toISOString(),
      avg_monthly_balance_inr: Math.round((c.total_balance_inr / accounts) * (k === 0 ? 1.3 : 0.85)),
      risk_score: s,
      open_alerts: k === 0 ? alertCount : 0,
    };
  });
  const drivers: ScoreDriverDTO[] =
    score == null
      ? []
      : [0, 1, 2].map((k) => ({
          feature: DRIVERS[(index + k) % DRIVERS.length]!,
          // Alternating sign: a driver can pull the score down as well as up.
          shap: Math.round((1.9 - k * 0.55) * (k === 1 ? -1 : 1) * 10_000) / 10_000,
        }));
  const alerts: CustomerAlertDTO[] = Array.from({ length: Math.min(10, alertCount) }, (_, k) => ({
    alert_id: `ALT-${c.customer_id.toLowerCase()}-${k + 1}`,
    account_id: accountRows[0]?.account_id ?? null,
    typology: TYPOLOGIES[(index + k) % TYPOLOGIES.length]!,
    severity: k === 0 ? "HIGH" : k === 1 ? "MEDIUM" : "LOW",
    score: Math.round((0.95 - k * 0.08) * 100) / 100,
    status: k === 0 ? "NEW" : k % 3 === 0 ? "CLOSED" : "OPEN",
    created_at: new Date(now - (k * 2 + 1) * DAY - index * 3 * 3_600_000).toISOString(),
  }));
  return {
    customer: mask(c),
    dob: new Date(Date.parse("1978-01-01T00:00:00Z") + index * 411 * DAY).toISOString(),
    state,
    state_code: state.slice(0, 2).toUpperCase(),
    region: REGION_OF[state] ?? "NORTH",
    occupation,
    declared_annual_income_inr: Math.round(c.total_balance_inr / (c.segment === "HNI" ? 6 : 3)),
    kyc_last_updated: new Date(now - (200 + index * 29) * DAY).toISOString(),
    onboarding_channel: CHANNELS[index % CHANNELS.length]!,
    accounts: accountRows,
    drivers,
    driver_account_id: score == null ? null : accountRows[0]!.account_id,
    driver_scored_at: score == null ? null : new Date(now - 2 * DAY).toISOString(),
    alerts,
  };
}

export const customerHandlers = [
  http.get("/api/customers", async ({ request }) => {
    await latency();
    const u = new URL(request.url).searchParams;
    const q = (u.get("q") ?? "").toLowerCase().trim();
    const segment = u.get("segment") ?? "";
    const risk = u.get("risk") ?? "";
    const sort = u.get("sort") ?? "risk";
    const limit = Math.min(100, Math.max(1, Number(u.get("limit") ?? 25)));
    const offset = Math.max(0, Number(u.get("offset") ?? 0));

    let rows = CUSTOMERS.filter((c) => {
      if (q && !`${c.customer_name} ${c.pan} ${c.customer_id} ${c.city}`.toLowerCase().includes(q)) return false;
      if (segment && c.segment !== segment) return false;
      if (risk && !band(c, risk)) return false;
      return true;
    });
    rows = [...rows].sort(SORTS[sort] ?? SORTS.risk!);

    const body: CustomerListDTO = {
      customers: rows.slice(offset, offset + limit).map(mask),
      total: rows.length,
      limit,
      offset,
      sort,
      segments: [...new Set(CUSTOMERS.map((c) => c.segment!))].sort(),
    };
    return json(body);
  }),

  http.get("/api/customers/:id", async ({ params }) => {
    await latency();
    const i = CUSTOMERS.findIndex((c) => c.customer_id === String(params.id));
    if (i < 0) return notFound("Customer");
    return json(detailFor(i));
  }),
];
