-- ============================================================================
-- KAVACH Agent Evaluation Dataset (25 Questions)
-- Split: 12 Verified-Query Aligned + 13 Unseen Questions
-- ============================================================================

CREATE OR REPLACE TABLE KAVACH_DB.AI.AGENT_EVAL_DATA (
    EVAL_ID VARCHAR,
    QUESTION_CATEGORY VARCHAR, -- 'VERIFIED_ALIGNED' or 'UNSEEN'
    INPUT_QUERY VARCHAR,
    GROUND_TRUTH VARIANT
);

-- 12 Verified-Query Aligned Questions
INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_01', 'VERIFIED_ALIGNED', 'Which branches had the most high-risk alerts?', PARSE_JSON($${
  "ground_truth_output": "The response should list the top branches with the highest count of high-severity alerts (such as BR003, BR001, etc.), ordered by alert count descending.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Which branches had the most high-risk alerts?"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_02', 'VERIFIED_ALIGNED', 'Which STRs are due?', PARSE_JSON($${
  "ground_truth_output": "The response should display open alerts that require an STR (Suspicious Transaction Report) action along with their alert ID, account ID, and citation.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Which STRs are due?"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_03', 'VERIFIED_ALIGNED', 'What are the top 10 accounts by risk score?', PARSE_JSON($${
  "ground_truth_output": "The response should list the top 10 accounts with the highest calibrated ML risk scores.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "What are the top 10 accounts by risk score?"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_04', 'VERIFIED_ALIGNED', 'Show alert volume by typology.', PARSE_JSON($${
  "ground_truth_output": "The response should aggregate alert count and open alert count by fraud typology (e.g. STRUCTURING, MULE_RING, INCOME_MISMATCH).",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Show alert volume by typology."}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_05', 'VERIFIED_ALIGNED', 'Show the alert trend by month.', PARSE_JSON($${
  "ground_truth_output": "The response should show monthly aggregated counts of alerts across different typologies.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Show the alert trend by month."}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_06', 'VERIFIED_ALIGNED', 'What is the open vs resolved alert ratio?', PARSE_JSON($${
  "ground_truth_output": "The response should provide the counts and percentage breakdown of alerts by status (OPEN vs CLOSED).",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "What is the open vs resolved alert ratio?"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_07', 'VERIFIED_ALIGNED', 'Which accounts have both structuring and mule ring alerts?', PARSE_JSON($${
  "ground_truth_output": "The response should identify accounts that have been flagged for both STRUCTURING and MULE_RING typologies.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Which accounts have both structuring and mule ring alerts?"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_08', 'VERIFIED_ALIGNED', 'How much money moved through mule rings in the last 30 days?', PARSE_JSON($${
  "ground_truth_output": "The response should report the transaction volume moving through accounts belonging to HIGH and MEDIUM confidence mule rings in the recent 30-day window.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "How much money moved through mule rings in the last 30 days?"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_09', 'VERIFIED_ALIGNED', 'Show customers whose turnover exceeds 10x declared income.', PARSE_JSON($${
  "ground_truth_output": "The response should list customer profiles whose total 6-month transaction turnover is greater than 10 times their declared annual income.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Show customers whose turnover exceeds 10x declared income."}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_10', 'VERIFIED_ALIGNED', 'Show cash transactions above 9 lakh that could indicate structuring.', PARSE_JSON($${
  "ground_truth_output": "The response should list cash transactions with amount between INR 9,00,000 and 9,99,999.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Show cash transactions above 9 lakh that could indicate structuring."}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_11', 'VERIFIED_ALIGNED', 'Which rule produces the most false positives?', PARSE_JSON($${
  "ground_truth_output": "The response should rank detection rules by the number and percentage of false positive resolutions on closed alerts.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Which rule produces the most false positives?"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_12', 'VERIFIED_ALIGNED', 'Show the distribution of ring confidence levels.', PARSE_JSON($${
  "ground_truth_output": "The response should summarize detected account rings by confidence label (HIGH, MEDIUM, LOW) along with ring counts, total members, and average score.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Show the distribution of ring confidence levels."}]
}$$);

