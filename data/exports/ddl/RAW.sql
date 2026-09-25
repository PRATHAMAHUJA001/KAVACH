create or replace schema KAVACH_DB.RAW COMMENT='Raw ingested/synthetic data';

create or replace TABLE KAVACH_DB.RAW.ACCOUNTS (
	ACCOUNT_ID VARCHAR(16777216),
	CUSTOMER_ID VARCHAR(16777216),
	ACCOUNT_TYPE VARCHAR(16777216),
	OPEN_DATE VARCHAR(16777216),
	BRANCH_CODE VARCHAR(16777216),
	STATUS VARCHAR(16777216),
	AVG_MONTHLY_BALANCE NUMBER(38,0)
);
create or replace TABLE KAVACH_DB.RAW.ANALYST_FEEDBACK (
	FEEDBACK_ID VARCHAR(16777216),
	ALERT_ID VARCHAR(16777216),
	ANALYST_ID VARCHAR(16777216),
	DECISION VARCHAR(16777216),
	NOTES VARCHAR(16777216),
	CREATED_AT TIMESTAMP_NTZ(9)
);
create or replace TABLE KAVACH_DB.RAW.BENEFICIARIES (
	BENEFICIARY_ID VARCHAR(16777216),
	ACCOUNT_ID VARCHAR(16777216),
	BENEFICIARY_ACCOUNT VARCHAR(16777216),
	BENEFICIARY_VPA VARCHAR(16777216),
	BENEFICIARY_BANK VARCHAR(16777216),
	BENEFICIARY_NAME VARCHAR(16777216),
	ADDED_AT VARCHAR(16777216)
);
create or replace TABLE KAVACH_DB.RAW.CUSTOMERS (
	CUSTOMER_ID VARCHAR(16777216),
	CUSTOMER_NAME VARCHAR(16777216),
	PAN VARCHAR(16777216),
	DOB VARCHAR(16777216),
	CITY VARCHAR(16777216),
	STATE VARCHAR(16777216),
	STATE_CODE VARCHAR(16777216),
	REGION VARCHAR(16777216),
	OCCUPATION VARCHAR(16777216),
	DECLARED_ANNUAL_INCOME NUMBER(38,0),
	KYC_STATUS VARCHAR(16777216),
	KYC_LAST_UPDATED VARCHAR(16777216),
	RISK_CATEGORY VARCHAR(16777216),
	IS_PEP BOOLEAN,
	ONBOARDING_CHANNEL VARCHAR(16777216),
	SEGMENT VARCHAR(16777216)
);
create or replace TABLE KAVACH_DB.RAW.DEVICES (
	DEVICE_ID VARCHAR(16777216),
	DEVICE_TYPE VARCHAR(16777216),
	OS VARCHAR(16777216),
	IP_ADDRESS VARCHAR(16777216),
	CITY VARCHAR(16777216),
	COUNTRY_CODE VARCHAR(16777216),
	FIRST_SEEN VARCHAR(16777216),
	ACCOUNT_ID VARCHAR(16777216)
);
create or replace TABLE KAVACH_DB.RAW.GROUND_TRUTH (
	RECORD_ID VARCHAR(16777216),
	ENTITY_TYPE VARCHAR(16777216),
	ENTITY_ID VARCHAR(16777216),
	TXN_IDS VARCHAR(16777216),
	TYPOLOGY VARCHAR(16777216),
	DESCRIPTION VARCHAR(16777216),
	INJECTED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP()
);
create or replace TABLE KAVACH_DB.RAW.LOGINS (
	LOGIN_ID VARCHAR(16777216),
	ACCOUNT_ID VARCHAR(16777216),
	DEVICE_ID VARCHAR(16777216),
	IP_ADDRESS VARCHAR(16777216),
	LOGIN_TS TIMESTAMP_NTZ(9),
	CITY VARCHAR(16777216),
	COUNTRY VARCHAR(16777216),
	SUCCESS BOOLEAN
);
create or replace TABLE KAVACH_DB.RAW.TRANSACTIONS (
	TXN_ID VARCHAR(16777216),
	ACCOUNT_ID VARCHAR(16777216),
	TXN_TS VARCHAR(16777216),
	AMOUNT_INR NUMBER(18,2),
	CHANNEL VARCHAR(16777216),
	DIRECTION VARCHAR(16777216),
	COUNTERPARTY VARCHAR(16777216),
	COUNTERPARTY_BANK VARCHAR(16777216),
	COUNTRY VARCHAR(16777216),
	MERCHANT_CATEGORY VARCHAR(16777216),
	NARRATION VARCHAR(16777216),
	DEVICE_ID VARCHAR(16777216),
	IP_ADDRESS VARCHAR(16777216)
);
CREATE OR REPLACE PROCEDURE KAVACH_DB.RAW.GENERATE_BASE_ENTITIES("SCALE_FACTOR" FLOAT, "SEED" NUMBER(38,0))
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import random
import string
from datetime import datetime, timedelta

