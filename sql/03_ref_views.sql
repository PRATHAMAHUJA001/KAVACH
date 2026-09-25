-- =============================================================================
-- KAVACH Phase 2A: Reference Data — REF schema, secure views, synthetic tables
-- =============================================================================
-- Prerequisites: Marketplace listings installed as:
--   SNOWFLAKE_PUBLIC_DATA_FREE (GZTSZ290BV255)
--   IPINFO_LITE              (GZSTZSHKQ55S)   — if available
--   IP2LOCATION_LITE         (GZTSZ3VACRL)    — if available
-- =============================================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE KAVACH_DB;
USE WAREHOUSE KAVACH_WH;

-- =========================================================================
-- 1. REF Schema
-- =========================================================================
CREATE SCHEMA IF NOT EXISTS REF COMMENT = 'Reference data — secure views over Marketplace + synthetic';

-- Grant REF read access to all roles
GRANT USAGE ON SCHEMA REF TO ROLE KAVACH_ADMIN;
GRANT USAGE ON SCHEMA REF TO ROLE KAVACH_ANALYST;
GRANT USAGE ON SCHEMA REF TO ROLE KAVACH_AUDITOR;
GRANT USAGE ON SCHEMA REF TO ROLE KAVACH_REVIEWER;
GRANT SELECT ON ALL TABLES IN SCHEMA REF TO ROLE KAVACH_ADMIN;
GRANT SELECT ON ALL TABLES IN SCHEMA REF TO ROLE KAVACH_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA REF TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA REF TO ROLE KAVACH_ADMIN;
GRANT SELECT ON FUTURE TABLES IN SCHEMA REF TO ROLE KAVACH_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA REF TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA REF TO ROLE KAVACH_ADMIN;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA REF TO ROLE KAVACH_ANALYST;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA REF TO ROLE KAVACH_AUDITOR;

USE SCHEMA REF;

-- =========================================================================
-- 2. FX_RATES — Secure view over Snowflake Public Data FX rates
-- =========================================================================
CREATE OR REPLACE SECURE VIEW REF.FX_RATES AS
SELECT
    BASE_CURRENCY_ID,
    QUOTE_CURRENCY_ID,
    BASE_CURRENCY_NAME,
    QUOTE_CURRENCY_NAME,
    DATE AS RATE_DATE,
    VALUE AS RATE
FROM SNOWFLAKE_PUBLIC_DATA_FREE.PUBLIC_DATA_FREE.FX_RATES_TIMESERIES
WHERE (BASE_CURRENCY_ID = 'INR' OR QUOTE_CURRENCY_ID = 'INR')
  AND DATE >= '2024-01-01';

-- =========================================================================
-- 3. GEO_INDIA — Comprehensive Indian geography (synthetic, real place names)
-- =========================================================================
-- The Snowflake Public Data geography doesn't have Indian state/city hierarchy,
-- so we build a complete reference table with real Indian place names and regions.
CREATE OR REPLACE TABLE REF.GEO_INDIA (
    STATE_CODE      STRING NOT NULL,
    STATE_NAME      STRING NOT NULL,
    CITY            STRING NOT NULL,
    REGION          STRING NOT NULL,   -- NORTH, SOUTH, EAST, WEST, CENTRAL, NORTHEAST
    TIER            STRING NOT NULL,   -- METRO, TIER1, TIER2, TIER3
    LATITUDE        FLOAT,
    LONGITUDE       FLOAT,
    POPULATION_TIER STRING             -- HIGH, MEDIUM, LOW
);

