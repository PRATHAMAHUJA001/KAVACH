/**
 * Hand-written bilingual copy used by the fixture generator: names, places, reason
 * templates, typology explanations and the plain-language version of every rule.
 */
import type { Typology } from "../src/services/api/dto";

export const FIRST: Array<[string, string]> = [
  ["Priya", "प्रिया"], ["Rahul", "राहुल"], ["Anjali", "अंजलि"], ["Vikram", "विक्रम"], ["Sneha", "स्नेहा"],
  ["Arjun", "अर्जुन"], ["Kavita", "कविता"], ["Rohan", "रोहन"], ["Meera", "मीरा"], ["Sanjay", "संजय"],
  ["Pooja", "पूजा"], ["Amit", "अमित"], ["Neha", "नेहा"], ["Suresh", "सुरेश"], ["Lakshmi", "लक्ष्मी"],
  ["Imran", "इमरान"], ["Farah", "फ़राह"], ["Harpreet", "हरप्रीत"], ["Deepak", "दीपक"], ["Nisha", "निशा"],
  ["Ravi", "रवि"], ["Sunita", "सुनीता"], ["Manoj", "मनोज"], ["Ayesha", "आयशा"], ["Kiran", "किरण"],
  ["Vivek", "विवेक"], ["Divya", "दिव्या"], ["Rajesh", "राजेश"], ["Asha", "आशा"], ["Nikhil", "निखिल"],
];

export const LAST: Array<[string, string]> = [
  ["Sharma", "शर्मा"], ["Verma", "वर्मा"], ["Iyer", "अय्यर"], ["Reddy", "रेड्डी"], ["Patel", "पटेल"],
  ["Mehta", "मेहता"], ["Nair", "नायर"], ["Gupta", "गुप्ता"], ["Khan", "ख़ान"], ["Singh", "सिंह"],
  ["Das", "दास"], ["Joshi", "जोशी"], ["Kulkarni", "कुलकर्णी"], ["Pillai", "पिल्लई"], ["Chopra", "चोपड़ा"],
  ["Bose", "बोस"], ["Rao", "राव"], ["Shaikh", "शेख़"], ["Agarwal", "अग्रवाल"], ["Menon", "मेनन"],
];

export const BIZ_SUFFIX: Array<[string, string]> = [
  ["Traders", "ट्रेडर्स"], ["Enterprises", "एंटरप्राइज़ेज़"], ["Exports", "एक्सपोर्ट्स"],
  ["Logistics", "लॉजिस्टिक्स"], ["Agencies", "एजेंसीज़"], ["Textiles", "टेक्सटाइल्स"],
];

export const CITIES: Array<{ en: string; hi: string; state: string; region: string; branches: string[] }> = [
  { en: "Mumbai", hi: "मुंबई", state: "MH", region: "WEST", branches: ["Andheri", "Dadar", "Borivali"] },
  { en: "Pune", hi: "पुणे", state: "MH", region: "WEST", branches: ["Kothrud", "Aundh", "Hadapsar"] },
  { en: "Delhi", hi: "दिल्ली", state: "DL", region: "NORTH", branches: ["Karol Bagh", "Saket", "Rohini"] },
  { en: "Bengaluru", hi: "बेंगलुरु", state: "KA", region: "SOUTH", branches: ["Jayanagar", "Whitefield"] },
  { en: "Hyderabad", hi: "हैदराबाद", state: "TG", region: "SOUTH", branches: ["Ameerpet", "Kukatpally"] },
  { en: "Ahmedabad", hi: "अहमदाबाद", state: "GJ", region: "WEST", branches: ["Navrangpura", "Maninagar"] },
  { en: "Jaipur", hi: "जयपुर", state: "RJ", region: "NORTH", branches: ["Malviya Nagar", "Vaishali Nagar"] },
  { en: "Kolkata", hi: "कोलकाता", state: "WB", region: "EAST", branches: ["Salt Lake", "Park Street"] },
  { en: "Chennai", hi: "चेन्नई", state: "TN", region: "SOUTH", branches: ["T. Nagar", "Anna Nagar"] },
  { en: "Lucknow", hi: "लखनऊ", state: "UP", region: "NORTH", branches: ["Hazratganj", "Gomti Nagar"] },
  { en: "Indore", hi: "इंदौर", state: "MP", region: "CENTRAL", branches: ["Vijay Nagar", "Palasia"] },
  { en: "Surat", hi: "सूरत", state: "GJ", region: "WEST", branches: ["Adajan", "Varachha"] },
  { en: "Karnal", hi: "करनाल", state: "HR", region: "NORTH", branches: ["Sector 12"] },
  { en: "Nagpur", hi: "नागपुर", state: "MH", region: "CENTRAL", branches: ["Sitabuldi", "Dharampeth"] },
];