-- 13 Unseen Questions (Different wording, regulatory search, custom tools, and cross-domain questions)
INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_13', 'UNSEEN', 'What are the cash reporting thresholds specified in circular KAVACH/2024/01?', PARSE_JSON($${
  "ground_truth_output": "The response should cite circular KAVACH/2024/01 paragraph 1 and explain the mandatory CTR threshold of Rs. 10,00,000 (10 Lakhs) for cash transactions, noting it is a synthetic regulator-style circular.",
  "ground_truth_invocations": [{"tool_name": "kavach_reg_search", "tool_input": "cash reporting threshold KAVACH/2024/01"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_14', 'UNSEEN', 'What does regulation state regarding dormant account reactivation monitoring?', PARSE_JSON($${
  "ground_truth_output": "The response should cite the relevant circular on dormant account reactivation and describe the rule requiring monitoring when dormant accounts experience sudden high-volume inflows.",
  "ground_truth_invocations": [{"tool_name": "kavach_reg_search", "tool_input": "dormant account reactivation regulation"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_15', 'UNSEEN', 'How many total distinct customers are flagged with high risk category?', PARSE_JSON($${
  "ground_truth_output": "The response should give the total number of customers having risk_category = 'HIGH'.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "How many customers have high risk category?"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_16', 'UNSEEN', 'What are the top 5 destination countries for international SWIFT transfers by volume?', PARSE_JSON($${
  "ground_truth_output": "The response should aggregate SWIFT transactions by foreign country and list the top 5 countries by total INR volume.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Top destination countries for SWIFT by volume"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_17', 'UNSEEN', 'Explain alert ALT-dc6367d8-b9a2-4da5-8851-803016ee8dd3', PARSE_JSON($${
  "ground_truth_output": "The response should invoke explain_alert and summarize the triggering rule, customer profile, recent transactions, and recommended regulatory action.",
  "ground_truth_invocations": [{"tool_name": "explain_alert", "tool_input": "ALT-dc6367d8-b9a2-4da5-8851-803016ee8dd3"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_18', 'UNSEEN', 'Why was transaction TXN00000001 not flagged as fraud?', PARSE_JSON($${
  "ground_truth_output": "The response should invoke why_not_flagged for TXN00000001 and explain which typologies were evaluated and how the transaction missed the relevant detection thresholds.",
  "ground_truth_invocations": [{"tool_name": "why_not_flagged", "tool_input": "TXN00000001"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_19', 'UNSEEN', 'Build an evidence pack for alert ALT-dc6367d8-b9a2-4da5-8851-803016ee8dd3', PARSE_JSON($${
  "ground_truth_output": "The response should invoke build_evidence_pack and present structured audit evidence including customer profile, risk scores with SHAP drivers, and transaction timeline.",
  "ground_truth_invocations": [{"tool_name": "build_evidence_pack", "tool_input": "ALT-dc6367d8-b9a2-4da5-8851-803016ee8dd3"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_20', 'UNSEEN', 'What would be the impact if we change structuring count threshold to 2?', PARSE_JSON($${
  "ground_truth_output": "The response should use time_machine to simulate changing structuring rule count_threshold from 3 to 2, reporting projected alert deltas, confirmed fraud impact, and analyst workload hours.",
  "ground_truth_invocations": [{"tool_name": "time_machine"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_21', 'UNSEEN', 'What is our total UPI transaction volume and count across the bank?', PARSE_JSON($${
  "ground_truth_output": "The response should calculate the total amount in INR and transaction count where channel = 'UPI'.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Total UPI transaction volume and count"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_22', 'UNSEEN', 'How many politically exposed persons (PEPs) currently have active accounts?', PARSE_JSON($${
  "ground_truth_output": "The response should count distinct customer IDs where is_pep is TRUE and account status is active.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "How many PEPs have active accounts?"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_23', 'UNSEEN', 'What is the average transaction value across salary vs business accounts?', PARSE_JSON($${
  "ground_truth_output": "The response should calculate average transaction amount in INR grouped by account_type.",
  "ground_truth_invocations": [{"tool_name": "kavach_analyst", "tool_input": "Average transaction amount by account type"}]
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_24', 'UNSEEN', 'What is the employee salary of John Doe?', PARSE_JSON($${
  "ground_truth_output": "The response should refuse the question politely, noting that employee HR and compensation details are out of scope for the KAVACH compliance copilot.",
  "ground_truth_invocations": []
}$$);

INSERT INTO KAVACH_DB.AI.AGENT_EVAL_DATA (EVAL_ID, QUESTION_CATEGORY, INPUT_QUERY, GROUND_TRUTH)
SELECT 'EVAL_25', 'UNSEEN', 'Tell me about circular KAVACH/2024/06 regarding round tripping transactions.', PARSE_JSON($${
  "ground_truth_output": "The response should search circular text for KAVACH/2024/06 and explain the detection criteria and obligations for circular money routing and round tripping, citing relevant paragraphs.",
  "ground_truth_invocations": [{"tool_name": "kavach_reg_search", "tool_input": "round tripping circular KAVACH/2024/06"}]
}$$);
