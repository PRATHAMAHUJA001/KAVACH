import { http } from "msw";
import type { ExposureRowDTO, RiskDTO } from "@/services/api/dto";
import { json, latency } from "../util";

/** label, accounts, exposure, flagged accounts, exposure at risk — pct is derived. */
function row(label: string, accounts: number, exposure: number, flagged: number, atRisk: number): ExposureRowDTO {
  return {
    label,
    accounts,
    exposure_inr: exposure,
    flagged_accounts: flagged,
    exposure_at_risk_inr: atRisk,
    pct_at_risk: exposure ? Math.round((atRisk / exposure) * 1000) / 10 : 0,
  };
}

/** All six customer segments, biggest book first. */
const BY_SEGMENT: ExposureRowDTO[] = [
  row("HNI", 517, 37_161_448, 34, 5_869_473),
  row("RETAIL", 2_184, 61_420_900, 71, 4_118_200),
  row("NRI", 349, 28_734_600, 19, 3_102_540),
  row("PREMIUM", 612, 33_908_150, 22, 2_477_300),
  row("MSME", 428, 31_286_700, 27, 3_540_880),
  row("SALARY", 1_905, 20_488_202, 16, 1_091_607),
];

const BY_BRANCH: ExposureRowDTO[] = [
  row("BR0199", 12, 900_000, 2, 120_000),
  row("BR0412", 38, 4_760_000, 6, 731_400),
  row("BR0087", 61, 7_240_500, 7, 612_900),
  row("BR0263", 27, 3_115_800, 5, 498_600),
  row("BR0530", 44, 5_402_300, 4, 356_100),
  row("BR0018", 19, 2_088_400, 2, 141_900),
];

export const riskHandlers = [
  http.get("/api/risk", async () => {
    await latency(180, 400);
    const totalExposure = BY_SEGMENT.reduce((s, r) => s + r.exposure_inr, 0);
    const totalAtRisk = BY_SEGMENT.reduce((s, r) => s + r.exposure_at_risk_inr, 0);
    const inflow = 43_088_800_000;
    const outflow = 42_409_900_000;
    const body: RiskDTO = {
      by_segment: BY_SEGMENT,
      by_branch: BY_BRANCH,
      liquidity: {
        inflow_inr: inflow,
        outflow_inr: outflow,
        net_inr: inflow - outflow,
        coverage_ratio: Math.round((inflow / outflow) * 1000) / 1000,
        txn_count: 249_525,
        window_days: 30,
      },
      total_exposure_inr: totalExposure,
      total_at_risk_inr: totalAtRisk,
      pct_at_risk: Math.round((totalAtRisk / totalExposure) * 1000) / 10,
    };
    return json(body);
  }),
];