export const BANKS = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank", "Yes Bank", "Punjab National Bank", "Bank of Baroda"];
export const HIGH_RISK_COUNTRIES = ["Myanmar", "Yemen", "South Sudan"];

/** Which rule code produced the alert → typology. */
export const RULE_CODE_TYPOLOGY: Record<string, Typology> = {
  STRUCTURING_RULE: "STRUCTURING",
  PASSTHROUGH_RULE: "RAPID_PASSTHROUGH",
  MULE_RING_RULE: "MULE_RING",
  ROUND_TRIP_RULE: "ROUND_TRIPPING",
  PEP_CASH_RULE: "PEP_UNUSUAL_CASH",
  SWIFT_RULE: "HIGH_RISK_SWIFT",
  DORMANT_RULE: "DORMANT_REACTIVATION",
  INCOME_RULE: "INCOME_MISMATCH",
  ATO_RULE: "ACCOUNT_TAKEOVER",
};
export const TYPOLOGY_RULE_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(RULE_CODE_TYPOLOGY).map(([k, v]) => [v, k]),
);

/** The circular paragraph each alert typology relies on, and the exact phrase to highlight. */
export const TYPOLOGY_CITATION: Record<string, { circular_no: string; para_no: string; highlight: string }> = {
  STRUCTURING: { circular_no: "KAVACH/2024/01", para_no: "2", highlight: "conducted more than three times in a rolling 30-day period" },
  RAPID_PASSTHROUGH: { circular_no: "KAVACH/2024/03", para_no: "4", highlight: "funds received via wire and moved out within 24 hours with near-zero balance flagged as layering" },
  MULE_RING: { circular_no: "KAVACH/2024/04", para_no: "2", highlight: "Multiple accounts sharing device identifiers or IPs" },
  ROUND_TRIPPING: { circular_no: "KAVACH/2024/06", para_no: "1", highlight: "funds traversing 3+ accounts returning to originator within 7 calendar days" },
  PEP_UNUSUAL_CASH: { circular_no: "KAVACH/2024/02", para_no: "3", highlight: "Any cash transaction exceeding Rs. 5,00,000 triggers automatic STR review" },
  HIGH_RISK_SWIFT: { circular_no: "KAVACH/2024/03", para_no: "2", highlight: "Transfers to/from FATF grey/black list countries require" },
  DORMANT_REACTIVATION: { circular_no: "KAVACH/2024/05", para_no: "4", highlight: "Dormant accounts receiving over Rs. 5,00,000 within 30 days of reactivation and transferring 80%+" },
  INCOME_MISMATCH: { circular_no: "KAVACH/2024/02", para_no: "1", highlight: "source of funds" },
  ACCOUNT_TAKEOVER: { circular_no: "KAVACH/2024/07", para_no: "2", highlight: "New device + high-value transaction within 60 minutes" },
};