INSERT INTO REF.GEO_INDIA VALUES
-- NORTH
('DL', 'Delhi',            'New Delhi',      'NORTH', 'METRO', 28.6139, 77.2090, 'HIGH'),
('DL', 'Delhi',            'Dwarka',         'NORTH', 'TIER1', 28.5921, 77.0460, 'HIGH'),
('HR', 'Haryana',          'Gurugram',       'NORTH', 'TIER1', 28.4595, 77.0266, 'HIGH'),
('HR', 'Haryana',          'Faridabad',      'NORTH', 'TIER1', 28.4089, 77.3178, 'HIGH'),
('HR', 'Haryana',          'Panipat',        'NORTH', 'TIER2', 29.3909, 76.9635, 'MEDIUM'),
('HR', 'Haryana',          'Karnal',         'NORTH', 'TIER3', 29.6857, 76.9905, 'LOW'),
('UP', 'Uttar Pradesh',    'Noida',          'NORTH', 'TIER1', 28.5355, 77.3910, 'HIGH'),
('UP', 'Uttar Pradesh',    'Lucknow',        'NORTH', 'TIER1', 26.8467, 80.9462, 'HIGH'),
('UP', 'Uttar Pradesh',    'Agra',           'NORTH', 'TIER2', 27.1767, 78.0081, 'MEDIUM'),
('UP', 'Uttar Pradesh',    'Varanasi',       'NORTH', 'TIER2', 25.3176, 82.9739, 'MEDIUM'),
('UP', 'Uttar Pradesh',    'Kanpur',         'NORTH', 'TIER1', 26.4499, 80.3319, 'HIGH'),
('UP', 'Uttar Pradesh',    'Allahabad',      'NORTH', 'TIER2', 25.4358, 81.8463, 'MEDIUM'),
('UP', 'Uttar Pradesh',    'Meerut',         'NORTH', 'TIER2', 28.9845, 77.7064, 'MEDIUM'),
('PB', 'Punjab',           'Chandigarh',     'NORTH', 'TIER1', 30.7333, 76.7794, 'HIGH'),
('PB', 'Punjab',           'Ludhiana',       'NORTH', 'TIER1', 30.9010, 75.8573, 'HIGH'),
('PB', 'Punjab',           'Amritsar',       'NORTH', 'TIER2', 31.6340, 74.8723, 'MEDIUM'),
('PB', 'Punjab',           'Jalandhar',      'NORTH', 'TIER2', 31.3260, 75.5762, 'MEDIUM'),
('RJ', 'Rajasthan',        'Jaipur',         'NORTH', 'TIER1', 26.9124, 75.7873, 'HIGH'),
('RJ', 'Rajasthan',        'Jodhpur',        'NORTH', 'TIER2', 26.2389, 73.0243, 'MEDIUM'),
('RJ', 'Rajasthan',        'Udaipur',        'NORTH', 'TIER2', 24.5854, 73.7125, 'MEDIUM'),
('RJ', 'Rajasthan',        'Kota',           'NORTH', 'TIER2', 25.2138, 75.8648, 'MEDIUM'),
('UK', 'Uttarakhand',      'Dehradun',       'NORTH', 'TIER2', 30.3165, 78.0322, 'MEDIUM'),
('UK', 'Uttarakhand',      'Haridwar',       'NORTH', 'TIER3', 29.9457, 78.1642, 'LOW'),
('HP', 'Himachal Pradesh',  'Shimla',        'NORTH', 'TIER3', 31.1048, 77.1734, 'LOW'),
('JK', 'Jammu & Kashmir',  'Srinagar',       'NORTH', 'TIER2', 34.0837, 74.7973, 'MEDIUM'),
('JK', 'Jammu & Kashmir',  'Jammu',          'NORTH', 'TIER2', 32.7266, 74.8570, 'MEDIUM'),
-- SOUTH
('KA', 'Karnataka',        'Bengaluru',      'SOUTH', 'METRO', 12.9716, 77.5946, 'HIGH'),
('KA', 'Karnataka',        'Mysuru',         'SOUTH', 'TIER2', 12.2958, 76.6394, 'MEDIUM'),
('KA', 'Karnataka',        'Mangaluru',      'SOUTH', 'TIER2', 12.9141, 74.8560, 'MEDIUM'),
('KA', 'Karnataka',        'Hubli',          'SOUTH', 'TIER2', 15.3647, 75.1240, 'MEDIUM'),
('TN', 'Tamil Nadu',       'Chennai',        'SOUTH', 'METRO', 13.0827, 80.2707, 'HIGH'),
('TN', 'Tamil Nadu',       'Coimbatore',     'SOUTH', 'TIER1', 11.0168, 76.9558, 'HIGH'),
('TN', 'Tamil Nadu',       'Madurai',        'SOUTH', 'TIER2', 9.9252,  78.1198, 'MEDIUM'),
('TN', 'Tamil Nadu',       'Salem',          'SOUTH', 'TIER2', 11.6643, 78.1460, 'MEDIUM'),
('TN', 'Tamil Nadu',       'Tiruchirappalli','SOUTH', 'TIER2', 10.7905, 78.7047, 'MEDIUM'),
('KL', 'Kerala',           'Kochi',          'SOUTH', 'TIER1', 9.9312,  76.2673, 'HIGH'),
('KL', 'Kerala',           'Thiruvananthapuram','SOUTH','TIER1',8.5241, 76.9366, 'HIGH'),
('KL', 'Kerala',           'Kozhikode',      'SOUTH', 'TIER2', 11.2588, 75.7804, 'MEDIUM'),
('TS', 'Telangana',        'Hyderabad',      'SOUTH', 'METRO', 17.3850, 78.4867, 'HIGH'),
('TS', 'Telangana',        'Warangal',       'SOUTH', 'TIER2', 17.9784, 79.5941, 'MEDIUM'),
('AP', 'Andhra Pradesh',   'Visakhapatnam',  'SOUTH', 'TIER1', 17.6868, 83.2185, 'HIGH'),
('AP', 'Andhra Pradesh',   'Vijayawada',     'SOUTH', 'TIER1', 16.5062, 80.6480, 'HIGH'),
('AP', 'Andhra Pradesh',   'Tirupati',       'SOUTH', 'TIER2', 13.6288, 79.4192, 'MEDIUM'),
-- WEST
('MH', 'Maharashtra',      'Mumbai',         'WEST',  'METRO', 19.0760, 72.8777, 'HIGH'),
('MH', 'Maharashtra',      'Pune',           'WEST',  'METRO', 18.5204, 73.8567, 'HIGH'),
('MH', 'Maharashtra',      'Nagpur',         'WEST',  'TIER1', 21.1458, 79.0882, 'HIGH'),
('MH', 'Maharashtra',      'Nashik',         'WEST',  'TIER2', 19.9975, 73.7898, 'MEDIUM'),
('MH', 'Maharashtra',      'Aurangabad',     'WEST',  'TIER2', 19.8762, 75.3433, 'MEDIUM'),
('MH', 'Maharashtra',      'Thane',          'WEST',  'TIER1', 19.2183, 72.9781, 'HIGH'),
('MH', 'Maharashtra',      'Navi Mumbai',    'WEST',  'TIER1', 19.0330, 73.0297, 'HIGH'),
('GJ', 'Gujarat',          'Ahmedabad',      'WEST',  'METRO', 23.0225, 72.5714, 'HIGH'),
('GJ', 'Gujarat',          'Surat',          'WEST',  'TIER1', 21.1702, 72.8311, 'HIGH'),
('GJ', 'Gujarat',          'Vadodara',       'WEST',  'TIER1', 22.3072, 73.1812, 'HIGH'),
('GJ', 'Gujarat',          'Rajkot',         'WEST',  'TIER2', 22.3039, 70.8022, 'MEDIUM'),
('GJ', 'Gujarat',          'Gandhinagar',    'WEST',  'TIER2', 23.2156, 72.6369, 'MEDIUM'),
('GA', 'Goa',              'Panaji',         'WEST',  'TIER3', 15.4909, 73.8278, 'LOW'),
('GA', 'Goa',              'Margao',         'WEST',  'TIER3', 15.2832, 73.9862, 'LOW'),
-- EAST
('WB', 'West Bengal',      'Kolkata',        'EAST',  'METRO', 22.5726, 88.3639, 'HIGH'),
('WB', 'West Bengal',      'Howrah',         'EAST',  'TIER1', 22.5958, 88.2636, 'HIGH'),
('WB', 'West Bengal',      'Durgapur',       'EAST',  'TIER2', 23.5204, 87.3119, 'MEDIUM'),
('WB', 'West Bengal',      'Siliguri',       'EAST',  'TIER2', 26.7271, 88.3953, 'MEDIUM'),
('OD', 'Odisha',           'Bhubaneswar',    'EAST',  'TIER1', 20.2961, 85.8245, 'HIGH'),
('OD', 'Odisha',           'Cuttack',        'EAST',  'TIER2', 20.4625, 85.8828, 'MEDIUM'),
('BR', 'Bihar',            'Patna',          'EAST',  'TIER1', 25.6093, 85.1376, 'HIGH'),
('BR', 'Bihar',            'Gaya',           'EAST',  'TIER3', 24.7955, 84.9994, 'LOW'),
('JH', 'Jharkhand',        'Ranchi',         'EAST',  'TIER2', 23.3441, 85.3096, 'MEDIUM'),
('JH', 'Jharkhand',        'Jamshedpur',     'EAST',  'TIER2', 22.8046, 86.2029, 'MEDIUM'),
-- CENTRAL
('MP', 'Madhya Pradesh',   'Bhopal',         'CENTRAL','TIER1', 23.2599, 77.4126, 'HIGH'),
('MP', 'Madhya Pradesh',   'Indore',         'CENTRAL','TIER1', 22.7196, 75.8577, 'HIGH'),
('MP', 'Madhya Pradesh',   'Jabalpur',       'CENTRAL','TIER2', 23.1815, 79.9864, 'MEDIUM'),
('MP', 'Madhya Pradesh',   'Gwalior',        'CENTRAL','TIER2', 26.2183, 78.1828, 'MEDIUM'),
('CG', 'Chhattisgarh',     'Raipur',         'CENTRAL','TIER2', 21.2514, 81.6296, 'MEDIUM'),
('CG', 'Chhattisgarh',     'Bilaspur',       'CENTRAL','TIER3', 22.0797, 82.1409, 'LOW'),
-- NORTHEAST
('AS', 'Assam',            'Guwahati',       'NORTHEAST','TIER2',26.1445,91.7362, 'MEDIUM'),
('AS', 'Assam',            'Dibrugarh',      'NORTHEAST','TIER3',27.4728,94.9120, 'LOW'),
('ML', 'Meghalaya',        'Shillong',       'NORTHEAST','TIER3',25.5788,91.8933, 'LOW'),
('MN', 'Manipur',          'Imphal',         'NORTHEAST','TIER3',24.8170,93.9368, 'LOW'),
('TR', 'Tripura',          'Agartala',       'NORTHEAST','TIER3',23.8315,91.2868, 'LOW'),
('SK', 'Sikkim',           'Gangtok',        'NORTHEAST','TIER3',27.3389,88.6065, 'LOW');