def run(session, scale_factor, seed):
    random.seed(seed)
    SF = float(scale_factor)
    geo_rows = session.sql("SELECT CITY, STATE_NAME, STATE_CODE, REGION FROM KAVACH_DB.REF.GEO_INDIA").collect()
    cities = [{''CITY'':r[''CITY''],''STATE_NAME'':r[''STATE_NAME''],''STATE_CODE'':r[''STATE_CODE''],''REGION'':r[''REGION'']} for r in geo_rows]
    ip_rows = session.sql("SELECT START_INT, END_INT, COUNTRY_CODE, CITY FROM KAVACH_DB.REF.IP_GEO WHERE COUNTRY_CODE=''IN''").collect()
    india_ips = [{''START_INT'':int(r[''START_INT'']),''END_INT'':int(r[''END_INT'']),''CITY'':r[''CITY'']} for r in ip_rows]

    FNM = [''Aarav'',''Amit'',''Anand'',''Anil'',''Arjun'',''Ashok'',''Bharat'',''Deepak'',''Gaurav'',''Gopal'',''Hari'',''Hemant'',''Jatin'',''Karan'',''Kartik'',''Lalit'',''Manoj'',''Mohit'',''Mukesh'',''Neeraj'',''Nikhil'',''Pankaj'',''Pradeep'',''Rahul'',''Rajesh'',''Rakesh'',''Ramesh'',''Ravi'',''Rohit'',''Sachin'',''Sandeep'',''Sanjay'',''Satish'',''Shiv'',''Sunil'',''Suresh'',''Tarun'',''Varun'',''Vijay'',''Vikram'',''Vinod'',''Vishal'',''Yash'',''Aditya'',''Ajay'',''Dhruv'',''Kiran'',''Manish'',''Naveen'',''Prakash'']
    FNF = [''Anita'',''Anjali'',''Asha'',''Deepa'',''Divya'',''Geeta'',''Isha'',''Jaya'',''Kavita'',''Lakshmi'',''Meena'',''Neha'',''Nisha'',''Pallavi'',''Pooja'',''Priya'',''Radha'',''Rekha'',''Rita'',''Ritu'',''Sapna'',''Sarita'',''Seema'',''Shweta'',''Sita'',''Sneha'',''Sonia'',''Sunita'',''Swati'',''Tanvi'',''Uma'',''Vandana'',''Vidya'',''Poonam'',''Mamta'',''Kajal'',''Jyoti'',''Gauri'',''Komal'',''Shruti'']
    LN = [''Sharma'',''Verma'',''Gupta'',''Singh'',''Kumar'',''Patel'',''Reddy'',''Nair'',''Menon'',''Joshi'',''Tiwari'',''Mishra'',''Pandey'',''Yadav'',''Chauhan'',''Agarwal'',''Mehta'',''Shah'',''Desai'',''Rao'',''Iyer'',''Pillai'',''Das'',''Bose'',''Ghosh'',''Mukherjee'',''Banerjee'',''Chatterjee'',''Srivastava'',''Dubey'',''Thakur'',''Choudhary'',''Saxena'',''Bhatt'',''Kulkarni'',''Patil'',''Deshpande'',''Jain'',''Kapoor'',''Malhotra'']
    OCCS = [''Salaried'',''Business'',''Self-Employed'',''Professional'',''Retired'',''Student'',''Homemaker'',''Farmer'',''Government'',''NRI'']
    SEGS = [''RETAIL'',''PREMIUM'',''HNI'',''NRI'',''SALARY'',''MSME'']
    OB_CH = [''BRANCH'',''ONLINE'',''MOBILE'',''DSA'',''REFERRAL'']
    ATYPES = [''SAVINGS'',''SAVINGS'',''SAVINGS'',''CURRENT'',''CURRENT'',''NRE'',''NRO'',''LOAN'']
    BANKS = [''HDFC'',''ICICI'',''SBI'',''AXIS'',''KOTAK'',''YES'',''PNB'',''BOB'',''CANARA'',''UNION'',''IDBI'',''FEDERAL'',''BANDHAN'',''RBL'',''IDFC'']
    INC_BASE = {''Salaried'':500000,''Business'':1200000,''Self-Employed'':800000,''Professional'':1000000,''Retired'':400000,''Student'':100000,''Homemaker'':200000,''Farmer'':300000,''Government'':700000,''NRI'':2000000}
    KYC_OPTS = [''VERIFIED'']*70 + [''PENDING'']*15 + [''EXPIRED'']*15

    NC = int(20000 * SF)
    NA = int(28000 * SF)
    ND = int(15000 * SF)
    NB = int(40000 * SF)

    # ---- CUSTOMERS (batch SQL insert) ----
    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.RAW.CUSTOMERS (CUSTOMER_ID STRING,CUSTOMER_NAME STRING,PAN STRING,DOB STRING,CITY STRING,STATE STRING,STATE_CODE STRING,REGION STRING,OCCUPATION STRING,DECLARED_ANNUAL_INCOME NUMBER,KYC_STATUS STRING,KYC_LAST_UPDATED STRING,RISK_CATEGORY STRING,IS_PEP BOOLEAN,ONBOARDING_CHANNEL STRING,SEGMENT STRING)").collect()
    BATCH = 5000
    cust_ids = []
    for batch_start in range(0, NC, BATCH):
        vals = []
        for i in range(batch_start, min(batch_start + BATCH, NC)):
            is_m = random.random() < 0.55
            fn = random.choice(FNM if is_m else FNF)
            ln_v = random.choice(LN)
            name = f"{fn} {ln_v}"
            loc = random.choice(cities)
            pan = ''''.join(random.choices(string.ascii_uppercase, k=5)) + ''''.join(random.choices(string.digits, k=4)) + random.choice(string.ascii_uppercase)
            dob = (datetime(1955,1,1) + timedelta(days=random.randint(0, 22000))).strftime(''%Y-%m-%d'')
            occ = random.choice(OCCS)
            import math
            income = int(INC_BASE[occ] * math.exp(random.gauss(0, 0.5)))
            income = max(50000, min(income, 50000000))
            rp = random.random()
            risk = ''LOW'' if rp < 0.7 else (''MEDIUM'' if rp < 0.92 else ''HIGH'')
            is_pep = random.random() < 0.005
            kyc = random.choice(KYC_OPTS)
            kyc_d = (datetime(2023,1,1) + timedelta(days=random.randint(0,700))).strftime(''%Y-%m-%d'')
            seg = random.choice(SEGS)
            if income > 5000000: seg = ''HNI''
            elif occ == ''NRI'': seg = ''NRI''
            cid = f''CUST{i+1:06d}''
            cust_ids.append(cid)
            esc_name = name.replace("''", "''''")
            vals.append(f"(''{cid}'',''{esc_name}'',''{pan}'',''{dob}'',''{loc[''CITY'']}'',''{loc[''STATE_NAME'']}'',''{loc[''STATE_CODE'']}'',''{loc[''REGION'']}'',''{occ}'',{income},''{kyc}'',''{kyc_d}'',''{risk}'',{is_pep},''{random.choice(OB_CH)}'',''{seg}'')")
        sql = f"INSERT INTO KAVACH_DB.RAW.CUSTOMERS VALUES {'',''.join(vals)}"
        session.sql(sql).collect()

    # ---- ACCOUNTS ----
    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.RAW.ACCOUNTS (ACCOUNT_ID STRING,CUSTOMER_ID STRING,ACCOUNT_TYPE STRING,OPEN_DATE STRING,BRANCH_CODE STRING,STATUS STRING,AVG_MONTHLY_BALANCE NUMBER)").collect()
    branches = [f"BR{i:04d}" for i in range(1, 201)]
    import math
    acct_idx = 0
    acct_vals = []
    acct_status_map = {}
    for cid in cust_ids:
        na = random.choices([1,2,3], weights=[60,30,10], k=1)[0]
        for _ in range(na):
            if acct_idx >= NA: break
            acct_idx += 1
            atype = random.choice(ATYPES)
            od = (datetime(2018,1,1)+timedelta(days=random.randint(0,2400))).strftime(''%Y-%m-%d'')
            sp = random.random()
            st = ''ACTIVE'' if sp < 0.85 else (''DORMANT'' if sp < 0.95 else ''CLOSED'')
            bal = max(100, min(int(math.exp(random.gauss(10,1.5))), 50000000))
            aid = f''ACC{acct_idx:07d}''
            acct_status_map[aid] = st
            acct_vals.append(f"(''{aid}'',''{cid}'',''{atype}'',''{od}'',''{random.choice(branches)}'',''{st}'',{bal})")
            if len(acct_vals) >= 5000:
                session.sql(f"INSERT INTO KAVACH_DB.RAW.ACCOUNTS VALUES {'',''.join(acct_vals)}").collect()
                acct_vals = []
        if acct_idx >= NA: break
    while acct_idx < NA:
        acct_idx += 1
        cid = random.choice(cust_ids)
        st = ''ACTIVE'' if random.random() < 0.85 else ''DORMANT''
        bal = max(100, min(int(math.exp(random.gauss(10,1.5))), 50000000))
        aid = f''ACC{acct_idx:07d}''
        acct_status_map[aid] = st
        acct_vals.append(f"(''{aid}'',''{cid}'',''{random.choice(ATYPES)}'',''{(datetime(2018,1,1)+timedelta(days=random.randint(0,2400))).strftime(''%Y-%m-%d'')}'',''{random.choice(branches)}'',''{st}'',{bal})")
        if len(acct_vals) >= 5000:
            session.sql(f"INSERT INTO KAVACH_DB.RAW.ACCOUNTS VALUES {'',''.join(acct_vals)}").collect()
            acct_vals = []
    if acct_vals:
        session.sql(f"INSERT INTO KAVACH_DB.RAW.ACCOUNTS VALUES {'',''.join(acct_vals)}").collect()

    active_aids = [k for k,v in acct_status_map.items() if v == ''ACTIVE'']

    # ---- DEVICES ----
    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.RAW.DEVICES (DEVICE_ID STRING,DEVICE_TYPE STRING,OS STRING,IP_ADDRESS STRING,CITY STRING,COUNTRY_CODE STRING,FIRST_SEEN STRING,ACCOUNT_ID STRING)").collect()
    dtypes = [''ANDROID'',''ANDROID'',''ANDROID'',''IOS'',''IOS'',''DESKTOP'',''DESKTOP'']
    dev_vals = []
    for i in range(ND):
        dt = random.choice(dtypes)
        os_v = {''ANDROID'':''Android'',''IOS'':''iOS'',''DESKTOP'':random.choice([''Windows'',''macOS'',''Linux''])}[dt]
        ipr = random.choice(india_ips)
        ip_int = random.randint(ipr[''START_INT''], ipr[''END_INT''])
        ip = f"{(ip_int>>24)&0xFF}.{(ip_int>>16)&0xFF}.{(ip_int>>8)&0xFF}.{ip_int&0xFF}"
        fs = (datetime(2024,1,1)+timedelta(days=random.randint(0,180))).strftime(''%Y-%m-%d'')
        dev_vals.append(f"(''DEV{i+1:06d}'',''{dt}'',''{os_v}'',''{ip}'',''{ipr[''CITY'']}'',''IN'',''{fs}'',''{random.choice(active_aids)}'')")
        if len(dev_vals) >= 5000:
            session.sql(f"INSERT INTO KAVACH_DB.RAW.DEVICES VALUES {'',''.join(dev_vals)}").collect()
            dev_vals = []
    if dev_vals:
        session.sql(f"INSERT INTO KAVACH_DB.RAW.DEVICES VALUES {'',''.join(dev_vals)}").collect()

    # ---- BENEFICIARIES ----
    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.RAW.BENEFICIARIES (BENEFICIARY_ID STRING,ACCOUNT_ID STRING,BENEFICIARY_ACCOUNT STRING,BENEFICIARY_VPA STRING,BENEFICIARY_BANK STRING,BENEFICIARY_NAME STRING,ADDED_AT STRING)").collect()
    bene_vals = []
    for i in range(NB):
        aid = random.choice(active_aids)
        is_vpa = random.random() < 0.4
        ba = ''''.join(random.choices(string.digits, k=12)) if not is_vpa else None
        bv = f"{''''.join(random.choices(string.ascii_lowercase, k=6))}@{random.choice([''upi'',''paytm'',''ybl'',''oksbi'',''apl''])}" if is_vpa else None
        bb = random.choice(BANKS) if not is_vpa else None
        bn = f"{random.choice(FNM+FNF)} {random.choice(LN)}"
        aat = (datetime(2024,1,1)+timedelta(days=random.randint(0,180))).strftime(''%Y-%m-%d %H:%M:%S'')
        ba_s = f"''{ba}''" if ba else ''NULL''
        bv_s = f"''{bv}''" if bv else ''NULL''
        bb_s = f"''{bb}''" if bb else ''NULL''
        bene_vals.append(f"(''BEN{i+1:06d}'',''{aid}'',{ba_s},{bv_s},{bb_s},''{bn.replace(chr(39),chr(39)+chr(39))}'',''{aat}'')")
        if len(bene_vals) >= 5000:
            session.sql(f"INSERT INTO KAVACH_DB.RAW.BENEFICIARIES VALUES {'',''.join(bene_vals)}").collect()
            bene_vals = []
    if bene_vals:
        session.sql(f"INSERT INTO KAVACH_DB.RAW.BENEFICIARIES VALUES {'',''.join(bene_vals)}").collect()

    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.RAW.ANALYST_FEEDBACK (FEEDBACK_ID STRING,ALERT_ID STRING,ANALYST_ID STRING,DECISION STRING,NOTES STRING,CREATED_AT TIMESTAMP_NTZ)").collect()
    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.RAW.LOGINS (LOGIN_ID STRING,ACCOUNT_ID STRING,DEVICE_ID STRING,IP_ADDRESS STRING,LOGIN_TS TIMESTAMP_NTZ,CITY STRING,COUNTRY STRING,SUCCESS BOOLEAN)").collect()
    return f"OK: {NC} customers, {NA} accounts, {ND} devices, {NB} beneficiaries"
