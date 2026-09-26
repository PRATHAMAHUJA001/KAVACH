-- =============================================================================
-- KAVACH Phase 2B: Synthetic Data Generator (Snowpark Python)
-- =============================================================================
-- Generates ~1.5M transactions for a mid-size Indian private bank.
-- Parameterised: SCALE_FACTOR (1.0 = full), SEED (default 42).
-- Reads from REF schema for real reference data.
-- =============================================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;
USE SCHEMA RAW;

-- Stage for regulatory documents
CREATE STAGE IF NOT EXISTS RAW.REG_STAGE
    COMMENT = 'Internal stage for regulatory circular PDFs';

-- =========================================================================
-- PROCEDURE 1: Generate base entity tables (customers, accounts, devices, beneficiaries)
-- =========================================================================
CREATE OR REPLACE PROCEDURE RAW.GENERATE_BASE_ENTITIES(SCALE_FACTOR FLOAT, SEED INT)
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'numpy')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
import numpy as np
from datetime import datetime, timedelta
import random
import string
# NOTE: pandas is unavailable to Snowpark in stored procs on this account
# (create_dataframe()/to_pandas() both fail with "Optional dependency: pandas
# is not installed") — use session.create_dataframe(list_of_dicts) instead.

def run(session, scale_factor, seed):
    np.random.seed(seed)
    random.seed(seed)
    SF = float(scale_factor)

    # ---- Load reference data ----
    # NOTE: to_pandas() is unavailable in stored procs on this account (connector's
    # pandas dependency not installed) — use collect() + Row.as_dict() instead.
    geo = session.sql("SELECT CITY, STATE_NAME, STATE_CODE, REGION, TIER FROM KAVACH_DB.REF.GEO_INDIA").collect()
    cities = [r.as_dict() for r in geo]

    # ---- Constants ----
    FIRST_NAMES_M = ['Aarav','Aditi','Amit','Anand','Anil','Arjun','Ashok','Bharat','Chandan','Deepak',
        'Gaurav','Girish','Gopal','Hari','Hemant','Jatin','Karan','Kartik','Lalit','Manoj',
        'Mohit','Mukesh','Neeraj','Nikhil','Pankaj','Pradeep','Rahul','Rajesh','Rakesh','Ramesh',
        'Ravi','Rohit','Sachin','Sandeep','Sanjay','Satish','Shiv','Sunil','Suresh','Tarun',
        'Umesh','Varun','Vijay','Vikram','Vinod','Vishal','Yash','Aditya','Ajay','Dhruv']
    FIRST_NAMES_F = ['Anita','Anjali','Asha','Deepa','Divya','Geeta','Isha','Jaya','Kavita','Lakshmi',
        'Meena','Neha','Nisha','Pallavi','Pooja','Priya','Radha','Rekha','Rita','Ritu',
        'Sapna','Sarita','Seema','Shanti','Shweta','Sita','Sneha','Sonia','Sunita','Swati',
        'Tanvi','Uma','Vandana','Vidya','Poonam','Mamta','Kajal','Jyoti','Hemlata','Gauri']
    LAST_NAMES = ['Sharma','Verma','Gupta','Singh','Kumar','Patel','Reddy','Nair','Menon','Joshi',
        'Tiwari','Mishra','Pandey','Yadav','Chauhan','Agarwal','Mehta','Shah','Desai','Rao',
        'Iyer','Pillai','Das','Bose','Ghosh','Mukherjee','Banerjee','Chatterjee','Srivastava','Dubey',
        'Thakur','Choudhary','Saxena','Bhatt','Kulkarni','Patil','Deshpande','Jain','Kapoor','Malhotra']
    OCCUPATIONS = ['Salaried','Business','Self-Employed','Professional','Retired','Student','Homemaker',
        'Farmer','Government','NRI']
    SEGMENTS = ['RETAIL','PREMIUM','HNI','NRI','SALARY','MSME']
    CHANNELS = ['BRANCH','ONLINE','MOBILE','DSA','REFERRAL']
    ACCOUNT_TYPES = ['SAVINGS','SAVINGS','SAVINGS','CURRENT','CURRENT','NRE','NRO','LOAN']

    N_CUSTOMERS = int(20000 * SF)
    N_ACCOUNTS = int(28000 * SF)

    # ---- CUSTOMERS ----
    cust_rows = []
    for i in range(N_CUSTOMERS):
        is_male = np.random.random() < 0.55
        fn = random.choice(FIRST_NAMES_M if is_male else FIRST_NAMES_F)
        ln = random.choice(LAST_NAMES)
        name = f"{fn} {ln}"
        loc = random.choice(cities)
        pan_chars = ''.join(random.choices(string.ascii_uppercase, k=5))
        pan_digits = ''.join(random.choices(string.digits, k=4))
        pan_last = random.choice(string.ascii_uppercase)
        pan = f"{pan_chars}{pan_digits}{pan_last}"
        dob = datetime(1955,1,1) + timedelta(days=np.random.randint(0, 22000))
        income_base = {'Salaried':500000,'Business':1200000,'Self-Employed':800000,
            'Professional':1000000,'Retired':400000,'Student':100000,'Homemaker':200000,
            'Farmer':300000,'Government':700000,'NRI':2000000}
        occ = random.choice(OCCUPATIONS)
        income = int(income_base[occ] * np.random.lognormal(0, 0.5))
        income = max(50000, min(income, 50000000))
        risk_p = np.random.random()
        risk = 'LOW' if risk_p < 0.7 else ('MEDIUM' if risk_p < 0.92 else 'HIGH')
        is_pep = bool(np.random.random() < 0.005)
        kyc_status = str(np.random.choice(['VERIFIED','VERIFIED','VERIFIED','PENDING','EXPIRED'], p=[0.7,0.1,0.05,0.1,0.05]))
        kyc_date = datetime(2023,1,1) + timedelta(days=np.random.randint(0,700))
        segment = random.choice(SEGMENTS)
        if income > 5000000:
            segment = 'HNI'
        elif occ == 'NRI':
            segment = 'NRI'
        cust_rows.append({
            'CUSTOMER_ID': f'CUST{i+1:06d}',
            'CUSTOMER_NAME': name,
            'PAN': pan,
            'DOB': dob.strftime('%Y-%m-%d'),
            'CITY': loc['CITY'],
            'STATE': loc['STATE_NAME'],
            'STATE_CODE': loc['STATE_CODE'],
            'REGION': loc['REGION'],
            'OCCUPATION': occ,
            'DECLARED_ANNUAL_INCOME': income,
            'KYC_STATUS': kyc_status,
            'KYC_LAST_UPDATED': kyc_date.strftime('%Y-%m-%d'),
            'RISK_CATEGORY': risk,
            'IS_PEP': is_pep,
            'ONBOARDING_CHANNEL': random.choice(CHANNELS),
            'SEGMENT': segment
        })

    session.create_dataframe(cust_rows).write.mode('overwrite').save_as_table('KAVACH_DB.RAW.CUSTOMERS')

    # ---- ACCOUNTS ----
    acct_rows = []
    cust_ids = [r['CUSTOMER_ID'] for r in cust_rows]
    branches = [f"BR{i:04d}" for i in range(1, 201)]
    acct_idx = 0
    for cid in cust_ids:
        n_accts = np.random.choice([1,1,1,2,2,3], p=[0.3,0.2,0.15,0.15,0.1,0.1])
        for _ in range(n_accts):
            if acct_idx >= N_ACCOUNTS:
                break
            acct_idx += 1
            atype = random.choice(ACCOUNT_TYPES)
            open_date = datetime(2018,1,1) + timedelta(days=np.random.randint(0, 2400))
            status_p = np.random.random()
            status = 'ACTIVE' if status_p < 0.85 else ('DORMANT' if status_p < 0.95 else 'CLOSED')
            bal = int(np.random.lognormal(10, 1.5))
            bal = max(100, min(bal, 50000000))
            acct_rows.append({
                'ACCOUNT_ID': f'ACC{acct_idx:07d}',
                'CUSTOMER_ID': cid,
                'ACCOUNT_TYPE': atype,
                'OPEN_DATE': open_date.strftime('%Y-%m-%d'),
                'BRANCH_CODE': random.choice(branches),
                'STATUS': status,
                'AVG_MONTHLY_BALANCE': bal
            })
        if acct_idx >= N_ACCOUNTS:
            break
    # fill remaining accounts to random customers
    while acct_idx < N_ACCOUNTS:
        acct_idx += 1
        cid = random.choice(cust_ids)
        atype = random.choice(ACCOUNT_TYPES)
        open_date = datetime(2018,1,1) + timedelta(days=np.random.randint(0, 2400))
        status = 'ACTIVE' if np.random.random() < 0.85 else 'DORMANT'
        bal = int(np.random.lognormal(10, 1.5))
        acct_rows.append({
            'ACCOUNT_ID': f'ACC{acct_idx:07d}',
            'CUSTOMER_ID': cid,
            'ACCOUNT_TYPE': atype,
            'OPEN_DATE': open_date.strftime('%Y-%m-%d'),
            'BRANCH_CODE': random.choice(branches),
            'STATUS': status,
            'AVG_MONTHLY_BALANCE': max(100, min(bal, 50000000))
        })

    session.create_dataframe(acct_rows).write.mode('overwrite').save_as_table('KAVACH_DB.RAW.ACCOUNTS')

    # ---- DEVICES ----
    N_DEVICES = int(15000 * SF)
    india_ips = [r.as_dict() for r in session.sql(
        "SELECT START_INT, END_INT, COUNTRY_CODE, CITY, REGION, ASN_NAME, IS_VPN, IS_HOSTING "
        "FROM KAVACH_DB.REF.IP_GEO WHERE COUNTRY_CODE = 'IN'"
    ).collect()]

    dev_rows = []
    device_types = ['ANDROID','ANDROID','ANDROID','IOS','IOS','DESKTOP','DESKTOP']
    os_map = {'ANDROID':'Android','IOS':'iOS','DESKTOP':str(np.random.choice(['Windows','macOS','Linux']))}
    active_acct_ids = [r['ACCOUNT_ID'] for r in acct_rows if r['STATUS'] == 'ACTIVE']

    for i in range(N_DEVICES):
        dtype = random.choice(device_types)
        ip_row = india_ips[np.random.randint(0, len(india_ips))]
        ip_int = np.random.randint(int(ip_row['START_INT']), int(ip_row['END_INT']))
        ip = f"{(ip_int >> 24) & 0xFF}.{(ip_int >> 16) & 0xFF}.{(ip_int >> 8) & 0xFF}.{ip_int & 0xFF}"
        dev_rows.append({
            'DEVICE_ID': f'DEV{i+1:06d}',
            'DEVICE_TYPE': dtype,
            'OS': os_map.get(dtype, 'Android'),
            'IP_ADDRESS': ip,
            'CITY': str(ip_row['CITY']),
            'COUNTRY_CODE': 'IN',
            'FIRST_SEEN': (datetime(2024,1,1) + timedelta(days=np.random.randint(0, 180))).strftime('%Y-%m-%d'),
            'ACCOUNT_ID': random.choice(active_acct_ids)
        })

    session.create_dataframe(dev_rows).write.mode('overwrite').save_as_table('KAVACH_DB.RAW.DEVICES')

    # ---- BENEFICIARIES ----
    N_BENE = int(40000 * SF)
    banks = ['HDFC','ICICI','SBI','AXIS','KOTAK','YES','PNB','BOB','CANARA','UNION','IDBI','FEDERAL','BANDHAN','RBL','IDFC']
    bene_rows = []
    for i in range(N_BENE):
        aid = random.choice(active_acct_ids)
        is_vpa = np.random.random() < 0.4
        bene_acct = f"{''.join(random.choices(string.digits, k=12))}" if not is_vpa else None
        bene_vpa = f"{''.join(random.choices(string.ascii_lowercase, k=6))}@{''.join(random.choices(['upi','paytm','ybl','oksbi','apl'], k=1))}" if is_vpa else None
        bene_rows.append({
            'BENEFICIARY_ID': f'BEN{i+1:06d}',
            'ACCOUNT_ID': aid,
            'BENEFICIARY_ACCOUNT': bene_acct,
            'BENEFICIARY_VPA': bene_vpa,
            'BENEFICIARY_BANK': random.choice(banks) if not is_vpa else None,
            'BENEFICIARY_NAME': f"{random.choice(FIRST_NAMES_M + FIRST_NAMES_F)} {random.choice(LAST_NAMES)}",
            'ADDED_AT': (datetime(2024,1,1) + timedelta(days=np.random.randint(0, 180))).strftime('%Y-%m-%d %H:%M:%S')
        })

    session.create_dataframe(bene_rows).write.mode('overwrite').save_as_table('KAVACH_DB.RAW.BENEFICIARIES')

    # ---- ANALYST_FEEDBACK (empty) ----
    session.sql("""
        CREATE OR REPLACE TABLE KAVACH_DB.RAW.ANALYST_FEEDBACK (
            FEEDBACK_ID STRING, ALERT_ID STRING, ANALYST_ID STRING,
            DECISION STRING, NOTES STRING, CREATED_AT TIMESTAMP_NTZ
        )
    """).collect()

    # ---- LOGINS (placeholder — will be populated with transactions) ----
    session.sql("""
        CREATE OR REPLACE TABLE KAVACH_DB.RAW.LOGINS (
            LOGIN_ID STRING, ACCOUNT_ID STRING, DEVICE_ID STRING,
            IP_ADDRESS STRING, LOGIN_TS TIMESTAMP_NTZ,
            CITY STRING, COUNTRY STRING, SUCCESS BOOLEAN
        )
    """).collect()

    return f"OK: {N_CUSTOMERS} customers, {N_ACCOUNTS} accounts, {N_DEVICES} devices, {N_BENE} beneficiaries"