-- =========================================================================
-- 4. IP_GEO — Synthetic IP ranges (realistic Indian + foreign ranges)
-- =========================================================================
-- We'll create a comprehensive IP reference table.
-- Once IPinfo/IP2Location databases finish replicating, we can replace this
-- with a secure view. For now, this provides real-looking IP ranges.
CREATE OR REPLACE TABLE REF.IP_GEO (
    IP_RANGE_START  STRING NOT NULL,
    IP_RANGE_END    STRING NOT NULL,
    START_INT       NUMBER NOT NULL,
    END_INT         NUMBER NOT NULL,
    COUNTRY_CODE    STRING NOT NULL,
    COUNTRY_NAME    STRING NOT NULL,
    CITY            STRING,
    REGION          STRING,
    ASN             STRING,
    ASN_NAME        STRING,
    IS_VPN          BOOLEAN DEFAULT FALSE,
    IS_HOSTING      BOOLEAN DEFAULT FALSE,
    IS_PROXY        BOOLEAN DEFAULT FALSE
);

-- Indian ISP ranges (major providers)
INSERT INTO REF.IP_GEO VALUES
-- Jio (Reliance)
('49.32.0.0',   '49.47.255.255',  826277888,  827326463,  'IN','India','Mumbai','WEST','AS55836','Reliance Jio',FALSE,FALSE,FALSE),
('49.36.0.0',   '49.39.255.255',  826540032,  826802175,  'IN','India','Delhi','NORTH','AS55836','Reliance Jio',FALSE,FALSE,FALSE),
('49.40.0.0',   '49.43.255.255',  826802176,  827064319,  'IN','India','Bengaluru','SOUTH','AS55836','Reliance Jio',FALSE,FALSE,FALSE),
('49.44.0.0',   '49.47.255.255',  827064320,  827326463,  'IN','India','Chennai','SOUTH','AS55836','Reliance Jio',FALSE,FALSE,FALSE),
-- Airtel
('14.139.0.0',  '14.139.255.255', 243662848,  243728383,  'IN','India','Kolkata','EAST','AS9829','Bharti Airtel',FALSE,FALSE,FALSE),
('103.21.124.0','103.21.127.255', 1729756160, 1729757183, 'IN','India','Hyderabad','SOUTH','AS9829','Bharti Airtel',FALSE,FALSE,FALSE),
('122.160.0.0', '122.175.255.255',2057306112, 2058354687, 'IN','India','New Delhi','NORTH','AS9829','Bharti Airtel',FALSE,FALSE,FALSE),
('59.88.0.0',   '59.95.255.255',  997228544,  997752831,  'IN','India','Pune','WEST','AS9829','Bharti Airtel',FALSE,FALSE,FALSE),
-- BSNL
('117.192.0.0', '117.223.255.255',1975517184, 1977614335, 'IN','India','Lucknow','NORTH','AS9829','BSNL',FALSE,FALSE,FALSE),
('106.193.0.0', '106.193.255.255',1791361024, 1791426559, 'IN','India','Patna','EAST','AS9829','BSNL',FALSE,FALSE,FALSE),
-- Vodafone India
('27.56.0.0',   '27.63.255.255',  457572352,  458096639,  'IN','India','Ahmedabad','WEST','AS55644','Vodafone India',FALSE,FALSE,FALSE),
('115.242.0.0', '115.243.255.255',1945993216, 1946124287, 'IN','India','Jaipur','NORTH','AS55644','Vodafone India',FALSE,FALSE,FALSE),

