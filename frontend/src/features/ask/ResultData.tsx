import { useTranslation } from "react-i18next";
import { BarList, SERIES, Table, TBody, TD, TH, THead, TR, TrendChart } from "@/shared/ui";
import { formatNumber, humanizeCode } from "@/shared/lib/format";
import type { ResultSet } from "@/services/api";

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const MONEY = /AMOUNT|INR|VOLUME|VALUE|MONEY|RUPEE|₹/i;

/**
 * Picks a chart the data can honestly support:
 * dates + a number → a line; up to 15 labels + a number → bars; anything else → table only.
 */
function autoChart(rs: ResultSet) {
  if (rs.rows.length < 2) return null;
  const numCol = rs.columns.findIndex((_, i) => rs.rows.every((r) => r[i] == null || isNum(r[i])) && rs.rows.some((r) => isNum(r[i])));
  if (numCol < 0) return null;
  const labelCol = rs.columns.findIndex((_, i) => i !== numCol && rs.rows.every((r) => typeof r[i] === "string"));
  if (labelCol < 0) return null;
  const dates = rs.rows.every((r) => isDate(r[labelCol]));
  if (!dates && rs.rows.length > 15) return null;
  return { labelCol, numCol, dates };
}

export function ResultData({ rs }: { rs: ResultSet }) {
  const { t } = useTranslation();
  const chart = autoChart(rs);
  const header = (c: string) => (/[a-z]/.test(c) ? c : humanizeCode(c));
  return (
    <div className="space-y-5">
      {chart &&
        (chart.dates ? (
          <TrendChart
            height={200}
            xKey="x"
            caption={t("ask.chartCaption", { y: header(rs.columns[chart.numCol]!), x: header(rs.columns[chart.labelCol]!) })}
            data={[...rs.rows]
              .sort((a, b) => String(a[chart.labelCol]).localeCompare(String(b[chart.labelCol])))
              .map((r) => ({ x: String(r[chart.labelCol]).slice(0, 10), y: Number(r[chart.numCol] ?? 0) }))}
            series={[{ key: "y", label: header(rs.columns[chart.numCol]!), color: SERIES.alerts }]}
          />
        ) : (
          <BarList
            caption={t("ask.chartCaption", { y: header(rs.columns[chart.numCol]!), x: header(rs.columns[chart.labelCol]!) })}
            format={MONEY.test(rs.columns[chart.numCol]!) ? "money" : "number"}
            rows={rs.rows.map((r) => ({ label: String(r[chart.labelCol]), value: Number(r[chart.numCol] ?? 0) }))}
          />
        ))}
      <div className="-mx-4 max-h-80 overflow-auto">
        <Table>
          <THead>
            <TR>
              {rs.columns.map((c, i) => (
                <TH key={i} numeric={rs.rows.some((r) => isNum(r[i]))}>
                  {header(c)}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {rs.rows.map((r, ri) => (
              <TR key={ri}>
                {r.map((v, ci) => (
                  <TD key={ci} numeric={isNum(v)}>
                    {v == null ? "—" : isNum(v) ? formatNumber(v as number, 2) : String(v)}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