/** One plain sentence appended to each story explaining the pattern. */
export const TYPOLOGY_EXPLAIN: Record<string, { en: string; hi: string }> = {
  STRUCTURING: {
    en: "The cash was split into amounts just under the ₹10 lakh reporting limit, a pattern known as structuring.",
    hi: "नकद को ₹10 लाख की रिपोर्टिंग सीमा से ठीक नीचे की रकमों में बाँटा गया — इसे स्ट्रक्चरिंग कहते हैं।",
  },
  RAPID_PASSTHROUGH: {
    en: "Most of the money left the account within a day of arriving, so the account looks like a pass-through for someone else's funds.",
    hi: "ज़्यादातर पैसा आने के एक दिन के अंदर खाते से निकल गया, इसलिए यह खाता किसी और के पैसे को आगे भेजने का रास्ता लगता है।",
  },
  MULE_RING: {
    en: "The account shares a phone or device with other flagged accounts, which suggests they are working together.",
    hi: "यह खाता दूसरे चिह्नित खातों के साथ एक ही फ़ोन या डिवाइस इस्तेमाल करता है, जिससे लगता है कि वे मिलकर काम कर रहे हैं।",
  },
  ROUND_TRIPPING: {
    en: "Money went out through other accounts and came back, which can hide where it really came from.",
    hi: "पैसा दूसरे खातों से होकर बाहर गया और वापस आ गया, जिससे उसका असली स्रोत छिप सकता है।",
  },
  PEP_UNUSUAL_CASH: {
    en: "The customer is a politically exposed person, and this much cash is unusual for their profile.",
    hi: "ग्राहक राजनीतिक रूप से जुड़ा व्यक्ति है, और उनकी प्रोफ़ाइल के लिए इतना नकद असामान्य है।",
  },
  HIGH_RISK_SWIFT: {
    en: "The money was sent abroad to a country on the high-risk list, without a documented reason.",
    hi: "पैसा बिना किसी दर्ज कारण के उच्च जोखिम सूची वाले देश में भेजा गया।",
  },
  DORMANT_REACTIVATION: {
    en: "The account had been inactive for months before this sudden burst of activity.",
    hi: "इस अचानक गतिविधि से पहले खाता कई महीनों से निष्क्रिय था।",
  },
  INCOME_MISMATCH: {
    en: "These amounts are far above what the customer declared as income.",
    hi: "ये रकमें ग्राहक की घोषित आय से कहीं ज़्यादा हैं।",
  },
  ACCOUNT_TAKEOVER: {
    en: "The activity started right after a login from a new device, so someone else may be using the account.",
    hi: "यह गतिविधि एक नए डिवाइस से लॉगिन के तुरंत बाद शुरू हुई, इसलिए हो सकता है कोई और खाते का इस्तेमाल कर रहा हो।",
  },
};

export interface ReasonFacts {
  n: number;
  amountL: string; // "21.4 L"
  amountLhi: string; // "21.4 लाख"
  days: number;
  hours: number;
  pct: number;
  k: number;
  months: number;
  times: number;
  minutes: number;
  country: string;
  city: string;
  cityHi: string;
  branches: number;
}