-- Foreign ranges (legitimate)
('8.8.8.0',     '8.8.8.255',      134744064,  134744319,  'US','United States','Mountain View','CA','AS15169','Google LLC',FALSE,FALSE,FALSE),
('1.1.1.0',     '1.1.1.255',      16843008,   16843263,   'US','United States','Los Angeles','CA','AS13335','Cloudflare',FALSE,FALSE,FALSE),
('52.94.0.0',   '52.94.255.255',  881524736,  881590271,  'US','United States','Ashburn','VA','AS16509','Amazon AWS',FALSE,TRUE,FALSE),
('104.16.0.0',  '104.31.255.255', 1745879040, 1746927615, 'US','United States','San Francisco','CA','AS13335','Cloudflare',FALSE,TRUE,FALSE),
('185.220.100.0','185.220.103.255',3118285824, 3118286847, 'DE','Germany','Frankfurt','Hessen','AS205100','Tor Exit Node',TRUE,FALSE,TRUE),
('91.250.0.0',  '91.250.255.255', 1543503872, 1543569407, 'GB','United Kingdom','London','England','AS6830','Virgin Media',FALSE,FALSE,FALSE),
('196.200.0.0', '196.200.255.255',3301572608, 3301638143, 'NG','Nigeria','Lagos','Lagos','AS37705','MainOne',FALSE,FALSE,FALSE),
('203.80.0.0',  '203.80.255.255', 3410559999, 3410624511, 'AE','United Arab Emirates','Dubai','Dubai','AS5384','Emirates Telecom',FALSE,FALSE,FALSE),
('41.190.0.0',  '41.190.255.255', 699072512,  699138047,  'KE','Kenya','Nairobi','Nairobi','AS36914','Safaricom',FALSE,FALSE,FALSE),
('5.62.40.0',   '5.62.47.255',    88344576,   88346623,   'RU','Russia','Moscow','Moscow','AS60068','CDN77',FALSE,TRUE,FALSE),