$$;

-- =========================================================================
-- PROCEDURE 2: Generate transactions (bulk, vectorised)
-- =========================================================================
CREATE OR REPLACE PROCEDURE RAW.GENERATE_TRANSACTIONS(SCALE_FACTOR FLOAT, SEED INT)
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'numpy')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
import numpy as np
from datetime import datetime, timedelta
import random
import string

def run(session, scale_factor, seed):
    np.random.seed(seed + 100)
    random.seed(seed + 100)
    SF = float(scale_factor)

    N_TXN = int(1500000 * SF)
    BATCH_SIZE = 100000

    # Load accounts (to_pandas() unavailable in stored procs on this account — use collect())
    accts = [r.as_dict() for r in session.sql(
        "SELECT ACCOUNT_ID, CUSTOMER_ID, ACCOUNT_TYPE, STATUS FROM KAVACH_DB.RAW.ACCOUNTS WHERE STATUS = 'ACTIVE'"
    ).collect()]
    acct_ids = [r['ACCOUNT_ID'] for r in accts]
    acct_types = {r['ACCOUNT_ID']: r['ACCOUNT_TYPE'] for r in accts}

    # Load devices
    devs = [r.as_dict() for r in session.sql(
        "SELECT DEVICE_ID, IP_ADDRESS, ACCOUNT_ID FROM KAVACH_DB.RAW.DEVICES"
    ).collect()]
    dev_list = [r['DEVICE_ID'] for r in devs]
    dev_ips = {r['DEVICE_ID']: r['IP_ADDRESS'] for r in devs}


    # Constants
    CHANNELS = ['UPI','UPI','UPI','IMPS','IMPS','NEFT','NEFT','RTGS','CASH','CASH','CARD','CARD','SWIFT']
    DIRECTIONS = ['DEBIT','CREDIT']
    BANKS = ['HDFC','ICICI','SBI','AXIS','KOTAK','YES','PNB','BOB','CANARA','UNION','IDBI']
    MCC = ['GROCERY','FUEL','DINING','TRAVEL','ELECTRONICS','CLOTHING','MEDICAL','EDUCATION',
           'RENT','UTILITIES','INSURANCE','INVESTMENT','TRANSFER','SALARY','CASH_DEPOSIT',
           'CASH_WITHDRAWAL','ATM','ONLINE_SHOPPING','ENTERTAINMENT','SUBSCRIPTION']
    COUNTRIES_SWIFT = ['US','GB','AE','SG','HK','DE','FR','JP','AU','CA','NP','BD','LK']
    NARRATIONS = [
        'UPI txn', 'IMPS transfer', 'NEFT payment', 'salary credit', 'ATM withdrawal',
        'POS purchase', 'online shopping', 'EMI payment', 'rent payment', 'grocery store',
        'fuel station', 'restaurant bill', 'electricity bill', 'mobile recharge',
        'insurance premium', 'mutual fund SIP', 'FD interest credit', 'loan EMI',
        'cash deposit at branch', 'cheque deposit', 'RTGS high value', 'credit card payment',
        'paytm transfer', 'PhonePe payment', 'Google Pay', 'Amazon pay',
        'paise bheje', 'dukaan payment', 'kiraya', 'bijli bill',
        'school fees', 'hospital payment', 'medicine store', 'train ticket',
        'Swiggy order', 'Zomato food', 'Flipkart purchase', 'subscription renewal'
    ]

    START_DATE = datetime(2024, 4, 1)

    # Create table first
    session.sql("""
        CREATE OR REPLACE TABLE KAVACH_DB.RAW.TRANSACTIONS (
            TXN_ID STRING, ACCOUNT_ID STRING, TXN_TS TIMESTAMP_NTZ,
            AMOUNT_INR NUMBER(18,2), CHANNEL STRING, DIRECTION STRING,
            COUNTERPARTY STRING, COUNTERPARTY_BANK STRING, COUNTRY STRING,
            MERCHANT_CATEGORY STRING, NARRATION STRING,
            DEVICE_ID STRING, IP_ADDRESS STRING
        )
    """).collect()

    total_written = 0
    for batch_start in range(0, N_TXN, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, N_TXN)
        batch_n = batch_end - batch_start

        rows = []
        for i in range(batch_n):
            txn_idx = batch_start + i + 1
            aid = random.choice(acct_ids)
            channel = random.choice(CHANNELS)
            direction = random.choice(DIRECTIONS)

            # Amount distribution: mostly small, some large
            amt_p = np.random.random()
            if amt_p < 0.4:
                amount = float(round(np.random.uniform(50, 5000), 2))
            elif amt_p < 0.7:
                amount = float(round(np.random.uniform(5000, 50000), 2))
            elif amt_p < 0.9:
                amount = float(round(np.random.uniform(50000, 500000), 2))
            elif amt_p < 0.97:
                amount = float(round(np.random.uniform(500000, 2000000), 2))
            else:
                amount = float(round(np.random.uniform(2000000, 10000000), 2))

            if channel == 'RTGS':
                amount = max(amount, 200000.0)
            elif channel == 'SWIFT':
                amount = max(amount, 100000.0)

            ts = START_DATE + timedelta(
                days=np.random.randint(0, 180),
                hours=np.random.randint(6, 23),
                minutes=np.random.randint(0, 60),
                seconds=np.random.randint(0, 60)
            )

            country = 'IN'
            if channel == 'SWIFT':
                country = random.choice(COUNTRIES_SWIFT)

            cp_name = f"{''.join(random.choices(string.ascii_uppercase, k=1))}{''.join(random.choices(string.ascii_lowercase, k=5))}"
            cp_bank = random.choice(BANKS)

            device_id = random.choice(dev_list) if channel in ('UPI','IMPS','CARD') else None
            ip = dev_ips.get(device_id) if device_id else None

            narration = random.choice(NARRATIONS)

            rows.append({
                'TXN_ID': f'TXN{txn_idx:08d}',
                'ACCOUNT_ID': aid,
                'TXN_TS': ts.strftime('%Y-%m-%d %H:%M:%S'),
                'AMOUNT_INR': amount,
                'CHANNEL': channel,
                'DIRECTION': direction,
                'COUNTERPARTY': cp_name,
                'COUNTERPARTY_BANK': cp_bank,
                'COUNTRY': country,
                'MERCHANT_CATEGORY': random.choice(MCC),
                'NARRATION': narration,
                'DEVICE_ID': device_id,
                'IP_ADDRESS': ip
            })

        session.create_dataframe(rows).write.mode('append').save_as_table('KAVACH_DB.RAW.TRANSACTIONS')
        total_written += batch_n

    return f"OK: {total_written} transactions generated"
