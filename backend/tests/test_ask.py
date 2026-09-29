"""Agent response parsing: SQL result rows are forwarded as result_set (API_EXTENSIONS §9)."""
from app.presentation.api.v1.ask import MAX_RESULT_ROWS, _extract_from_content_items, _to_result_set

RS = {
    "resultSetMetaData": {"numRows": 2, "rowType": [{"name": "TYPOLOGY", "type": "text"}, {"name": "ALERTS", "type": "fixed"}, {"name": "AMOUNT", "type": "real"}]},
    "data": [["CASH_REPORTING", "1500", "92565.5"], ["KYC_CDD", "372", None]],
}


def test_result_set_types_numbers():
    assert _to_result_set(RS) == {"columns": ["TYPOLOGY", "ALERTS", "AMOUNT"], "rows": [["CASH_REPORTING", 1500, 92565.5], ["KYC_CDD", 372, None]]}
    assert _to_result_set({}) is None


def test_result_set_is_capped():
    big = {"resultSetMetaData": {"rowType": [{"name": "N", "type": "fixed"}]}, "data": [[str(i)] for i in range(500)]}
    assert len(_to_result_set(big)["rows"]) == MAX_RESULT_ROWS


def test_extract_carries_result_set_and_sql():
    out = _extract_from_content_items([
        {"type": "tool_use", "tool_use": {"name": "sql", "type": "system_execute_sql", "tool_use_id": "t1"}},
        {"type": "tool_result", "tool_result": {"name": "sql", "type": "system_execute_sql", "status": "success", "tool_use_id": "t1",
                                                "content": [{"type": "json", "json": {"sql": "SELECT 1", "result_set": RS}}]}},
        {"type": "text", "text": "There are 1,500 cash alerts."},
    ])
    assert out["answer"] == "There are 1,500 cash alerts."
    assert out["sql"] == "SELECT 1"
    assert out["result_set"]["rows"][0] == ["CASH_REPORTING", 1500, 92565.5]
    assert out["tool_calls"][0]["summary"] == "SQL executed, 2 row(s)"


def test_reasoning_is_split_out_of_the_answer():
    """Interim narration and thinking blocks must not land in the answer body.

    The agent interleaves commentary with its tool calls ("no rows came back,
    let me try..."). Those arrive as `text` blocks like the answer does, so
    everything before the last tool step is treated as working-out.
    """
    out = _extract_from_content_items([
        {"type": "thinking", "thinking": {"text": "Let me check the semantic context."}},
        {"type": "tool_use", "tool_use": {"name": "sql", "type": "system_execute_sql", "tool_use_id": "t1"}},
        {"type": "tool_result", "tool_result": {"name": "sql", "type": "system_execute_sql",
                                                "status": "error", "tool_use_id": "t1",
                                                "content": [{"type": "json", "json": {"error": "no rows"}}]}},
        {"type": "text", "text": "No rows came back — retrying with the right status."},
        {"type": "tool_use", "tool_use": {"name": "sql", "type": "system_execute_sql", "tool_use_id": "t2"}},
        {"type": "tool_result", "tool_result": {"name": "sql", "type": "system_execute_sql",
                                                "status": "success", "tool_use_id": "t2",
                                                "content": [{"type": "json", "json": {"sql": "SELECT 1", "result_set": RS}}]}},
        {"type": "text", "text": "The most urgent alert is ALT-1."},
        {"type": "text", "text": "- It fired on a rapid pass-through rule."},
    ])

    assert out["answer"] == "The most urgent alert is ALT-1.\n\n- It fired on a rapid pass-through rule."
    assert "Let me check the semantic context." in out["reasoning"]
    assert "No rows came back" in out["reasoning"]
    # the giveaway that the split is working: none of the working-out leaks
    assert "retrying" not in out["answer"]
    assert "semantic context" not in out["answer"]


def test_answer_blocks_are_separated_by_blank_lines():
    """Joining with "" ran sentences together and collapsed markdown lists."""
    out = _extract_from_content_items([
        {"type": "text", "text": "First paragraph."},
        {"type": "text", "text": "- bullet one\n- bullet two"},
    ])
    assert out["answer"] == "First paragraph.\n\n- bullet one\n- bullet two"
    assert out["reasoning"] == ""