';
CREATE OR REPLACE PROCEDURE KAVACH_DB.RAW.GENERATE_LOGINS("SEED" NUMBER(38,0) DEFAULT 42)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import random
from datetime import datetime, timedelta

def run(session, seed):
    random.seed(seed + 300)
    devs = session.sql("SELECT DEVICE_ID, ACCOUNT_ID, IP_ADDRESS, CITY, COUNTRY_CODE FROM KAVACH_DB.RAW.DEVICES").collect()
    session.sql("TRUNCATE TABLE KAVACH_DB.RAW.LOGINS").collect()
    BATCH = 5000
    vals = []
    idx = 0
    for d in devs:
        n = random.randint(5, 20)
        for _ in range(n):
            idx += 1
            ts = datetime(2024,4,1) + timedelta(days=random.randint(0,179), hours=random.randint(6,22), minutes=random.randint(0,59))
            success = random.random() > 0.05
            vals.append(f"(''LOG{idx:08d}'',''{d[''ACCOUNT_ID'']}'',''{d[''DEVICE_ID'']}'',''{d[''IP_ADDRESS'']}'',''{ts.strftime(''%Y-%m-%d %H:%M:%S'')}'',''{d[''CITY'']}'',''{d[''COUNTRY_CODE'']}'',{success})")
            if len(vals) >= BATCH:
                session.sql(f"INSERT INTO KAVACH_DB.RAW.LOGINS VALUES {'',''.join(vals)}").collect()
                vals = []
    if vals:
        session.sql(f"INSERT INTO KAVACH_DB.RAW.LOGINS VALUES {'',''.join(vals)}").collect()
    return f"OK: {idx} logins generated"