$$;

-- =========================================================================
-- PROCEDURE 3: Inject fraud typologies and build ground truth
-- =========================================================================
CREATE OR REPLACE PROCEDURE RAW.INJECT_FRAUD_PATTERNS(SCALE_FACTOR FLOAT, SEED INT)
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'numpy')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
import numpy as np
from datetime import datetime, timedelta
import random
import string

def run(session, scale_factor, seed):
    np.random.seed(seed + 200)
    random.seed(seed + 200)
    SF = float(scale_factor)

    session.sql("""
        CREATE OR REPLACE TABLE KAVACH_DB.RAW.GROUND_TRUTH (
            RECORD_ID STRING, ENTITY_TYPE STRING, ENTITY_ID STRING,
            TXN_IDS VARIANT, TYPOLOGY STRING, DESCRIPTION STRING,
            INJECTED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
        )
    """).collect()

    accts = [r.as_dict() for r in session.sql(
        "SELECT ACCOUNT_ID, CUSTOMER_ID, STATUS FROM KAVACH_DB.RAW.ACCOUNTS WHERE STATUS='ACTIVE'"
    ).collect()]
    active_ids = [r['ACCOUNT_ID'] for r in accts]
    acct_to_cust = {r['ACCOUNT_ID']: r['CUSTOMER_ID'] for r in accts}

    devs = [r.as_dict() for r in session.sql(
        "SELECT DEVICE_ID, IP_ADDRESS FROM KAVACH_DB.RAW.DEVICES LIMIT 100"
    ).collect()]
    dev_list = [r['DEVICE_ID'] for r in devs]
    dev_ips = {r['DEVICE_ID']: r['IP_ADDRESS'] for r in devs}

    foreign_ips = ['104.238.45.67','185.100.85.12','198.51.100.55','185.220.101.33']
    high_risk_countries = ['IR','KP','SY','MM','AF','NG','SO']

    gt_rows = []
    fraud_txns = []
    txn_counter = 2000000  # start above normal range

    START = datetime(2024, 4, 1)

    # ---- 1. STRUCTURING: repeated deposits just under thresholds ----
    n_structuring = int(20 * SF)
    struct_accts = random.sample(active_ids, min(n_structuring, len(active_ids)))
    for aid in struct_accts:
        txn_ids = []
        n_deposits = random.randint(8, 20)
        for j in range(n_deposits):
            txn_counter += 1
            tid = f'TXN{txn_counter:08d}'
            amt = round(random.uniform(940000, 999000), 2) if random.random() < 0.6 else round(random.uniform(48000, 49900), 2)
            ts = START + timedelta(days=random.randint(0, 160), hours=random.randint(9, 17))
            fraud_txns.append({
                'TXN_ID': tid, 'ACCOUNT_ID': aid, 'TXN_TS': ts.strftime('%Y-%m-%d %H:%M:%S'),
                'AMOUNT_INR': amt, 'CHANNEL': 'CASH', 'DIRECTION': 'CREDIT',
                'COUNTERPARTY': 'SELF', 'COUNTERPARTY_BANK': 'SELF', 'COUNTRY': 'IN',
                'MERCHANT_CATEGORY': 'CASH_DEPOSIT', 'NARRATION': 'cash deposit at branch',
                'DEVICE_ID': None, 'IP_ADDRESS': None
            })
            txn_ids.append(tid)
        gt_rows.append({
            'RECORD_ID': f'GT-STR-{aid}', 'ENTITY_TYPE': 'ACCOUNT', 'ENTITY_ID': aid,
            'TXN_IDS': str(txn_ids), 'TYPOLOGY': 'STRUCTURING',
            'DESCRIPTION': f'{n_deposits} cash deposits just under CTR thresholds'
        })

    # ---- 2. MULE RING: shared devices/IPs, rapid in→out ----
    n_rings = int(3 * SF)
    for ring_idx in range(n_rings):
        ring_size = random.randint(8, 15)
        ring_accts = random.sample(active_ids, min(ring_size, len(active_ids)))
        shared_devs = random.sample(dev_list, min(2, len(dev_list)))
        shared_ip = dev_ips.get(shared_devs[0], '104.238.45.67')
        ring_txn_ids = []

        # A real mule ring is directional: victim money lands on a collector,
        # the collector fans it out to mules, each mule keeps a cut and forwards
        # the rest to the exit, and the exit takes it out of the bank. Every
        # internal hop is written as a matching pair (DEBIT on the sender and
        # CREDIT on the receiver, same amount and timestamp) so both sides of
        # the transfer exist in the ledger, as they would in a real bank.
        collector = ring_accts[0]
        exit_acct = ring_accts[-1]
        mules = ring_accts[1:-1] or [ring_accts[0]]
        ring_start = START + timedelta(days=random.randint(30, 150), hours=random.randint(9, 15))

        def ring_txn(aid, ts, amt, direction, counterparty, cp_bank, category, narration, channel='IMPS'):
            """Append one leg and return its id."""
            nonlocal txn_counter
            txn_counter += 1
            tid = f'TXN{txn_counter:08d}'
            fraud_txns.append({
                'TXN_ID': tid, 'ACCOUNT_ID': aid, 'TXN_TS': ts.strftime('%Y-%m-%d %H:%M:%S'),
                'AMOUNT_INR': round(amt, 2), 'CHANNEL': channel, 'DIRECTION': direction,
                'COUNTERPARTY': counterparty, 'COUNTERPARTY_BANK': cp_bank,
                'COUNTRY': 'IN', 'MERCHANT_CATEGORY': category,
                'NARRATION': narration,
                'DEVICE_ID': random.choice(shared_devs), 'IP_ADDRESS': shared_ip
            })
            ring_txn_ids.append(tid)
            return tid

        def internal_transfer(src, dst, ts, amt):
            """One hop inside the ring, written as a matching sent/received pair."""
            ring_txn(src, ts, amt, 'DEBIT', dst, 'KAVACH', 'TRANSFER', 'IMPS payment')
            ring_txn(dst, ts, amt, 'CREDIT', src, 'KAVACH', 'TRANSFER', 'IMPS transfer')

        # Victims outside the bank pay into the collector. No matching internal
        # row: the far side of these is an account at another bank.
        collected = 0.0
        ts = ring_start
        for v in range(random.randint(3, 6)):
            amt = round(random.uniform(150000, 900000), 2)
            collected += amt
            ring_txn(collector, ts, amt, 'CREDIT', f'VICTIM{random.randint(1000, 9999)}',
                     random.choice(['HDFC', 'ICICI', 'SBI', 'AXIS']), 'TRANSFER',
                     'IMPS inward credit')
            ts += timedelta(minutes=random.randint(3, 20))

        # Collector fans the money out across the mules, keeping a small cut.
        collector_keeps = round(collected * random.uniform(0.01, 0.03), 2)
        to_fan_out = collected - collector_keeps
        shares = [random.uniform(0.6, 1.4) for _ in mules]
        total_share = sum(shares)
        reached_exit = 0.0
        for mule, share in zip(mules, shares):
            leg = round(to_fan_out * share / total_share, 2)
            if leg < 1000:
                continue
            ts += timedelta(minutes=random.randint(2, 15))
            internal_transfer(collector, mule, ts, leg)
            # The mule keeps 2-5% and forwards the rest to the exit account,
            # usually within the hour - this is the rapid pass-through signal.
            forwarded = round(leg * random.uniform(0.95, 0.98), 2)
            fwd_ts = ts + timedelta(minutes=random.randint(5, 45))
            internal_transfer(mule, exit_acct, fwd_ts, forwarded)
            reached_exit += forwarded

        # The exit account drains the money out of the bank and sends nothing
        # to other ring members.
        out_ts = ts + timedelta(hours=random.randint(1, 6))
        remaining = reached_exit
        while remaining > 50000:
            cut = round(min(remaining, random.uniform(200000, 800000)), 2)
            method = random.choice(['CASH', 'SWIFT', 'CRYPTO'])
            if method == 'CASH':
                ring_txn(exit_acct, out_ts, cut, 'DEBIT', 'SELF', 'SELF',
                         'CASH_WITHDRAWAL', 'cash withdrawal at ATM', channel='ATM')
            elif method == 'SWIFT':
                ring_txn(exit_acct, out_ts, cut, 'DEBIT', f'OFFSHORE{random.randint(100, 999)}',
                         'FOREIGN', 'TRANSFER', 'SWIFT outward remittance', channel='SWIFT')
            else:
                ring_txn(exit_acct, out_ts, cut, 'DEBIT', f'CRYPTOEX{random.randint(10, 99)}',
                         'OTHER', 'CRYPTO', 'transfer to crypto exchange', channel='IMPS')
            remaining -= cut
            out_ts += timedelta(minutes=random.randint(20, 180))

        role_of = {collector: 'collector', exit_acct: 'exit'}
        for aid in ring_accts:
            role = role_of.get(aid, 'mule')
            gt_rows.append({
                'RECORD_ID': f'GT-MULE-R{ring_idx}-{aid}', 'ENTITY_TYPE': 'ACCOUNT', 'ENTITY_ID': aid,
                'TXN_IDS': str([t for t in ring_txn_ids]), 'TYPOLOGY': 'MULE_RING',
                'DESCRIPTION': f'Ring {ring_idx+1} {role}: {ring_size} accounts sharing '
                               f'{len(shared_devs)} devices, ~{round(collected/100000, 1)}L collected from victims'
            })

    # ---- 3. DORMANT REACTIVATION ----
    dormant_accts = [r.as_dict() for r in session.sql(
        "SELECT ACCOUNT_ID FROM KAVACH_DB.RAW.ACCOUNTS WHERE STATUS='DORMANT' LIMIT 30"
    ).collect()]
    n_dormant = min(int(25 * SF), len(dormant_accts))
    for idx in range(n_dormant):
        aid = dormant_accts[idx]['ACCOUNT_ID']
        txn_counter += 1
        tid = f'TXN{txn_counter:08d}'
        ts = START + timedelta(days=random.randint(100, 170), hours=random.randint(10, 16))
        amt = round(random.uniform(500000, 5000000), 2)
        fraud_txns.append({
            'TXN_ID': tid, 'ACCOUNT_ID': aid, 'TXN_TS': ts.strftime('%Y-%m-%d %H:%M:%S'),
            'AMOUNT_INR': amt, 'CHANNEL': 'NEFT', 'DIRECTION': 'DEBIT',
            'COUNTERPARTY': 'Unknown Entity', 'COUNTERPARTY_BANK': 'FOREIGN',
            'COUNTRY': 'AE', 'MERCHANT_CATEGORY': 'TRANSFER',
            'NARRATION': 'NEFT high value transfer', 'DEVICE_ID': None, 'IP_ADDRESS': None
        })
        gt_rows.append({
            'RECORD_ID': f'GT-DORM-{aid}', 'ENTITY_TYPE': 'ACCOUNT', 'ENTITY_ID': aid,
            'TXN_IDS': str([tid]), 'TYPOLOGY': 'DORMANT_REACTIVATION',
            'DESCRIPTION': f'Dormant account reactivated with large outward transfer of {amt}'
        })

    # ---- 4. RAPID PASS-THROUGH ----
    n_passthru = int(30 * SF)
    pt_accts = random.sample(active_ids, min(n_passthru, len(active_ids)))
    for aid in pt_accts:
        txn_ids = []
        for _ in range(random.randint(5, 15)):
            txn_counter += 1
            tid_in = f'TXN{txn_counter:08d}'
            txn_counter += 1
            tid_out = f'TXN{txn_counter:08d}'
            base_ts = START + timedelta(days=random.randint(10, 170))
            amt = round(random.uniform(100000, 1000000), 2)
            fraud_txns.append({
                'TXN_ID': tid_in, 'ACCOUNT_ID': aid, 'TXN_TS': base_ts.strftime('%Y-%m-%d %H:%M:%S'),
                'AMOUNT_INR': amt, 'CHANNEL': 'IMPS', 'DIRECTION': 'CREDIT',
                'COUNTERPARTY': 'Sender', 'COUNTERPARTY_BANK': random.choice(['HDFC','SBI','ICICI']),
                'COUNTRY': 'IN', 'MERCHANT_CATEGORY': 'TRANSFER',
                'NARRATION': 'IMPS credit received', 'DEVICE_ID': None, 'IP_ADDRESS': None
            })
            out_ts = base_ts + timedelta(hours=random.randint(1, 20))
            fraud_txns.append({
                'TXN_ID': tid_out, 'ACCOUNT_ID': aid, 'TXN_TS': out_ts.strftime('%Y-%m-%d %H:%M:%S'),
                'AMOUNT_INR': round(amt * random.uniform(0.95, 1.0), 2), 'CHANNEL': 'IMPS', 'DIRECTION': 'DEBIT',
                'COUNTERPARTY': 'Receiver', 'COUNTERPARTY_BANK': random.choice(['AXIS','KOTAK','YES']),
                'COUNTRY': 'IN', 'MERCHANT_CATEGORY': 'TRANSFER',
                'NARRATION': 'IMPS payment sent', 'DEVICE_ID': None, 'IP_ADDRESS': None
            })
            txn_ids.extend([tid_in, tid_out])
        gt_rows.append({
            'RECORD_ID': f'GT-PT-{aid}', 'ENTITY_TYPE': 'ACCOUNT', 'ENTITY_ID': aid,
            'TXN_IDS': str(txn_ids), 'TYPOLOGY': 'RAPID_PASSTHROUGH',
            'DESCRIPTION': 'Funds in ≈ out within 24h, near-zero balance'
        })

    # ---- 5. INCOME MISMATCH ----
    n_income = int(40 * SF)
    low_income = [r.as_dict() for r in session.sql(
        "SELECT c.CUSTOMER_ID, a.ACCOUNT_ID FROM KAVACH_DB.RAW.CUSTOMERS c JOIN KAVACH_DB.RAW.ACCOUNTS a "
        "ON c.CUSTOMER_ID = a.CUSTOMER_ID WHERE c.DECLARED_ANNUAL_INCOME < 500000 AND a.STATUS = 'ACTIVE' LIMIT 50"
    ).collect()]
    for idx in range(min(n_income, len(low_income))):
        row = low_income[idx]
        aid = row['ACCOUNT_ID']
        cid = row['CUSTOMER_ID']
        txn_ids = []
        for _ in range(random.randint(20, 50)):
            txn_counter += 1
            tid = f'TXN{txn_counter:08d}'
            ts = START + timedelta(days=random.randint(0, 170), hours=random.randint(8, 22))
            amt = round(random.uniform(100000, 500000), 2)
            fraud_txns.append({
                'TXN_ID': tid, 'ACCOUNT_ID': aid, 'TXN_TS': ts.strftime('%Y-%m-%d %H:%M:%S'),
                'AMOUNT_INR': amt, 'CHANNEL': random.choice(['UPI','IMPS','NEFT']),
                'DIRECTION': random.choice(['CREDIT','DEBIT']),
                'COUNTERPARTY': 'Various', 'COUNTERPARTY_BANK': random.choice(['HDFC','SBI','ICICI']),
                'COUNTRY': 'IN', 'MERCHANT_CATEGORY': random.choice(['TRANSFER','ONLINE_SHOPPING','INVESTMENT']),
                'NARRATION': 'high value transaction', 'DEVICE_ID': None, 'IP_ADDRESS': None
            })
            txn_ids.append(tid)
        gt_rows.append({
            'RECORD_ID': f'GT-INC-{cid}', 'ENTITY_TYPE': 'CUSTOMER', 'ENTITY_ID': cid,
            'TXN_IDS': str(txn_ids), 'TYPOLOGY': 'INCOME_MISMATCH',
            'DESCRIPTION': f'Turnover >10x declared income for customer {cid}'
        })

    # ---- 6. ROUND-TRIPPING ----
    n_rt = int(6 * SF)
    for rt_idx in range(n_rt):
        chain_len = random.randint(3, 4)
        chain_accts = random.sample(active_ids, chain_len + 1)
        chain_accts.append(chain_accts[0])  # return to origin
        amt = round(random.uniform(200000, 2000000), 2)
        txn_ids = []
        base_ts = START + timedelta(days=random.randint(20, 150))
        for hop in range(len(chain_accts) - 1):
            ts = base_ts + timedelta(hours=hop * random.randint(2, 8))
            hop_amt = round(amt * (1 - hop * 0.01), 2)
            # Both sides of the hop: the sender's payment and the receiver's
            # credit. Writing only the debit leg left every account in the
            # chain showing nothing received.
            for direction, counterparty, narration in (
                ('DEBIT', chain_accts[hop + 1], 'NEFT payment'),
                ('CREDIT', chain_accts[hop], 'NEFT inward credit'),
            ):
                txn_counter += 1
                tid = f'TXN{txn_counter:08d}'
                holder = chain_accts[hop] if direction == 'DEBIT' else chain_accts[hop + 1]
                fraud_txns.append({
                    'TXN_ID': tid, 'ACCOUNT_ID': holder, 'TXN_TS': ts.strftime('%Y-%m-%d %H:%M:%S'),
                    'AMOUNT_INR': hop_amt,
                    'CHANNEL': 'NEFT', 'DIRECTION': direction,
                    'COUNTERPARTY': counterparty, 'COUNTERPARTY_BANK': 'KAVACH',
                    'COUNTRY': 'IN', 'MERCHANT_CATEGORY': 'TRANSFER',
                    'NARRATION': narration, 'DEVICE_ID': None, 'IP_ADDRESS': None
                })
                txn_ids.append(tid)
        for aid in set(chain_accts):
            gt_rows.append({
                'RECORD_ID': f'GT-RT-{rt_idx}-{aid}', 'ENTITY_TYPE': 'ACCOUNT', 'ENTITY_ID': aid,
                'TXN_IDS': str(txn_ids), 'TYPOLOGY': 'ROUND_TRIPPING',
                'DESCRIPTION': f'Round-trip chain of {chain_len} hops returning to origin'
            })

    # ---- 7. HIGH-RISK SWIFT ----
    n_swift = int(20 * SF)
    swift_accts = random.sample(active_ids, min(n_swift, len(active_ids)))
    for aid in swift_accts:
        txn_counter += 1
        tid = f'TXN{txn_counter:08d}'
        ts = START + timedelta(days=random.randint(0, 170), hours=random.randint(10, 16))
        country = random.choice(high_risk_countries)
        amt = round(random.uniform(500000, 10000000), 2)
        fraud_txns.append({
            'TXN_ID': tid, 'ACCOUNT_ID': aid, 'TXN_TS': ts.strftime('%Y-%m-%d %H:%M:%S'),
            'AMOUNT_INR': amt, 'CHANNEL': 'SWIFT', 'DIRECTION': random.choice(['DEBIT','CREDIT']),
            'COUNTERPARTY': f'Entity-{country}', 'COUNTERPARTY_BANK': f'{country}_BANK',
            'COUNTRY': country, 'MERCHANT_CATEGORY': 'TRANSFER',
            'NARRATION': f'SWIFT transfer {country}', 'DEVICE_ID': None, 'IP_ADDRESS': None
        })
        gt_rows.append({
            'RECORD_ID': f'GT-SWIFT-{aid}', 'ENTITY_TYPE': 'ACCOUNT', 'ENTITY_ID': aid,
            'TXN_IDS': str([tid]), 'TYPOLOGY': 'HIGH_RISK_SWIFT',
            'DESCRIPTION': f'SWIFT transfer to/from high-risk country {country}'
        })

    # ---- 8. ACCOUNT TAKEOVER ----
    n_ato = int(12 * SF)
    ato_accts = random.sample(active_ids, min(n_ato, len(active_ids)))
    for aid in ato_accts:
        txn_ids = []
        ts = START + timedelta(days=random.randint(60, 170), hours=random.randint(1, 5))
        # New device login
        txn_counter += 1
        tid = f'TXN{txn_counter:08d}'
        amt = round(random.uniform(500000, 2500000), 2)
        fraud_txns.append({
            'TXN_ID': tid, 'ACCOUNT_ID': aid, 'TXN_TS': (ts + timedelta(minutes=45)).strftime('%Y-%m-%d %H:%M:%S'),
            'AMOUNT_INR': amt, 'CHANNEL': 'IMPS', 'DIRECTION': 'DEBIT',
            'COUNTERPARTY': 'NewBeneficiary', 'COUNTERPARTY_BANK': 'UNKNOWN',
            'COUNTRY': 'IN', 'MERCHANT_CATEGORY': 'TRANSFER',
            'NARRATION': 'urgent IMPS transfer', 'DEVICE_ID': random.choice(dev_list),
            'IP_ADDRESS': random.choice(foreign_ips)
        })
        txn_ids.append(tid)
        gt_rows.append({
            'RECORD_ID': f'GT-ATO-{aid}', 'ENTITY_TYPE': 'ACCOUNT', 'ENTITY_ID': aid,
            'TXN_IDS': str(txn_ids), 'TYPOLOGY': 'ACCOUNT_TAKEOVER',
            'DESCRIPTION': 'New device + new beneficiary + max-limit transfer within 1 hour'
        })

    # ---- 9. PEP UNUSUAL CASH ----
    pep_custs = [r.as_dict() for r in session.sql(
        "SELECT c.CUSTOMER_ID, a.ACCOUNT_ID FROM KAVACH_DB.RAW.CUSTOMERS c JOIN KAVACH_DB.RAW.ACCOUNTS a "
        "ON c.CUSTOMER_ID = a.CUSTOMER_ID WHERE c.IS_PEP = TRUE AND a.STATUS = 'ACTIVE' LIMIT 12"
    ).collect()]
    n_pep = min(int(10 * SF), len(pep_custs))
    for idx in range(n_pep):
        row = pep_custs[idx]
        aid = row['ACCOUNT_ID']
        cid = row['CUSTOMER_ID']
        txn_ids = []
        for _ in range(random.randint(5, 15)):
            txn_counter += 1
            tid = f'TXN{txn_counter:08d}'
            ts = START + timedelta(days=random.randint(0, 170), hours=random.randint(10, 17))
            amt = round(random.uniform(500000, 3000000), 2)
            fraud_txns.append({
                'TXN_ID': tid, 'ACCOUNT_ID': aid, 'TXN_TS': ts.strftime('%Y-%m-%d %H:%M:%S'),
                'AMOUNT_INR': amt, 'CHANNEL': 'CASH', 'DIRECTION': random.choice(['CREDIT','DEBIT']),
                'COUNTERPARTY': 'SELF', 'COUNTERPARTY_BANK': 'SELF',
                'COUNTRY': 'IN', 'MERCHANT_CATEGORY': random.choice(['CASH_DEPOSIT','CASH_WITHDRAWAL']),
                'NARRATION': 'cash transaction at branch', 'DEVICE_ID': None, 'IP_ADDRESS': None
            })
            txn_ids.append(tid)
        gt_rows.append({
            'RECORD_ID': f'GT-PEP-{cid}', 'ENTITY_TYPE': 'CUSTOMER', 'ENTITY_ID': cid,
            'TXN_IDS': str(txn_ids), 'TYPOLOGY': 'PEP_UNUSUAL_CASH',
            'DESCRIPTION': f'PEP with unusual high-value cash activity'
        })

    # ---- Write fraud transactions ----
    if fraud_txns:
        session.create_dataframe(fraud_txns).write.mode('append').save_as_table('KAVACH_DB.RAW.TRANSACTIONS')

    # ---- Write ground truth ----
    if gt_rows:
        session.create_dataframe(gt_rows).write.mode('overwrite').save_as_table('KAVACH_DB.RAW.GROUND_TRUTH')

    return f"OK: {len(fraud_txns)} fraud transactions, {len(gt_rows)} ground truth records across 9 typologies"