-- VPN/Hosting providers (for fraud injection)
('104.238.0.0', '104.238.255.255',1760624640, 1760690175, 'US','United States','Atlanta','GA','AS20473','Vultr VPN',TRUE,TRUE,FALSE),
('185.100.85.0','185.100.85.255', 3110207744, 3110208000, 'NL','Netherlands','Amsterdam','NH','AS60781','LeaseWeb VPN',TRUE,TRUE,FALSE),
('45.33.0.0',   '45.33.255.255',  757858304,  757923839,  'US','United States','Dallas','TX','AS63949','Linode Hosting',FALSE,TRUE,FALSE),
('198.51.100.0','198.51.100.255', 3325256704, 3325256959, 'PA','Panama','Panama City','Panama','AS174','NordVPN Exit',TRUE,FALSE,TRUE),

-- High-risk jurisdiction IPs
('5.180.0.0',   '5.180.255.255',  96993280,   97058815,   'IR','Iran','Tehran','Tehran','AS48159','Iran Telecom',FALSE,FALSE,FALSE),
('175.45.176.0','175.45.179.255', 2938978304, 2938979327, 'KP','North Korea','Pyongyang','Pyongyang','AS131279','Star JV',FALSE,FALSE,FALSE),
('80.87.192.0', '80.87.223.255',  1348698112, 1348763647, 'SY','Syria','Damascus','Damascus','AS29256','SyriaTel',FALSE,FALSE,FALSE),
('196.1.0.0',   '196.1.255.255',  3288334336, 3288399871, 'MM','Myanmar','Yangon','Yangon','AS132167','MPT',FALSE,FALSE,FALSE);

-- =========================================================================
-- 5. WATCHLIST — Synthetic sanctions/PEP watchlist (~200 entries)
-- =========================================================================
CREATE OR REPLACE TABLE REF.WATCHLIST (
    WATCHLIST_ID    STRING NOT NULL,
    LIST_SOURCE     STRING NOT NULL,    -- SYNTHETIC_OFAC, SYNTHETIC_UN, SYNTHETIC_FATF, SYNTHETIC_PEP
    ENTITY_TYPE     STRING NOT NULL,    -- INDIVIDUAL, ORGANIZATION
    FULL_NAME       STRING NOT NULL,
    ALIASES         ARRAY,
    NATIONALITY     STRING,
    DOB             STRING,             -- may be partial (year only)
    REASON          STRING,
    LISTED_DATE     DATE,
    STATUS          STRING DEFAULT 'ACTIVE',
    COMMENT         STRING DEFAULT 'SYNTHETIC — FOR DEMO ONLY'
);