';
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
CREATE OR REPLACE PROCEDURE KAVACH_DB.RAW.GENERATE_TRANSACTIONS("SCALE_FACTOR" FLOAT, "SEED" NUMBER(38,0))
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import random, string, math
from datetime import datetime, timedelta

def run(session, scale_factor, seed):
    random.seed(seed + 100)
    SF = float(scale_factor)
    N_TXN = int(1500000 * SF)
    BATCH = 5000
    acct_rows = session.sql("SELECT ACCOUNT_ID FROM KAVACH_DB.RAW.ACCOUNTS WHERE STATUS=''ACTIVE''").collect()
    acct_ids = [r[''ACCOUNT_ID''] for r in acct_rows]
    dev_rows = session.sql("SELECT DEVICE_ID, IP_ADDRESS FROM KAVACH_DB.RAW.DEVICES").collect()
    dev_list = [r[''DEVICE_ID''] for r in dev_rows]
    dev_ips = {r[''DEVICE_ID'']:r[''IP_ADDRESS''] for r in dev_rows}

    CHANNELS = [''UPI'',''UPI'',''UPI'',''IMPS'',''IMPS'',''NEFT'',''NEFT'',''RTGS'',''CASH'',''CASH'',''CARD'',''CARD'',''SWIFT'']
    DIRS = [''DEBIT'',''CREDIT'']
    BANKS = [''HDFC'',''ICICI'',''SBI'',''AXIS'',''KOTAK'',''YES'',''PNB'',''BOB'',''CANARA'',''UNION'',''IDBI'']
    MCC = [''GROCERY'',''FUEL'',''DINING'',''TRAVEL'',''ELECTRONICS'',''CLOTHING'',''MEDICAL'',''EDUCATION'',''RENT'',''UTILITIES'',''INSURANCE'',''INVESTMENT'',''TRANSFER'',''SALARY'',''CASH_DEPOSIT'',''CASH_WITHDRAWAL'',''ATM'',''ONLINE_SHOPPING'',''ENTERTAINMENT'',''SUBSCRIPTION'']
    CS = [''US'',''GB'',''AE'',''SG'',''HK'',''DE'',''FR'',''JP'',''AU'',''CA'',''NP'',''BD'',''LK'']
    NARRS = [''UPI txn'',''IMPS transfer'',''NEFT payment'',''salary credit'',''ATM withdrawal'',''POS purchase'',''online shopping'',''EMI payment'',''rent payment'',''grocery store'',''fuel station'',''restaurant bill'',''electricity bill'',''mobile recharge'',''insurance premium'',''mutual fund SIP'',''FD interest'',''loan EMI'',''cash deposit'',''cheque deposit'',''RTGS transfer'',''credit card pmt'',''paytm transfer'',''PhonePe payment'',''Google Pay'',''paise bheje'',''dukaan payment'',''kiraya'',''bijli bill'',''school fees'',''hospital pmt'',''medicine'',''train ticket'',''Swiggy order'',''Zomato food'',''Flipkart purchase'']
    START = datetime(2024, 4, 1)

    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.RAW.TRANSACTIONS (TXN_ID STRING,ACCOUNT_ID STRING,TXN_TS STRING,AMOUNT_INR NUMBER(18,2),CHANNEL STRING,DIRECTION STRING,COUNTERPARTY STRING,COUNTERPARTY_BANK STRING,COUNTRY STRING,MERCHANT_CATEGORY STRING,NARRATION STRING,DEVICE_ID STRING,IP_ADDRESS STRING)").collect()

    vals = []
    for i in range(1, N_TXN + 1):
        aid = random.choice(acct_ids)
        ch = random.choice(CHANNELS)
        d = random.choice(DIRS)
        ap = random.random()
        if ap < 0.4: amt = round(random.uniform(50, 5000), 2)
        elif ap < 0.7: amt = round(random.uniform(5000, 50000), 2)
        elif ap < 0.9: amt = round(random.uniform(50000, 500000), 2)
        elif ap < 0.97: amt = round(random.uniform(500000, 2000000), 2)
        else: amt = round(random.uniform(2000000, 10000000), 2)
        if ch == ''RTGS'': amt = max(amt, 200000)
        elif ch == ''SWIFT'': amt = max(amt, 100000)
        ts = START + timedelta(days=random.randint(0,179), hours=random.randint(6,22), minutes=random.randint(0,59), seconds=random.randint(0,59))
        country = random.choice(CS) if ch == ''SWIFT'' else ''IN''
        cp = ''''.join(random.choices(string.ascii_uppercase, k=1)) + ''''.join(random.choices(string.ascii_lowercase, k=5))
        did = random.choice(dev_list) if ch in (''UPI'',''IMPS'',''CARD'') else None
        ip = dev_ips.get(did) if did else None
        narr = random.choice(NARRS).replace("''", "''''")
        did_s = f"''{did}''" if did else ''NULL''
        ip_s = f"''{ip}''" if ip else ''NULL''
        vals.append(f"(''TXN{i:08d}'',''{aid}'',''{ts.strftime(''%Y-%m-%d %H:%M:%S'')}'',{amt},''{ch}'',''{d}'',''{cp}'',''{random.choice(BANKS)}'',''{country}'',''{random.choice(MCC)}'',''{narr}'',{did_s},{ip_s})")
        if len(vals) >= BATCH:
            session.sql(f"INSERT INTO KAVACH_DB.RAW.TRANSACTIONS VALUES {'',''.join(vals)}").collect()
            vals = []
    if vals:
        session.sql(f"INSERT INTO KAVACH_DB.RAW.TRANSACTIONS VALUES {'',''.join(vals)}").collect()
    return f"OK: {N_TXN} transactions generated"