$$;

-- =========================================================================
-- PROCEDURE 4: Orchestrator
-- =========================================================================
CREATE OR REPLACE PROCEDURE RAW.GENERATE_SYNTHETIC_DATA(SCALE_FACTOR FLOAT DEFAULT 1.0, SEED INT DEFAULT 42)
RETURNS STRING
LANGUAGE SQL
EXECUTE AS CALLER
AS
BEGIN
    LET result1 STRING;
    LET result2 STRING;
    LET result3 STRING;
    CALL RAW.GENERATE_BASE_ENTITIES(:SCALE_FACTOR, :SEED) INTO :result1;
    CALL RAW.GENERATE_TRANSACTIONS(:SCALE_FACTOR, :SEED) INTO :result2;
    CALL RAW.INJECT_FRAUD_PATTERNS(:SCALE_FACTOR, :SEED) INTO :result3;
    RETURN :result1 || ' | ' || :result2 || ' | ' || :result3;
END;

-- =========================================================================
-- Generate logins from device + transaction data
-- =========================================================================
CREATE OR REPLACE PROCEDURE RAW.GENERATE_LOGINS(SEED INT DEFAULT 42)
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'numpy')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
import numpy as np
from datetime import timedelta
import random

def run(session, seed):
    np.random.seed(seed + 300)
    random.seed(seed + 300)

    devs = [r.as_dict() for r in session.sql("""
        SELECT d.DEVICE_ID, d.ACCOUNT_ID, d.IP_ADDRESS, d.CITY, d.COUNTRY_CODE
        FROM KAVACH_DB.RAW.DEVICES d
    """).collect()]

    rows = []
    for dev in devs:
        n_logins = np.random.randint(5, 20)
        for _ in range(n_logins):
            from datetime import datetime
            ts = datetime(2024, 4, 1) + timedelta(
                days=np.random.randint(0, 180),
                hours=np.random.randint(6, 23),
                minutes=np.random.randint(0, 60)
            )
            rows.append({
                'LOGIN_ID': f'LOG{len(rows)+1:08d}',
                'ACCOUNT_ID': dev['ACCOUNT_ID'],
                'DEVICE_ID': dev['DEVICE_ID'],
                'IP_ADDRESS': dev['IP_ADDRESS'],
                'LOGIN_TS': ts.strftime('%Y-%m-%d %H:%M:%S'),
                'CITY': dev['CITY'],
                'COUNTRY': dev['COUNTRY_CODE'],
                'SUCCESS': bool(np.random.random() > 0.05)
            })

    session.create_dataframe(rows).write.mode('overwrite').save_as_table('KAVACH_DB.RAW.LOGINS')
    return f"OK: {len(rows)} logins generated"
$$;
