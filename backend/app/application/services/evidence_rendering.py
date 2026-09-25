"""
Pure evidence-pack document rendering: evidence_json -> HTML / PDF bytes.

No Snowflake or FastAPI dependency here by design (per the N-layered rule) - this
module only knows how to turn the evidence dict already assembled by
AI.BUILD_EVIDENCE_PACK into human-readable documents. Persisting the rendered
output to a stage is an infrastructure concern (see evidence_repository.py).
"""
from html import escape
from typing import Optional
import re


def _fmt_money(value) -> str:
    try:
        return f"\u20b9{float(value):,.2f}"
    except (TypeError, ValueError):
        return "N/A"


def parse_citation(citation: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Split 'KAVACH/2024/07 para 1' into ('KAVACH/2024/07', '1')."""
    if not citation:
        return None, None
    match = re.match(r"(.+?)\s+para\s+(\d+)", citation.strip(), re.IGNORECASE)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return citation.strip(), None


def render_evidence_html(evidence_json: dict, regulation_quote: Optional[str] = None) -> str:
    """Render a KAVACH evidence pack dict into a standalone, readable HTML document."""
    alert_id = escape(str(evidence_json.get("alert_id", "UNKNOWN")))
    case = evidence_json.get("case_summary", {}) or {}
    rule = evidence_json.get("rule", {}) or {}
    timeline = evidence_json.get("timeline", []) or []
    ml_drivers = evidence_json.get("ml_drivers", []) or []
    analyst_notes = evidence_json.get("analyst_notes", []) or []
    generated_at = escape(str(evidence_json.get("generated_at", "")))

    severity = str(case.get("severity", "N/A"))
    severity_color = {"HIGH": "#c0392b", "CRITICAL": "#8e0000", "MEDIUM": "#d68910", "LOW": "#2e7d32"}.get(
        severity.upper(), "#555"
    )

    timeline_rows = "".join(
        f"""<tr>
            <td>{escape(str(t.get('txn_ts', '')))}</td>
            <td>{escape(str(t.get('direction', '')))}</td>
            <td style="text-align:right">{_fmt_money(t.get('amount_inr'))}</td>
            <td>{escape(str(t.get('channel', '')))}</td>
            <td>{escape(str(t.get('counterparty', '')))}</td>
        </tr>"""
        for t in timeline
    ) or "<tr><td colspan='5' class='muted'>No transactions in the evidence window</td></tr>"

    driver_rows = "".join(
        f"""<tr>
            <td>{escape(str(d.get('feature', '')))}</td>
            <td style="text-align:right">{d.get('shap_value', 'N/A')}</td>
        </tr>"""
        for d in ml_drivers
    ) or "<tr><td colspan='2' class='muted'>No ML driver data available</td></tr>"

    approval_rows = "".join(
        f"""<tr>
            <td>{escape(str(n.get('analyst', '')))}</td>
            <td>{escape(str(n.get('commented_at', '')))}</td>
            <td>{'Fraud confirmed' if n.get('is_fraud') else 'No fraud found'}</td>
            <td>{escape(str(n.get('feedback', '')))}</td>
        </tr>"""
        for n in analyst_notes
    ) or "<tr><td colspan='4' class='muted'>No analyst review recorded yet</td></tr>"

    rule_block = ""
    if rule.get("rule_id"):
        citation = rule.get("source_citation", "N/A")
        quote_html = (
            f'<blockquote>&ldquo;{escape(regulation_quote)}&rdquo;</blockquote>'
            if regulation_quote
            else ""
        )
        rule_block = f"""
        <table class="kv">
            <tr><th>Rule</th><td>{escape(str(rule.get('rule_name', 'N/A')))} (v{escape(str(rule.get('version', '')))})</td></tr>
            <tr><th>Status</th><td>{escape(str(rule.get('status', 'N/A')))}</td></tr>
            <tr><th>Citation</th><td>{escape(str(citation))}</td></tr>
        </table>
        {quote_html}
        """
    else:
        rule_block = '<p class="muted">No rule matched to this alert.</p>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>KAVACH Evidence Pack — {alert_id}</title>
<style>
  body {{ font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #1a1a1a; background: #f4f5f7; }}
  .watermark {{ position: fixed; top: 40%; left: 8%; font-size: 72px; color: rgba(200,0,0,0.08); transform: rotate(-28deg); z-index: 0; font-weight: 700; pointer-events: none; }}
  .page {{ max-width: 860px; margin: 24px auto; background: #fff; padding: 40px 48px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); position: relative; z-index: 1; }}
  h1 {{ font-size: 22px; margin-bottom: 4px; }}
  h2 {{ font-size: 16px; margin-top: 32px; border-bottom: 2px solid #eee; padding-bottom: 6px; }}
  .subtitle {{ color: #666; font-size: 13px; margin-bottom: 20px; }}
  .badge {{ display: inline-block; padding: 3px 10px; border-radius: 4px; color: white; font-weight: 600; font-size: 12px; background: {severity_color}; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }}
  table.kv th {{ text-align: left; width: 160px; color: #555; padding: 4px 8px 4px 0; vertical-align: top; }}
  table.kv td {{ padding: 4px 0; }}
  table.data th {{ background: #f0f1f4; text-align: left; padding: 6px 8px; font-size: 12px; }}
  table.data td {{ padding: 6px 8px; border-bottom: 1px solid #eee; }}
  .muted {{ color: #999; font-style: italic; }}
  blockquote {{ background: #fafafa; border-left: 3px solid #999; margin: 10px 0; padding: 8px 14px; font-style: italic; color: #444; }}
  footer {{ margin-top: 40px; font-size: 11px; color: #999; text-align: center; }}
</style>
</head>
<body>
<div class="watermark">SYNTHETIC DATA</div>
<div class="page">
  <h1>KAVACH Evidence Pack</h1>
  <div class="subtitle">Alert {alert_id} &middot; Generated {generated_at}</div>

  <h2>Case Summary</h2>
  <table class="kv">
    <tr><th>Account</th><td>{escape(str(case.get('account_id', 'N/A')))}</td></tr>
    <tr><th>Customer</th><td>{escape(str(case.get('customer_id', 'N/A')))}</td></tr>
    <tr><th>Typology</th><td>{escape(str(case.get('typology', 'N/A')))}</td></tr>
    <tr><th>Severity</th><td><span class="badge">{escape(severity)}</span></td></tr>
    <tr><th>Score</th><td>{case.get('score', 'N/A')}</td></tr>
    <tr><th>Status</th><td>{escape(str(case.get('status', 'N/A')))}</td></tr>
    <tr><th>Flagged</th><td>{escape(str(case.get('created_at', 'N/A')))}</td></tr>
  </table>

  <h2>Rule &amp; Regulatory Citation</h2>
  {rule_block}

  <h2>Transaction Timeline</h2>
  <table class="data">
    <tr><th>Timestamp</th><th>Direction</th><th>Amount</th><th>Channel</th><th>Counterparty</th></tr>
    {timeline_rows}
  </table>

  <h2>Top ML Risk Drivers</h2>
  <table class="data">
    <tr><th>Feature</th><th>SHAP Value</th></tr>
    {driver_rows}
  </table>

  <h2>Analyst Approval Trail</h2>
  <table class="data">
    <tr><th>Analyst</th><th>Reviewed At</th><th>Verdict</th><th>Notes</th></tr>
    {approval_rows}
  </table>

  <footer>
    KAVACH AML Platform &mdash; This evidence pack was generated from SYNTHETIC data for demonstration purposes only.<br/>
    It does not represent real customers, transactions, or regulatory circulars.
  </footer>
</div>
</body>
</html>"""


def render_evidence_pdf(html: str) -> Optional[bytes]:
    """Best-effort PDF rendering using reportlab. Returns None if it fails for
    any reason - PDF is a nice-to-have, not required for evidence integrity."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER
        import io
        import re as _re

        # Re-parse the minimal structured data straight from the HTML-adjacent
        # evidence_json isn't available here, so instead build the PDF from a
        # small structured extraction the caller does before calling this
        # function is unnecessary - simplest robust approach: fall back to a
        # plain-text rendering of the HTML's visible text if structured PDF
        # generation isn't warranted for this best-effort path.
        text = _re.sub(r"<[^>]+>", "\n", html)
        text = _re.sub(r"\n{2,}", "\n\n", text).strip()

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
        styles = getSampleStyleSheet()
        watermark_style = ParagraphStyle(
            "watermark", parent=styles["Normal"], textColor=colors.red, alignment=TA_CENTER, fontSize=10
        )
        story = [
            Paragraph("SYNTHETIC DATA — KAVACH Evidence Pack", watermark_style),
            Spacer(1, 12),
        ]
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            story.append(Paragraph(escape(line), styles["Normal"]))
            story.append(Spacer(1, 4))
        doc.build(story)
        return buf.getvalue()
    except Exception:
        return None