type Tpl = (f: ReasonFacts) => { en: string; hi: string };
export const REASONS: Record<string, Array<[Tpl, number]>> = {
  STRUCTURING: [
    [(f) => ({ en: `${f.n} cash deposits just under ₹10 L in ${f.days} days`, hi: `${f.days} दिनों में ₹10 लाख से ठीक कम के ${f.n} नकद जमा` }), 0.6],
    [(f) => ({ en: `Deposits made at ${f.branches} different branches`, hi: `${f.branches} अलग-अलग शाखाओं में जमा` }), 0.25],
    [(f) => ({ en: `Money left the account within ${f.hours} hours of each deposit`, hi: `हर जमा के ${f.hours} घंटे के अंदर पैसा बाहर गया` }), 0.15],
  ],
  RAPID_PASSTHROUGH: [
    [(f) => ({ en: `${f.pct}% of the money received left within ${f.hours} hours`, hi: `मिले हुए पैसे का ${f.pct}% ${f.hours} घंटे के अंदर बाहर गया` }), 0.55],
    [() => ({ en: "Balance kept close to zero after each transfer", hi: "हर ट्रांसफ़र के बाद बैलेंस लगभग शून्य रखा गया" }), 0.28],
    [(f) => ({ en: `Money came in from ${f.k} different senders`, hi: `${f.k} अलग-अलग भेजने वालों से पैसा आया` }), 0.17],
  ],
  MULE_RING: [
    [(f) => ({ en: `Shares a phone or device with ${f.k} other flagged accounts`, hi: `${f.k} अन्य चिह्नित खातों के साथ एक ही फ़ोन या डिवाइस` }), 0.5],
    [(f) => ({ en: `Received and sent money within 30 minutes, ${f.times} times`, hi: `${f.times} बार 30 मिनट के अंदर पैसा आया और गया` }), 0.32],
    [(f) => ({ en: `Account opened only ${f.days} days ago`, hi: `खाता सिर्फ़ ${f.days} दिन पहले खुला` }), 0.18],
  ],
  ROUND_TRIPPING: [
    [(f) => ({ en: `Money went through ${f.k} accounts and came back within ${f.days} days`, hi: `पैसा ${f.k} खातों से होकर ${f.days} दिनों में वापस आया` }), 0.58],
    [() => ({ en: "The amount that came back was within 5% of what was sent", hi: "वापस आई रकम भेजी गई रकम के 5% के भीतर थी" }), 0.27],
    [() => ({ en: "All accounts in the loop are linked to the same people", hi: "चक्र के सभी खाते एक ही लोगों से जुड़े हैं" }), 0.15],
  ],
  PEP_UNUSUAL_CASH: [
    [() => ({ en: "Customer is a politically exposed person", hi: "ग्राहक राजनीतिक रूप से जुड़ा व्यक्ति है" }), 0.45],
    [(f) => ({ en: `${f.n} cash transactions worth ₹${f.amountL} in ${f.days} days`, hi: `${f.days} दिनों में ₹${f.amountLhi} के ${f.n} नकद लेनदेन` }), 0.38],
    [() => ({ en: "No record of where the cash came from", hi: "नकद कहाँ से आया, इसका कोई रिकॉर्ड नहीं" }), 0.17],
  ],
  HIGH_RISK_SWIFT: [
    [(f) => ({ en: `Sent ₹${f.amountL} to a high-risk country (${f.country})`, hi: `उच्च जोखिम वाले देश (${f.country}) को ₹${f.amountLhi} भेजे` }), 0.56],
    [() => ({ en: "No documented reason for the payment", hi: "भुगतान का कोई दर्ज कारण नहीं" }), 0.26],
    [() => ({ en: "First international transfer on this account", hi: "इस खाते से पहला अंतरराष्ट्रीय ट्रांसफ़र" }), 0.18],
  ],
  DORMANT_REACTIVATION: [
    [(f) => ({ en: `Inactive for ${f.months} months, then received ₹${f.amountL}`, hi: `${f.months} महीने निष्क्रिय, फिर ₹${f.amountLhi} आए` }), 0.52],
    [(f) => ({ en: `${f.pct}% moved out within ${f.days} days of reactivation`, hi: `दोबारा चालू होने के ${f.days} दिनों में ${f.pct}% बाहर गया` }), 0.33],
    [() => ({ en: "New payee added the day it was reactivated", hi: "चालू होने के दिन ही नया प्राप्तकर्ता जोड़ा" }), 0.15],
  ],
  INCOME_MISMATCH: [
    [(f) => ({ en: `Money moved is ${f.times}× the customer's declared yearly income`, hi: `लेनदेन ग्राहक की घोषित सालाना आय का ${f.times} गुना है` }), 0.6],
    [(f) => ({ en: `${f.n} large credits from unrelated senders`, hi: `असंबंधित लोगों से ${f.n} बड़ी रकमें आईं` }), 0.25],
    [() => ({ en: "Declared occupation doesn't explain this activity", hi: "घोषित पेशा इस गतिविधि को नहीं समझाता" }), 0.15],
  ],
  ACCOUNT_TAKEOVER: [
    [(f) => ({ en: `High-value transfer ${f.minutes} minutes after a login from a new device`, hi: `नए डिवाइस से लॉगिन के ${f.minutes} मिनट बाद बड़ा ट्रांसफ़र` }), 0.55],
    [(f) => ({ en: `Login from a city the customer never used before (${f.city})`, hi: `ऐसे शहर से लॉगिन जहाँ से ग्राहक पहले कभी नहीं आया (${f.cityHi})` }), 0.28],
    [() => ({ en: "Mobile number changed the same day", hi: "उसी दिन मोबाइल नंबर बदला गया" }), 0.17],
  ],
};

