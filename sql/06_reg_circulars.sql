-- =============================================================================
-- KAVACH Phase 2D: Regulatory Circular PDFs → @RAW.REG_STAGE
-- =============================================================================
-- Generates 8 synthetic circulars using fpdf2 in Snowpark Python.
-- Run: CALL KAVACH_DB.RAW.GENERATE_REG_CIRCULARS()
-- NOTE: this procedure's CREATE statement was previously missing from sql/ entirely
-- (built by hand on the original account, only found via GET_DDL during the
-- pre-migration export) -- extracted verbatim from data/exports/ddl/RAW.sql below.
-- =============================================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

-- Stage (created in 04_synthetic_data.sql)
CREATE STAGE IF NOT EXISTS RAW.REG_STAGE COMMENT = 'Internal stage for regulatory circular PDFs';

CREATE OR REPLACE PROCEDURE KAVACH_DB.RAW.GENERATE_REG_CIRCULARS()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python','fpdf2')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
from fpdf import FPDF
import os, tempfile

def make_pdf(ref, date, title, body_paragraphs, amendment_of=None, conflict_with=None):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_font(''Helvetica'', ''B'', 9)
    pdf.cell(0, 5, ''*** SYNTHETIC - FOR DEMO ONLY ***'', new_x=''LMARGIN'', new_y=''NEXT'', align=''C'')
    pdf.set_font(''Helvetica'', ''B'', 13)
    pdf.cell(0, 8, ''KAVACH REGULATORY AUTHORITY'', new_x=''LMARGIN'', new_y=''NEXT'', align=''C'')
    pdf.set_font(''Helvetica'', '''', 9)
    pdf.cell(0, 5, ''Department of Financial Supervision, Mumbai - 400001'', new_x=''LMARGIN'', new_y=''NEXT'', align=''C'')
    pdf.ln(4)
    pdf.set_font(''Helvetica'', ''B'', 10)
    pdf.cell(0, 7, ''Circular No: '' + ref, new_x=''LMARGIN'', new_y=''NEXT'')
    pdf.cell(0, 7, ''Date: '' + date, new_x=''LMARGIN'', new_y=''NEXT'')
    if amendment_of:
        pdf.set_font(''Helvetica'', ''BI'', 9)
        pdf.cell(0, 7, ''AMENDMENT TO: '' + amendment_of, new_x=''LMARGIN'', new_y=''NEXT'')
    if conflict_with:
        pdf.set_font(''Helvetica'', ''BI'', 9)
        pdf.cell(0, 7, ''[Note: Overlapping scope with '' + conflict_with + '']'', new_x=''LMARGIN'', new_y=''NEXT'')
    pdf.ln(3)
    pdf.set_font(''Helvetica'', ''B'', 11)
    pdf.multi_cell(0, 7, ''Re: '' + title)
    pdf.ln(3)
    for i, para in enumerate(body_paragraphs, 1):
        pdf.set_font(''Helvetica'', ''B'', 10)
        prefix = str(i) + ''. ''
        pdf.cell(10, 6, prefix)
        pdf.set_font(''Helvetica'', '''', 9)
        x = pdf.get_x()
        w = pdf.w - pdf.r_margin - x
        pdf.multi_cell(w, 5, para)
        pdf.ln(2)
    pdf.ln(4)
    pdf.set_font(''Helvetica'', ''I'', 8)
    pdf.cell(0, 5, ''SYNTHETIC circular for demonstration. Not actual regulatory guidance.'', new_x=''LMARGIN'', new_y=''NEXT'')
    return pdf

def run(session):
    circulars = [
        {''ref'':''KAVACH/2024/01'',''date'':''15 January 2024'',''title'':''Cash Transaction Reporting (CTR) and Suspicious Transaction Reporting'',''body'':[''All Regulated Entities (REs) shall report Cash Transaction Reports (CTRs) for all cash transactions of value exceeding Rs. 10,00,000 (Rupees Ten Lakhs) or its equivalent in foreign currency, whether conducted as a single transaction or several transactions that appear to be connected, during a calendar month.'',''All attempts of cash deposits in amounts ranging from Rs. 9,00,000 to Rs. 9,99,999 conducted more than three times in a rolling 30-day period by the same customer or linked accounts shall be flagged as potential structuring and reported as STR.'',''For individual cash deposits, any single deposit exceeding Rs. 50,000 at a branch counter must be accompanied by PAN or Form 60 declaration.'',''REs shall implement automated monitoring systems to detect patterns of cash deposits consistently just below reporting thresholds. Such patterns across 30 days shall trigger enhanced scrutiny.'',''Non-compliance with CTR filing shall attract penalties under Section 13 of PMLA, 2002, up to Rs. 1,00,000 per instance.'',''All CTRs shall be filed with FIU-IND within 15 days of month close. STRs within 7 working days of identification.'',''This circular supersedes all previous circulars on cash transaction monitoring thresholds.'']},
        {''ref'':''KAVACH/2024/02'',''date'':''01 March 2024'',''title'':''Know Your Customer (KYC) Norms and Customer Due Diligence'',''body'':[''All REs shall classify customers into risk categories LOW, MEDIUM, HIGH based on business activity, location, source of funds, and profile. Risk categorization reviewed annually.'',''Enhanced Due Diligence (EDD) mandatory for: (a) PEPs and family/associates, (b) customers from FATF high-risk countries, (c) customers with declared income below Rs. 5,00,000 whose turnover exceeds 10x declared income in any rolling 6-month period.'',''For PEPs: (a) Senior management approval for account opening, (b) Establish source of wealth and funds, (c) Enhanced monitoring with quarterly reviews, (d) Any cash transaction exceeding Rs. 5,00,000 triggers automatic STR review.'',''KYC re-verification: HIGH risk every 2 years, MEDIUM every 8 years, LOW every 10 years. Failure results in partial account freeze.'',''NRE and NRO accounts undergo enhanced scrutiny when cumulative transfers exceed Rs. 50,00,000 in a financial year.'',''REs shall maintain digital copies of KYC documents, available to regulators within 48 hours.'']},
        {''ref'':''KAVACH/2024/03'',''date'':''15 April 2024'',''title'':''Wire Transfer Monitoring and Cross-Border Transaction Controls'',''conflict_with'':''KAVACH/2024/06'',''body'':[''All SWIFT and cross-border wire transfers exceeding USD 10,000 shall be screened against OFAC, UN, EU, and domestic sanctions lists.'',''Transfers to/from FATF grey/black list countries require: (a) Compliance officer approval, (b) Documented remittance purpose, (c) Enhanced beneficiary due diligence, (d) 90-day post-transaction monitoring.'',''Real-time screening of wire transfer originators and beneficiaries. Partial name matches with 85% or above similarity score escalated for manual review.'',''Rapid pass-through: funds received via wire and moved out within 24 hours with near-zero balance flagged as layering. Layering defined as 3 or more sequential transfers within 48 hours to different beneficiaries.'',''Wire transfers must include complete originator information per FATF Recommendation 16.'',''Monthly aggregate reports of cross-border transactions by corridor submitted to FIU-IND by the 10th.'']},
        {''ref'':''KAVACH/2024/04'',''date'':''01 June 2024'',''title'':''Detection and Prevention of Mule Account Activity'',''body'':[''REs shall detect money mule activity: accounts receiving and immediately transferring funds, typically within 30 minutes, with no apparent economic purpose.'',''Indicators: (a) Multiple accounts sharing device identifiers or IPs, (b) Accounts opened within 30 days with coordinated patterns, (c) High-frequency credit-debit pairs under 30 minutes.'',''When 5+ accounts sharing 2+ device identifiers process over Rs. 25,00,000 monthly with mule patterns, flag as potential mule ring.'',''Upon detection: (a) Enhanced monitoring for all ring accounts, (b) Compliance officer notification within 4 hours, (c) STR within 3 working days, (d) 72-hour account freeze option.'',''REs shall maintain shared device/IP registry across customer base, updated in near real-time.'',''Quarterly mule detection statistics reported to supervisory department.'']},
        {''ref'':''KAVACH/2024/05'',''date'':''15 July 2024'',''title'':''Dormant Account Reactivation Monitoring'',''body'':[''Accounts with no customer-initiated transactions for 24 months classified DORMANT. Reactivation requires in-person or video KYC verification.'',''Enhanced monitoring triggers: (a) First transaction after reactivation exceeding Rs. 1,00,000, (b) Outward wire within 7 days, (c) Multiple large credits followed by transfers to unknown beneficiaries.'',''For digital reactivation: verify device history, IP/geolocation consistency, and new beneficiary additions within 24 hours.'',''Dormant accounts receiving over Rs. 5,00,000 within 30 days of reactivation and transferring 80%+ automatically flagged for STR review.'',''No SWIFT/RTGS from dormant accounts within 30 days of reactivation without compliance officer approval.'',''Branch staff must complete mandatory reactivation checklist. Retained for 5 years.'']},
        {''ref'':''KAVACH/2024/06'',''date'':''01 September 2024'',''title'':''Detection of Round-Tripping and Layering Through Domestic Transfers'',''conflict_with'':''KAVACH/2024/03'',''body'':[''REs shall implement graph-based monitoring to detect round-tripping: funds traversing 3+ accounts returning to originator within 7 calendar days.'',''Layering via domestic channels: 4+ sequential hops within 72 hours where each intermediate account holds funds under 4 hours. This supersedes the layering definition in KAVACH/2024/03 para 4 (3 hops/48 hours for wire transfers).'',''Closely linked accounts include: same customer, immediate family, entities with 25%+ ownership by the customer.'',''System shall trace 5+ hops and flag chains where: (a) Total amount within 5% of original, (b) All transfers within business hours, (c) Vague narrations like payment or transfer.'',''When detected: (a) All chain accounts on 180-day watch list, (b) STR for each account, (c) Aggregate value reported to FIU-IND.'',''REs shall deploy ML models on known round-tripping patterns for near real-time scoring. AML team review within 24 hours.'']},
        {''ref'':''KAVACH/2024/07'',''date'':''01 November 2024'',''title'':''Digital Channel Fraud Prevention and Account Takeover Controls'',''body'':[''Multi-factor authentication mandatory for all digital channels. Transactions exceeding Rs. 2,00,000 require step-up authentication.'',''Account takeover indicators triggering real-time alerts: (a) New device + high-value transaction within 60 minutes, (b) New beneficiary + funds transfer in same session, (c) Mobile/email change + transaction within 24 hours.'',''When all three indicators occur within 60 minutes, transaction automatically held for manual verification. Customer contacted via previously registered mobile.'',''Device fingerprinting for all digital sessions. Flag: (a) VPN/proxy via IP reputation, (b) Hosting provider/data center IPs, (c) Impossible travel between distant locations.'',''Channel limits: UPI Rs. 1,00,000, IMPS Rs. 5,00,000, NEFT enhanced monitoring above Rs. 10,00,000. Max-limit transfer from new device flagged.'',''Behavioral biometrics or session analytics to detect anomalous patterns deviating from customer baseline.'']},
        {''ref'':''KAVACH/2025/01'',''date'':''15 January 2025'',''title'':''Amendment to KAVACH/2024/01 - Revised Cash Transaction Reporting Thresholds'',''amendment_of'':''KAVACH/2024/01'',''body'':[''In modification of para 1 of KAVACH/2024/01, the CTR threshold is revised from Rs. 10,00,000 to Rs. 15,00,000 (Rupees Fifteen Lakhs), effective 01 April 2025.'',''Structuring detection threshold revised: deposits Rs. 13,00,000 to Rs. 14,99,999 conducted 3+ times in 30 days trigger structuring alerts.'',''PAN verification threshold for individual cash deposits at Rs. 50,000 remains unchanged.'',''All other provisions of KAVACH/2024/01 not modified by this amendment continue in force.'',''REs shall update monitoring systems within 90 days of effective date. During transition, stricter threshold applies.'',''Amendment per Standing Committee recommendations, adjusting for inflation while maintaining AML controls.'']},
    ]
    stage = ''@KAVACH_DB.RAW.REG_STAGE''
    created = []
    for c in circulars:
        pdf = make_pdf(c[''ref''],c[''date''],c[''title''],c[''body''],c.get(''amendment_of''),c.get(''conflict_with''))
        fname = c[''ref''].replace(''/'',''_'') + ''.pdf''
        tmp = os.path.join(tempfile.gettempdir(), fname)
        pdf.output(tmp)
        session.file.put(tmp, stage, auto_compress=False, overwrite=True)
        os.remove(tmp)
        created.append(fname)
    return f"OK: {len(created)} PDFs: {'', ''.join(created)}"
';

-- Generate the PDFs
CALL RAW.GENERATE_REG_CIRCULARS();

-- Verify
LIST @RAW.REG_STAGE;