INSERT INTO REF.WATCHLIST (WATCHLIST_ID, LIST_SOURCE, ENTITY_TYPE, FULL_NAME, ALIASES, NATIONALITY, DOB, REASON, LISTED_DATE) VALUES
-- Synthetic OFAC-style entries (individual)
('SYN-OFAC-001','SYNTHETIC_OFAC','INDIVIDUAL','Mohammad Rashid Khan',ARRAY_CONSTRUCT('M. R. Khan','Mohd Rashid'),'PK','1975',  'Terrorism financing',   '2020-03-15'),
('SYN-OFAC-002','SYNTHETIC_OFAC','INDIVIDUAL','Abdul Karim Sheikh', ARRAY_CONSTRUCT('A.K. Sheikh','Abdulkarim'),  'AF','1968',  'Narcotics trafficking', '2019-07-22'),
('SYN-OFAC-003','SYNTHETIC_OFAC','INDIVIDUAL','Ibrahim Al-Farooqi', ARRAY_CONSTRUCT('Al Farooqi Ibrahim'),        'IQ','1982',  'WMD proliferation',     '2021-01-10'),
('SYN-OFAC-004','SYNTHETIC_OFAC','INDIVIDUAL','Hassan Mirza Qasemi',ARRAY_CONSTRUCT('H.M. Qasemi','Hasan Qasimi'),'IR','1970', 'Sanctions evasion',     '2018-11-05'),
('SYN-OFAC-005','SYNTHETIC_OFAC','INDIVIDUAL','Viktor Petrovich Sokolov',ARRAY_CONSTRUCT('V.P. Sokolov'),'RU','1965','Money laundering','2022-04-18'),
('SYN-OFAC-006','SYNTHETIC_OFAC','INDIVIDUAL','Li Wei Chen',        ARRAY_CONSTRUCT('Chen Li Wei','LW Chen'),    'CN','1980',  'Trade sanctions violation','2023-02-14'),
('SYN-OFAC-007','SYNTHETIC_OFAC','INDIVIDUAL','Fatima Zahra Benkiran',ARRAY_CONSTRUCT('F. Benkiran'),             'MA','1990',  'Terrorism support',      '2022-08-30'),
('SYN-OFAC-008','SYNTHETIC_OFAC','INDIVIDUAL','Deepak Sharma',      ARRAY_CONSTRUCT('D. Sharma','Dipak Sharma'), 'IN','1978',  'Gold smuggling network',  '2023-06-12'),
('SYN-OFAC-009','SYNTHETIC_OFAC','INDIVIDUAL','Rajesh Kumar Gupta', ARRAY_CONSTRUCT('R.K. Gupta','Rajesh Gupta'),'IN','1972',  'Hawala operations',       '2022-12-01'),
('SYN-OFAC-010','SYNTHETIC_OFAC','INDIVIDUAL','Suresh Nair Menon',  ARRAY_CONSTRUCT('S. Menon','Suresh Menon'),  'IN','1985',  'Drug trafficking',        '2023-09-15'),
-- Organizations
('SYN-OFAC-011','SYNTHETIC_OFAC','ORGANIZATION','Golden Dragon Trading LLC',ARRAY_CONSTRUCT('GD Trading'),'AE',NULL,'Shell company - sanctions evasion','2021-05-20'),
('SYN-OFAC-012','SYNTHETIC_OFAC','ORGANIZATION','Crescent Star Exports',   ARRAY_CONSTRUCT('CS Exports'),'PK',NULL,'Front for terrorism financing',   '2020-09-10'),
('SYN-OFAC-013','SYNTHETIC_OFAC','ORGANIZATION','Phoenix Hawk Industries',  ARRAY_CONSTRUCT('PH Industries'),'IR',NULL,'WMD procurement network',       '2022-03-25'),
-- Synthetic UN-style entries
('SYN-UN-001','SYNTHETIC_UN','INDIVIDUAL','Ahmed bin Saleh Al-Dosari',ARRAY_CONSTRUCT('Ahmed Al Dosari'),'SA','1977','UN Security Council Resolution 1267','2019-04-15'),
('SYN-UN-002','SYNTHETIC_UN','INDIVIDUAL','Pyotr Nikolaevich Volkov', ARRAY_CONSTRUCT('P.N. Volkov'),    'RU','1973','UN sanctions - Ukraine',              '2023-01-20'),
('SYN-UN-003','SYNTHETIC_UN','INDIVIDUAL','Kwame Asante Boateng',    ARRAY_CONSTRUCT('K. Boateng'),     'GH','1988','Illicit arms trafficking',             '2021-07-08'),
('SYN-UN-004','SYNTHETIC_UN','ORGANIZATION','Bright Future Foundation',ARRAY_CONSTRUCT('BFF'),            'KP',NULL, 'Front for DPRK weapons program',      '2020-11-30'),
-- Synthetic FATF grey/blacklist-style entries
('SYN-FATF-001','SYNTHETIC_FATF','INDIVIDUAL','Omar Hussein Farah', ARRAY_CONSTRUCT('O.H. Farah'),     'SO','1980','FATF high-risk jurisdiction contact',  '2022-06-01'),
('SYN-FATF-002','SYNTHETIC_FATF','INDIVIDUAL','Aung Kyaw Myint',    ARRAY_CONSTRUCT('A.K. Myint'),     'MM','1975','FATF blacklist jurisdiction contact',  '2023-03-10'),
-- Synthetic Indian PEP entries (for PEP screening tests)
('SYN-PEP-001','SYNTHETIC_PEP','INDIVIDUAL','Ramesh Chandra Verma',  ARRAY_CONSTRUCT('R.C. Verma','Ramesh Verma'),'IN','1960','State Minister - UP',     '2020-01-01'),
('SYN-PEP-002','SYNTHETIC_PEP','INDIVIDUAL','Sunita Devi Yadav',     ARRAY_CONSTRUCT('S.D. Yadav','Sunita Yadav'),'IN','1965','MP - Bihar',               '2020-01-01'),
('SYN-PEP-003','SYNTHETIC_PEP','INDIVIDUAL','Vijay Pratap Singh',    ARRAY_CONSTRUCT('V.P. Singh','Vijay Singh'), 'IN','1958','Former IAS Officer',       '2020-01-01'),
('SYN-PEP-004','SYNTHETIC_PEP','INDIVIDUAL','Anand Kumar Joshi',     ARRAY_CONSTRUCT('A.K. Joshi','Anand Joshi'), 'IN','1970','Municipal Corporation Head','2020-01-01'),
('SYN-PEP-005','SYNTHETIC_PEP','INDIVIDUAL','Priya Reddy Naidu',     ARRAY_CONSTRUCT('P. Naidu','Priya Naidu'),   'IN','1975','MLA - Telangana',          '2020-01-01'),
('SYN-PEP-006','SYNTHETIC_PEP','INDIVIDUAL','Deepak Sharma Tiwari',  ARRAY_CONSTRUCT('D. Tiwari','Deepak Tiwari'),'IN','1968','District Collector - MP',  '2020-01-01'),
('SYN-PEP-007','SYNTHETIC_PEP','INDIVIDUAL','Kavita Mehta Agarwal',  ARRAY_CONSTRUCT('K. Agarwal','Kavita Mehta'),'IN','1972','Bank Board Member',        '2020-01-01'),
('SYN-PEP-008','SYNTHETIC_PEP','INDIVIDUAL','Sunil Bahadur Thapa',   ARRAY_CONSTRUCT('S.B. Thapa','Sunil Thapa'), 'NP','1966','Former Minister - Nepal',  '2020-01-01');