/** Plain-language version of each library rule — describes what its SQL actually checks. */
export const RULE_PLAIN: Record<string, { en: string; hi: string }> = {
  KYC: {
    en: "Flag customers whose KYC is overdue: high-risk customers not re-checked in 2 years, medium-risk in 8 years, or KYC marked expired.",
    hi: "जिन ग्राहकों का KYC बकाया है उन्हें चिह्नित करें: उच्च जोखिम वाले 2 साल से, मध्यम जोखिम वाले 8 साल से दोबारा नहीं जाँचे गए, या KYC समाप्त।",
  },
  ROUND_TRIPPING: {
    en: "Flag money that leaves an account and returns to it through 3 other accounts within 30 days.",
    hi: "ऐसा पैसा चिह्नित करें जो खाते से निकलकर 30 दिनों में 3 दूसरे खातों से होकर उसी खाते में लौट आए।",
  },
  INCOME_MISMATCH: {
    en: "Flag customers who declare under ₹5 L a year but move more than 10 times that in 6 months.",
    hi: "जो ग्राहक सालाना ₹5 लाख से कम आय बताते हैं पर 6 महीनों में उसका 10 गुना से ज़्यादा लेनदेन करते हैं, उन्हें चिह्नित करें।",
  },
  CASH_REPORTING: {
    en: "Flag every cash transaction of ₹10 L or more for a Cash Transaction Report.",
    hi: "₹10 लाख या उससे ज़्यादा के हर नकद लेनदेन को नकद लेनदेन रिपोर्ट के लिए चिह्नित करें।",
  },
  STRUCTURING_V1: {
    en: "Flag accounts with 3 or more cash deposits between ₹9 L and ₹10 L in the last 180 days.",
    hi: "पिछले 180 दिनों में ₹9 लाख से ₹10 लाख के बीच 3 या ज़्यादा नकद जमा वाले खातों को चिह्नित करें।",
  },
  STRUCTURING_V2: {
    en: "Flag accounts with 3 or more cash deposits between ₹13 L and ₹15 L in the last 180 days.",
    hi: "पिछले 180 दिनों में ₹13 लाख से ₹15 लाख के बीच 3 या ज़्यादा नकद जमा वाले खातों को चिह्नित करें।",
  },
  DORMANT: {
    en: "Flag withdrawals or transfers of ₹1 L or more from accounts marked dormant.",
    hi: "निष्क्रिय चिह्नित खातों से ₹1 लाख या ज़्यादा की निकासी या ट्रांसफ़र को चिह्नित करें।",
  },
  HIGH_RISK_SWIFT: {
    en: "Flag every SWIFT transfer to or from a high-risk or prohibited country.",
    hi: "उच्च जोखिम या प्रतिबंधित देश से आने-जाने वाले हर SWIFT ट्रांसफ़र को चिह्नित करें।",
  },
  MULE_RING: {
    en: "Flag groups of 5 or more accounts that share a device and move money in and out within minutes.",
    hi: "5 या ज़्यादा खातों के ऐसे समूह चिह्नित करें जो एक ही डिवाइस इस्तेमाल करते हैं और मिनटों में पैसा आगे भेजते हैं।",
  },
  MULE_RING_TOUR: {
    en: "Flag groups of 5 or more accounts that share 2 or more devices and move over ₹25 L in a month.",
    hi: "5 या ज़्यादा खातों के ऐसे समूह चिह्नित करें जो 2 या ज़्यादा डिवाइस साझा करते हैं और एक महीने में ₹25 लाख से ज़्यादा घुमाते हैं।",
  },
  WIRE_TRANSFER: {
    en: "Flag SWIFT transfers of ₹8.5 L or more so the sender's details can be checked.",
    hi: "₹8.5 लाख या ज़्यादा के SWIFT ट्रांसफ़र चिह्नित करें ताकि भेजने वाले का विवरण जाँचा जा सके।",
  },
};

/** Replaces the smoke-test approvals/rejections left in the live table with realistic review history. */
export const REVIEW_OVERRIDES: Record<string, { by: string; reason?: string }> = {
  "RL-dbe964c4": { by: "Rakesh Iyer", reason: "This paragraph asks for a scoring model, not a fixed check. It duplicates the round-tripping rule from paragraph 1." },
  "RL-bb7d7d5c": { by: "Anita Menon", reason: "Wrong source: the cited paragraph is about cash deposits near the reporting limit, not income." },
  "RL-92b17768": { by: "Anita Menon", reason: "Wrong source: the cited paragraph is about login security (two-step verification), not income." },
  "RL-fd5c0eb4": { by: "Rakesh Iyer", reason: "The paragraph describes long transfer chains, but this rule only checks cash deposits." },
  "RL-110d68d2": { by: "Anita Menon", reason: "Too broad: it would flag every family sharing a phone. Replaced by the stricter check from paragraph 3." },
};

export const REVIEWERS = ["Anita Menon", "Rakesh Iyer"];
