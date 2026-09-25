# DATASETS — KAVACH Project

## Snowflake Marketplace Listings (Mounted)

| Listing | Global Name | Database Name | Provider | Type | Terms |
|---------|-------------|---------------|----------|------|-------|
| Snowflake Public Data (Free) | `GZTSZ290BV255` | `SNOWFLAKE_PUBLIC_DATA_FREE` | Snowflake | Share (Free) | [Marketplace](https://app.snowflake.com/marketplace/listing/GZTSZ290BV255) |
| IPinfo Lite | `GZSTZSHKQ55S` | `IPINFO_LITE` | IPinfo | Share (Free) | [Marketplace](https://app.snowflake.com/marketplace/listing/GZSTZSHKQ55S) |
| IP2Location LITE IP-COUNTRY | `GZTSZ3VACRL` | `IP2LOCATION_LITE` | IP2Location | Share (Free) | [Marketplace](https://app.snowflake.com/marketplace/listing/GZTSZ3VACRL) |
| Country Dimension | `GZTSZ25YL0A` | `COUNTRY_DIMENSION` | Douro Data | Native App (Free) | [Marketplace](https://app.snowflake.com/marketplace/listing/GZTSZ25YL0A) |

### Usage in KAVACH
- **FX Rates**: `KAVACH_DB.REF.FX_RATES` — Secure view over `SNOWFLAKE_PUBLIC_DATA_FREE.PUBLIC_DATA_FREE.FX_RATES_TIMESERIES`, filtered to INR currency pairs from 2024+. Used to convert SWIFT/foreign-currency transaction amounts to INR.
- **IP Geolocation**: `KAVACH_DB.REF.IP_GEO_IPINFO` — Secure view over `IPINFO_LITE.PUBLIC.LITE`. 35M+ IP ranges with country, ASN, and AS name. Used for geo lookups, VPN detection, and impossible-travel checks.
- **Country Dimension**: `KAVACH_DB.REF.COUNTRY_DIM` — Secure view over `COUNTRY_DIMENSION.DOURO_DATA.COUNTRY_DIMENSION`. 249 countries with ISO codes, official names, and flag emoji. Enriches COUNTRY_RISK with official names for display.

## Synthetic Reference Data

| Table | Rows | Description | Source Methodology |
|-------|------|-------------|-------------------|
| `REF.GEO_INDIA` | 79 | Indian states, cities, regions with coordinates and tier classification | Real place names; population tiers based on Census 2011 categories |
| `REF.IP_GEO` | 30 | Indian ISP + foreign IP ranges for data generation | Modeled on real ASN allocations (Jio, Airtel, BSNL, Vodafone) with synthetic ranges |
| `REF.WATCHLIST` | 27 | Synthetic sanctions/PEP watchlist (OFAC/UN/FATF style) | Entirely synthetic names. No free sanctions listing available in this region. |
| `REF.COUNTRY_RISK` | 42 | Country risk levels (LOW/MEDIUM/HIGH/PROHIBITED) | Based on public FATF grey/black list status + Transparency International CPI methodology |

## Synthetic Bank Data

All data is **SYNTHETIC** and clearly labelled as such. No real customer data is used.

| Table | Schema | Rows | Description |
|-------|--------|------|-------------|
| CUSTOMERS | RAW/CORE | 20,000 | Indian names, PAN (valid format), demographics, KYC status, PEP flag |
| ACCOUNTS | RAW/CORE | 28,000 | SAVINGS/CURRENT/NRE/NRO/LOAN, branch codes, status, balances |
| DEVICES | RAW/CORE | 15,000 | Device fingerprints with IPs sampled from REF.IP_GEO |
| LOGINS | RAW/CORE | ~188,000 | Login events with device/IP, geo, success flag |
| BENEFICIARIES | RAW/CORE | 40,000 | Account-to-beneficiary mappings (bank accounts + UPI VPAs) |
| TRANSACTIONS | RAW/CORE | ~1,502,000 | 180 days of transactions across UPI/IMPS/NEFT/RTGS/CASH/CARD/SWIFT |
| ANALYST_FEEDBACK | RAW | 0 | Empty — populated by the app during use |
| GROUND_TRUTH | RAW | ~213 | Labelled fraud records for measuring precision/recall |

### Fraud Typologies Injected (~0.5-1% fraud rate)

| # | Typology | Records | Description |
|---|----------|---------|-------------|
| 1 | STRUCTURING | ~20 accounts | Repeated cash deposits just under Rs. 10L / Rs. 50K thresholds |
| 2 | MULE_RING | ~3 rings (8-15 accounts each) | Shared devices/IPs, funds in→out within 30 min |
| 3 | DORMANT_REACTIVATION | ~25 accounts | No activity 180+ days then large outward transfer |
| 4 | RAPID_PASSTHROUGH | ~30 accounts | In ≈ out within 24h, near-zero balance |
| 5 | INCOME_MISMATCH | ~40 customers | Turnover > 10x declared income |
| 6 | ROUND_TRIPPING | ~6 chains (3-4 hops) | Funds return to origin via intermediate accounts |
| 7 | HIGH_RISK_SWIFT | ~20 accounts | SWIFT transfers to/from FATF grey/black list countries |
| 8 | ACCOUNT_TAKEOVER | ~12 accounts | New device + new beneficiary + max-limit transfer within 1 hour |
| 9 | PEP_UNUSUAL_CASH | ~10 PEP customers | PEPs with >Rs. 5L cash activity |

### Reproducibility
- Fixed random seed: `42` (configurable)
- Scale factor: `1.0` (configurable — 0.1 for quick testing)
- Procedures: `CALL KAVACH_DB.RAW.GENERATE_SYNTHETIC_DATA(1.0, 42)` regenerates all data

## Regulatory Circulars (Synthetic PDFs)

8 synthetic circulars stored at `@KAVACH_DB.RAW.REG_STAGE`:

| Ref | Title | Maps to Typology | Notes |
|-----|-------|------------------|-------|
| KAVACH/2024/01 | Cash Transaction Reporting (CTR) | Structuring | Original CTR thresholds |
| KAVACH/2024/02 | KYC Norms and CDD | PEP, Income Mismatch | EDD requirements |
| KAVACH/2024/03 | Wire Transfer Monitoring | High-risk SWIFT, Pass-through | **Conflicts** with 2024/06 on layering definition |
| KAVACH/2024/04 | Mule Account Detection | Mule Ring | Device/IP sharing patterns |
| KAVACH/2024/05 | Dormant Account Reactivation | Dormant Reactivation | Reactivation controls |
| KAVACH/2024/06 | Round-Tripping and Layering | Round-tripping | **Conflicts** with 2024/03 (different hop/time thresholds) |
| KAVACH/2024/07 | Digital Channel Fraud Prevention | Account Takeover | ATO indicators |
| KAVACH/2025/01 | **Amendment** to 2024/01 | Structuring (revised) | Raises CTR threshold from Rs. 10L to Rs. 15L (Time Machine feature) |

All circulars are marked **"SYNTHETIC — FOR DEMO ONLY"** and do not represent actual regulatory guidance.