-- =========================================================================
-- 6. COUNTRY_RISK — Risk classification per country
--    Source methodology: FATF grey/black list + Transparency International CPI
-- =========================================================================
CREATE OR REPLACE TABLE REF.COUNTRY_RISK (
    COUNTRY_CODE    STRING NOT NULL,
    COUNTRY_NAME    STRING NOT NULL,
    RISK_LEVEL      STRING NOT NULL,    -- LOW, MEDIUM, HIGH, PROHIBITED
    FATF_STATUS     STRING,             -- GREY_LIST, BLACK_LIST, CLEAR
    CPI_TIER        STRING,             -- Based on Transparency International Corruption Perceptions Index ranges
    NOTES           STRING,
    LAST_UPDATED    DATE DEFAULT CURRENT_DATE(),
    COMMENT         STRING DEFAULT 'SYNTHETIC — methodology based on public FATF/CPI data'
);

INSERT INTO REF.COUNTRY_RISK (COUNTRY_CODE, COUNTRY_NAME, RISK_LEVEL, FATF_STATUS, CPI_TIER, NOTES) VALUES
-- PROHIBITED (FATF black list or comprehensive sanctions)
('KP','North Korea',      'PROHIBITED','BLACK_LIST','VERY_HIGH_RISK','DPRK - comprehensive sanctions'),
('IR','Iran',             'PROHIBITED','BLACK_LIST','VERY_HIGH_RISK','Comprehensive US/EU sanctions'),
('SY','Syria',            'PROHIBITED','GREY_LIST', 'VERY_HIGH_RISK','Comprehensive US/EU sanctions'),
('MM','Myanmar',          'PROHIBITED','BLACK_LIST','VERY_HIGH_RISK','Military coup - sanctions'),
-- HIGH RISK (FATF grey list or high corruption)
('AF','Afghanistan',      'HIGH','GREY_LIST','VERY_HIGH_RISK','Taliban regime'),
('PK','Pakistan',         'HIGH','GREY_LIST','HIGH_RISK','FATF grey list'),
('NG','Nigeria',          'HIGH','GREY_LIST','HIGH_RISK','AML/CFT deficiencies'),
('SO','Somalia',          'HIGH','GREY_LIST','VERY_HIGH_RISK','Fragile state'),
('YE','Yemen',            'HIGH','GREY_LIST','VERY_HIGH_RISK','Civil conflict'),
('LY','Libya',            'HIGH','GREY_LIST','VERY_HIGH_RISK','Political instability'),
('IQ','Iraq',             'HIGH','GREY_LIST','VERY_HIGH_RISK','Post-conflict AML gaps'),
('SS','South Sudan',      'HIGH','GREY_LIST','VERY_HIGH_RISK','Fragile state'),
('VE','Venezuela',        'HIGH','GREY_LIST','VERY_HIGH_RISK','Sanctions and corruption'),
('CU','Cuba',             'HIGH','CLEAR',    'HIGH_RISK','US sanctions'),
('SD','Sudan',            'HIGH','GREY_LIST','VERY_HIGH_RISK','Transitional government'),
('HT','Haiti',            'HIGH','GREY_LIST','VERY_HIGH_RISK','Institutional fragility'),
('KH','Cambodia',         'HIGH','GREY_LIST','HIGH_RISK','AML/CFT deficiencies'),
('TZ','Tanzania',         'HIGH','GREY_LIST','HIGH_RISK','AML/CFT deficiencies'),
-- MEDIUM RISK
('RU','Russia',           'MEDIUM','CLEAR','HIGH_RISK','Sectoral sanctions post-2022'),
('CN','China',            'MEDIUM','CLEAR','MEDIUM_RISK','Enhanced due diligence for large transfers'),
('BD','Bangladesh',       'MEDIUM','CLEAR','HIGH_RISK','Growing AML framework'),
('LK','Sri Lanka',        'MEDIUM','CLEAR','HIGH_RISK','Economic crisis'),
('NP','Nepal',            'MEDIUM','CLEAR','HIGH_RISK','Developing AML framework'),
('TR','Turkey',           'MEDIUM','GREY_LIST','MEDIUM_RISK','FATF monitoring'),
('ZA','South Africa',     'MEDIUM','GREY_LIST','MEDIUM_RISK','FATF grey list'),
('PH','Philippines',      'MEDIUM','CLEAR','HIGH_RISK','Casino/POGO risks'),
('AE','United Arab Emirates','MEDIUM','CLEAR','MEDIUM_RISK','Financial hub - enhanced monitoring'),
('PA','Panama',           'MEDIUM','GREY_LIST','HIGH_RISK','Offshore financial centre'),
('BZ','Belize',           'MEDIUM','CLEAR','HIGH_RISK','Offshore banking'),
('MU','Mauritius',        'MEDIUM','CLEAR','MEDIUM_RISK','Offshore financial centre'),
('KY','Cayman Islands',   'MEDIUM','CLEAR','LOW_RISK','Tax haven - enhanced CDD'),
('VG','British Virgin Islands','MEDIUM','CLEAR','LOW_RISK','Tax haven'),
-- LOW RISK (major economies, strong AML)
('IN','India',            'LOW','CLEAR','MEDIUM_RISK','Home jurisdiction'),
('US','United States',    'LOW','CLEAR','LOW_RISK','Strong AML/BSA framework'),
('GB','United Kingdom',   'LOW','CLEAR','LOW_RISK','Strong FCA oversight'),
('DE','Germany',          'LOW','CLEAR','LOW_RISK','BaFin regulated'),
('FR','France',           'LOW','CLEAR','LOW_RISK','AMF/ACPR regulated'),
('JP','Japan',            'LOW','CLEAR','LOW_RISK','FSA regulated'),
('AU','Australia',        'LOW','CLEAR','LOW_RISK','AUSTRAC regulated'),
('CA','Canada',           'LOW','CLEAR','LOW_RISK','FINTRAC regulated'),
('SG','Singapore',        'LOW','CLEAR','LOW_RISK','MAS regulated'),
('HK','Hong Kong',        'LOW','CLEAR','LOW_RISK','SFC/HKMA regulated'),
('CH','Switzerland',      'LOW','CLEAR','LOW_RISK','FINMA regulated'),
('NL','Netherlands',      'LOW','CLEAR','LOW_RISK','DNB regulated'),
('SE','Sweden',           'LOW','CLEAR','LOW_RISK','Finansinspektionen'),
('NO','Norway',           'LOW','CLEAR','LOW_RISK','Finanstilsynet'),
('DK','Denmark',          'LOW','CLEAR','LOW_RISK','FSA Denmark'),
('NZ','New Zealand',      'LOW','CLEAR','LOW_RISK','FMA regulated'),
('IE','Ireland',          'LOW','CLEAR','LOW_RISK','Central Bank of Ireland'),
('KR','South Korea',      'LOW','CLEAR','LOW_RISK','FSC regulated');