';
CREATE OR REPLACE PROCEDURE KAVACH_DB.RAW.INJECT_FRAUD_PATTERNS("SCALE_FACTOR" FLOAT, "SEED" NUMBER(38,0))
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
ARTIFACT_REPOSITORY = snowflake.snowpark.pypi_shared_repository
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS '
import random, string
from datetime import datetime, timedelta

def run(session, scale_factor, seed):
    random.seed(seed + 200)
    SF = float(scale_factor)
    session.sql("CREATE OR REPLACE TABLE KAVACH_DB.RAW.GROUND_TRUTH (RECORD_ID STRING,ENTITY_TYPE STRING,ENTITY_ID STRING,TXN_IDS STRING,TYPOLOGY STRING,DESCRIPTION STRING,INJECTED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP())").collect()
    acct_rows = session.sql("SELECT ACCOUNT_ID,CUSTOMER_ID FROM KAVACH_DB.RAW.ACCOUNTS WHERE STATUS=''ACTIVE''").collect()
    active_ids = [r[''ACCOUNT_ID''] for r in acct_rows]
    a2c = {r[''ACCOUNT_ID'']:r[''CUSTOMER_ID''] for r in acct_rows}
    dev_rows = session.sql("SELECT DEVICE_ID,IP_ADDRESS FROM KAVACH_DB.RAW.DEVICES LIMIT 200").collect()
    dev_list = [r[''DEVICE_ID''] for r in dev_rows]
    dev_ips = {r[''DEVICE_ID'']:r[''IP_ADDRESS''] for r in dev_rows}
    dormant_rows = session.sql("SELECT ACCOUNT_ID FROM KAVACH_DB.RAW.ACCOUNTS WHERE STATUS=''DORMANT'' LIMIT 40").collect()
    dormant_ids = [r[''ACCOUNT_ID''] for r in dormant_rows]
    pep_rows = session.sql("SELECT c.CUSTOMER_ID,a.ACCOUNT_ID FROM KAVACH_DB.RAW.CUSTOMERS c JOIN KAVACH_DB.RAW.ACCOUNTS a ON c.CUSTOMER_ID=a.CUSTOMER_ID WHERE c.IS_PEP=TRUE AND a.STATUS=''ACTIVE'' LIMIT 15").collect()
    low_inc = session.sql("SELECT c.CUSTOMER_ID,a.ACCOUNT_ID FROM KAVACH_DB.RAW.CUSTOMERS c JOIN KAVACH_DB.RAW.ACCOUNTS a ON c.CUSTOMER_ID=a.CUSTOMER_ID WHERE c.DECLARED_ANNUAL_INCOME<500000 AND a.STATUS=''ACTIVE'' LIMIT 50").collect()

    foreign_ips = [''104.238.45.67'',''185.100.85.12'',''198.51.100.55'',''185.220.101.33'']
    hr_countries = [''IR'',''KP'',''SY'',''MM'',''AF'',''NG'',''SO'']
    BANKS = [''HDFC'',''ICICI'',''SBI'',''AXIS'',''KOTAK'']
    START = datetime(2024, 4, 1)
    tc = 2000000
    gt = []
    txn_vals = []

    def add_txn(tid,aid,ts,amt,ch,d,cp,cb,co,mc,narr,did,ip):
        did_s = f"''{did}''" if did else ''NULL''
        ip_s = f"''{ip}''" if ip else ''NULL''
        txn_vals.append(f"(''{tid}'',''{aid}'',''{ts}'',{amt},''{ch}'',''{d}'',''{cp}'',''{cb}'',''{co}'',''{mc}'',''{narr}'',{did_s},{ip_s})")

    def flush_txns():
        nonlocal txn_vals
        if txn_vals:
            session.sql(f"INSERT INTO KAVACH_DB.RAW.TRANSACTIONS VALUES {'',''.join(txn_vals)}").collect()
            txn_vals = []

    # 1. STRUCTURING
    n_str = int(20 * SF)
    for aid in random.sample(active_ids, min(n_str, len(active_ids))):
        tids = []
        for _ in range(random.randint(8,20)):
            tc += 1; tid = f''TXN{tc:08d}''
            amt = round(random.uniform(940000,999000),2) if random.random()<0.6 else round(random.uniform(48000,49900),2)
            ts = (START+timedelta(days=random.randint(0,160),hours=random.randint(9,17))).strftime(''%Y-%m-%d %H:%M:%S'')
            add_txn(tid,aid,ts,amt,''CASH'',''CREDIT'',''SELF'',''SELF'',''IN'',''CASH_DEPOSIT'',''cash deposit branch'',None,None)
            tids.append(tid)
        gt.append(f"(''GT-STR-{aid}'',''ACCOUNT'',''{aid}'',''[{len(tids)} txns]'',''STRUCTURING'',''Repeated cash deposits under CTR thresholds'')")

    # 2. MULE RING
    for ri in range(int(3*SF)):
        rs = random.randint(8,15)
        ring = random.sample(active_ids, min(rs, len(active_ids)))
        sd = random.sample(dev_list, min(2,len(dev_list)))
        sip = dev_ips.get(sd[0],''104.238.45.67'')
        ring_tids = []
        for aid in ring:
            for _ in range(random.randint(3,8)):
                bts = START+timedelta(days=random.randint(30,150))
                amt = round(random.uniform(50000,500000),2)
                for d in [''CREDIT'',''DEBIT'']:
                    tc+=1; tid=f''TXN{tc:08d}''
                    ts = (bts+timedelta(minutes=random.randint(5,30) if d==''DEBIT'' else 0)).strftime(''%Y-%m-%d %H:%M:%S'')
                    add_txn(tid,aid,ts,amt,''IMPS'',d,random.choice(ring),''KAVACH'',''IN'',''TRANSFER'',''IMPS transfer'',random.choice(sd),sip)
                    ring_tids.append(tid)
        for aid in ring:
            gt.append(f"(''GT-MULE-R{ri}-{aid}'',''ACCOUNT'',''{aid}'',''[ring {ri+1}]'',''MULE_RING'',''{rs} accounts sharing devices'')")
    flush_txns()

    # 3. DORMANT REACTIVATION
    for aid in dormant_ids[:int(25*SF)]:
        tc+=1; tid=f''TXN{tc:08d}''
        ts=(START+timedelta(days=random.randint(100,170),hours=random.randint(10,16))).strftime(''%Y-%m-%d %H:%M:%S'')
        amt=round(random.uniform(500000,5000000),2)
        add_txn(tid,aid,ts,amt,''NEFT'',''DEBIT'',''Unknown Entity'',''FOREIGN'',''AE'',''TRANSFER'',''NEFT high value'',None,None)
        gt.append(f"(''GT-DORM-{aid}'',''ACCOUNT'',''{aid}'',''[{tid}]'',''DORMANT_REACTIVATION'',''Dormant reactivated with large transfer'')")

    # 4. RAPID PASS-THROUGH
    for aid in random.sample(active_ids, min(int(30*SF), len(active_ids))):
        tids=[]
        for _ in range(random.randint(5,15)):
            tc+=1; ti=f''TXN{tc:08d}''; tc+=1; to=f''TXN{tc:08d}''
            bts=START+timedelta(days=random.randint(10,170))
            amt=round(random.uniform(100000,1000000),2)
            add_txn(ti,aid,bts.strftime(''%Y-%m-%d %H:%M:%S''),amt,''IMPS'',''CREDIT'',''Sender'',random.choice(BANKS),''IN'',''TRANSFER'',''IMPS credit'',None,None)
            add_txn(to,aid,(bts+timedelta(hours=random.randint(1,20))).strftime(''%Y-%m-%d %H:%M:%S''),round(amt*random.uniform(0.95,1.0),2),''IMPS'',''DEBIT'',''Receiver'',random.choice(BANKS),''IN'',''TRANSFER'',''IMPS debit'',None,None)
            tids.extend([ti,to])
        gt.append(f"(''GT-PT-{aid}'',''ACCOUNT'',''{aid}'',''[{len(tids)} txns]'',''RAPID_PASSTHROUGH'',''In approx out within 24h'')")
    flush_txns()

    # 5. INCOME MISMATCH
    for row in low_inc[:int(40*SF)]:
        aid,cid=row[''ACCOUNT_ID''],row[''CUSTOMER_ID'']
        tids=[]
        for _ in range(random.randint(20,50)):
            tc+=1; tid=f''TXN{tc:08d}''
            ts=(START+timedelta(days=random.randint(0,170),hours=random.randint(8,22))).strftime(''%Y-%m-%d %H:%M:%S'')
            amt=round(random.uniform(100000,500000),2)
            add_txn(tid,aid,ts,amt,random.choice([''UPI'',''IMPS'',''NEFT'']),random.choice([''CREDIT'',''DEBIT'']),''Various'',random.choice(BANKS),''IN'',''TRANSFER'',''high value txn'',None,None)
            tids.append(tid)
        gt.append(f"(''GT-INC-{cid}'',''CUSTOMER'',''{cid}'',''[{len(tids)} txns]'',''INCOME_MISMATCH'',''Turnover >10x declared income'')")
    flush_txns()

    # 6. ROUND-TRIPPING
    for ri in range(int(6*SF)):
        cl=random.randint(3,4)
        chain=random.sample(active_ids,cl+1); chain.append(chain[0])
        amt=round(random.uniform(200000,2000000),2)
        bts=START+timedelta(days=random.randint(20,150))
        tids=[]
        for h in range(len(chain)-1):
            tc+=1; tid=f''TXN{tc:08d}''
            ts=(bts+timedelta(hours=h*random.randint(2,8))).strftime(''%Y-%m-%d %H:%M:%S'')
            add_txn(tid,chain[h],ts,round(amt*(1-h*0.01),2),''NEFT'',''DEBIT'',chain[h+1],''KAVACH'',''IN'',''TRANSFER'',''NEFT payment'',None,None)
            tids.append(tid)
        for aid in set(chain):
            gt.append(f"(''GT-RT-{ri}-{aid}'',''ACCOUNT'',''{aid}'',''[{len(tids)} hops]'',''ROUND_TRIPPING'',''{cl} hop chain returning to origin'')")

    # 7. HIGH-RISK SWIFT
    for aid in random.sample(active_ids, min(int(20*SF), len(active_ids))):
        tc+=1; tid=f''TXN{tc:08d}''
        co=random.choice(hr_countries)
        ts=(START+timedelta(days=random.randint(0,170),hours=random.randint(10,16))).strftime(''%Y-%m-%d %H:%M:%S'')
        amt=round(random.uniform(500000,10000000),2)
        add_txn(tid,aid,ts,amt,''SWIFT'',random.choice([''DEBIT'',''CREDIT'']),f''Entity-{co}'',f''{co}_BANK'',co,''TRANSFER'',f''SWIFT {co}'',None,None)
        gt.append(f"(''GT-SWIFT-{aid}'',''ACCOUNT'',''{aid}'',''[{tid}]'',''HIGH_RISK_SWIFT'',''SWIFT to/from {co}'')")

    # 8. ACCOUNT TAKEOVER
    for aid in random.sample(active_ids, min(int(12*SF), len(active_ids))):
        tc+=1; tid=f''TXN{tc:08d}''
        ts=(START+timedelta(days=random.randint(60,170),hours=random.randint(1,5),minutes=45)).strftime(''%Y-%m-%d %H:%M:%S'')
        amt=round(random.uniform(500000,2500000),2)
        fip=random.choice(foreign_ips)
        add_txn(tid,aid,ts,amt,''IMPS'',''DEBIT'',''NewBeneficiary'',''UNKNOWN'',''IN'',''TRANSFER'',''urgent IMPS'',random.choice(dev_list),fip)
        gt.append(f"(''GT-ATO-{aid}'',''ACCOUNT'',''{aid}'',''[{tid}]'',''ACCOUNT_TAKEOVER'',''New device + new bene + max transfer within 1hr'')")

    # 9. PEP UNUSUAL CASH
    for row in pep_rows[:int(10*SF)]:
        aid,cid=row[''ACCOUNT_ID''],row[''CUSTOMER_ID'']
        tids=[]
        for _ in range(random.randint(5,15)):
            tc+=1; tid=f''TXN{tc:08d}''
            ts=(START+timedelta(days=random.randint(0,170),hours=random.randint(10,17))).strftime(''%Y-%m-%d %H:%M:%S'')
            amt=round(random.uniform(500000,3000000),2)
            add_txn(tid,aid,ts,amt,''CASH'',random.choice([''CREDIT'',''DEBIT'']),''SELF'',''SELF'',''IN'',random.choice([''CASH_DEPOSIT'',''CASH_WITHDRAWAL'']),''cash txn branch'',None,None)
            tids.append(tid)
        gt.append(f"(''GT-PEP-{cid}'',''CUSTOMER'',''{cid}'',''[{len(tids)} txns]'',''PEP_UNUSUAL_CASH'',''PEP with unusual cash activity'')")
    flush_txns()

    # Write ground truth
    if gt:
        for b in range(0, len(gt), 1000):
            chunk = gt[b:b+1000]
            session.sql(f"INSERT INTO KAVACH_DB.RAW.GROUND_TRUTH (RECORD_ID,ENTITY_TYPE,ENTITY_ID,TXN_IDS,TYPOLOGY,DESCRIPTION) VALUES {'',''.join(chunk)}").collect()

    return f"OK: {tc-2000000} fraud txns, {len(gt)} ground truth records across 9 typologies"
';