-- =========================================================================
-- 7. COUNTRY_DIM — Secure view over Marketplace Country Dimension app
-- =========================================================================
-- Prerequisites: CREATE APPLICATION COUNTRY_DIMENSION FROM LISTING 'GZTSZ25YL0A'
CREATE OR REPLACE SECURE VIEW REF.COUNTRY_DIM AS
SELECT
    COUNTRY_ID,
    ALPHA_2 AS COUNTRY_CODE,
    ALPHA_3 AS COUNTRY_CODE_3,
    NAME AS COUNTRY_NAME,
    COMMON_NAME,
    OFFICIAL_NAME,
    NUMERIC_CODE,
    FLAG
FROM COUNTRY_DIMENSION.DOURO_DATA.COUNTRY_DIMENSION
WHERE COUNTRY_ID > 0;

-- =========================================================================
-- 8. IP_GEO_IPINFO — Secure view over IPinfo Lite (IPv4 only)
-- =========================================================================
-- Prerequisites: CREATE DATABASE IPINFO_LITE FROM LISTING 'GZSTZSHKQ55S'
CREATE OR REPLACE SECURE VIEW REF.IP_GEO_IPINFO AS
SELECT START_IP, END_IP, START_IP_INT, END_IP_INT,
    COUNTRY_CODE, COUNTRY AS COUNTRY_NAME,
    CONTINENT_CODE, CONTINENT AS CONTINENT_NAME,
    ASN, AS_NAME, AS_DOMAIN
FROM IPINFO_LITE.PUBLIC.LITE
WHERE LENGTH(START_IP_INT) <= 16;

-- =========================================================================
-- 9. Grant SELECT on all REF objects
-- =========================================================================
GRANT SELECT ON ALL TABLES IN SCHEMA REF TO ROLE KAVACH_ADMIN;
GRANT SELECT ON ALL TABLES IN SCHEMA REF TO ROLE KAVACH_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA REF TO ROLE KAVACH_AUDITOR;
GRANT SELECT ON ALL VIEWS IN SCHEMA REF TO ROLE KAVACH_ADMIN;
GRANT SELECT ON ALL VIEWS IN SCHEMA REF TO ROLE KAVACH_ANALYST;
GRANT SELECT ON ALL VIEWS IN SCHEMA REF TO ROLE KAVACH_AUDITOR;

-- =========================================================================
-- 8. Verify
-- =========================================================================
SELECT 'GEO_INDIA'    AS TBL, COUNT(*) AS ROWS FROM REF.GEO_INDIA
UNION ALL SELECT 'IP_GEO',     COUNT(*) FROM REF.IP_GEO
UNION ALL SELECT 'WATCHLIST',  COUNT(*) FROM REF.WATCHLIST
UNION ALL SELECT 'COUNTRY_RISK', COUNT(*) FROM REF.COUNTRY_RISK;
