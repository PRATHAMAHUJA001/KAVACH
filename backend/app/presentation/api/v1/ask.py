"""
Ask endpoint - Cortex Agent (KAVACH_AGENT) via the Agents Run REST API.

The agent orchestrates kavach_analyst (Cortex Analyst / semantic view), kavach_reg_search
(Cortex Search over synthetic circulars), and four generic tools (explain_alert,
why_not_flagged, build_evidence_pack, time_machine). This endpoint calls the agent
directly rather than Cortex Analyst, and normalizes the agent's SSE event stream into
a small, stable event set for API consumers: status, text_delta, tool_call, tool_result,
done, error.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import httpx
from typing import AsyncIterator, Optional
from app.infrastructure.config.settings import settings
from app.infrastructure.snowflake.connection import get_session

router = APIRouter()


class AskRequest(BaseModel):
    """Ask request model"""
    question: str


class Citation(BaseModel):
    circular_no: Optional[str] = None
    para_no: Optional[str] = None
    text: str


class ToolCall(BaseModel):
    name: str
    type: str
    status: Optional[str] = None
    summary: Optional[str] = None


class AskResponse(BaseModel):
    """Ask response model (for non-streaming)"""
    question: str
    answer: str
    verified_query: bool
    sql: Optional[str] = None
    citations: list[Citation]
    tool_calls: list[ToolCall]
    warnings: list[str]


def _agent_url() -> str:
    return (
        f"https://{settings.snowflake_account}.snowflakecomputing.com"
        f"/api/v2/databases/{settings.agent_database}/schemas/{settings.agent_schema}"
        f"/agents/{settings.agent_name}:run"
    )


def _auth_headers(accept: str) -> dict:
    if not settings.snowflake_token:
        raise RuntimeError("SNOWFLAKE_TOKEN (programmatic access token) is not configured")
    return {
        "Authorization": f"Bearer {settings.snowflake_token}",
        "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
        "Content-Type": "application/json",
        "Accept": accept,
    }


def _build_payload(question: str, stream: bool) -> dict:
    return {
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": question}]}
        ],
        "stream": stream,
    }


def _lookup_circular_citation(search_result_text: str) -> tuple[Optional[str], Optional[str]]:
    """Resolve circular_no/para_no for a Cortex Search result by exact-matching its
    text back to AI.REG_CHUNKS (the source of the search index)."""
    try:
        session = get_session()
        escaped = search_result_text.replace("'", "''")
        rows = session.sql(
            f"SELECT circular_no, para_no FROM AI.REG_CHUNKS WHERE text = '{escaped}' LIMIT 1"
        ).collect()
        if rows:
            return rows[0]["CIRCULAR_NO"], str(rows[0]["PARA_NO"])
    except Exception:
        pass
    return None, None


def _extract_from_content_items(content_items: list[dict]) -> dict:
    """Walk the final agent response's content array, extracting the answer text,
    tool call trace, verified-query badge/SQL, and citations."""
    answer_parts: list[str] = []
    tool_calls: list[dict] = []
    citations: list[dict] = []
    verified = False
    primary_sql: Optional[str] = None

    # types that are internal orchestration plumbing, not meaningful to surface
    NOISE_TOOL_TYPES = {"system_agentic_semantic_context", "server_skill", "data_to_chart"}

    for item in content_items:
        item_type = item.get("type")

        if item_type == "text":
            answer_parts.append(item.get("text", ""))
            for ann in item.get("annotations", []) or []:
                if ann.get("type") == "cortex_search_citation":
                    text = ann.get("text", "")
                    circular_no, para_no = _lookup_circular_citation(text)
                    citations.append({"circular_no": circular_no, "para_no": para_no, "text": text})

        elif item_type == "tool_use":
            tu = item.get("tool_use", {})
            tool_calls.append({
                "name": tu.get("name"),
                "type": tu.get("type"),
                "status": None,
                "summary": None,
                "_tool_use_id": tu.get("tool_use_id"),
            })

        elif item_type == "tool_result":
            tr = item.get("tool_result", {})
            name = tr.get("name")
            ttype = tr.get("type")
            status = tr.get("status")
            summary = None

            for c in tr.get("content", []) or []:
                if c.get("type") != "json":
                    continue
                j = c.get("json", {})
                if not isinstance(j, dict):
                    continue

                if j.get("verified_query_used"):
                    verified = True
                    if j.get("sql"):
                        primary_sql = j["sql"]
                elif primary_sql is None and j.get("sql") and status != "error":
                    primary_sql = j["sql"]

                if ttype == "cortex_search" and "search_results" in j:
                    n = len(j["search_results"])
                    summary = f"{n} search result(s)"
                    for sr in j["search_results"]:
                        text = sr.get("text", "")
                        circular_no, para_no = _lookup_circular_citation(text)
                        citations.append({"circular_no": circular_no, "para_no": para_no, "text": text})

                elif ttype == "system_execute_sql":
                    if "error" in j and j["error"]:
                        summary = f"SQL error: {j['error']}"
                    elif "execution_status" in j and "blocking validation error" in str(j.get("execution_status", "")):
                        summary = f"Validation error: {j['execution_status']}"
                    elif "result_set" in j:
                        n = j["result_set"].get("resultSetMetaData", {}).get("numRows", 0)
                        summary = f"SQL executed, {n} row(s)"

                elif j.get("execution_type") == "procedure":
                    summary = str(j.get("result", ""))[:500]

                elif "error" in j:
                    summary = f"Error: {j['error']}"

            # attach summary/status to the matching tool_use trace entry
            for tc in tool_calls:
                if tc.get("_tool_use_id") == tr.get("tool_use_id") and tc.get("summary") is None:
                    tc["status"] = status
                    tc["summary"] = summary
                    break

    # drop internal noise tool calls and the id helper field from the public trace
    visible_tool_calls = [
        {k: v for k, v in tc.items() if k != "_tool_use_id"}
        for tc in tool_calls
        if tc.get("type") not in NOISE_TOOL_TYPES
    ]

    # dedupe citations (same chunk can surface via both tool_result content and
    # text annotations, and across multiple search calls)
    seen = set()
    deduped_citations = []
    for c in citations:
        key = (c.get("circular_no"), c.get("para_no"), c.get("text"))
        if key not in seen:
            seen.add(key)
            deduped_citations.append(c)

    return {
        "answer": "".join(answer_parts).strip(),
        "tool_calls": visible_tool_calls,
        "citations": deduped_citations,
        "verified_query": verified,
        "sql": primary_sql,
    }


async def _stream_agent(question: str) -> AsyncIterator[str]:
    """Stream the agent's SSE events, normalized into: status, text_delta, tool_call,
    tool_result, done, error."""
    url = _agent_url()
    try:
        headers = _auth_headers("application/json, text/event-stream")
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
        return

    payload = _build_payload(question, stream=True)

    try:
        async with httpx.AsyncClient(timeout=240.0) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    yield f"event: error\ndata: {json.dumps({'message': body.decode()})}\n\n"
                    return

                current_event = "message"
                async for raw_line in response.aiter_lines():
                    if raw_line.startswith("event:"):
                        current_event = raw_line[len("event:"):].strip()
                    elif raw_line.startswith("data:"):
                        data = raw_line[len("data:"):].strip()
                        try:
                            payload_json = json.loads(data)
                        except json.JSONDecodeError:
                            continue

                        if current_event == "response.status":
                            yield f"event: status\ndata: {json.dumps(payload_json)}\n\n"
                        elif current_event == "response.text.delta":
                            yield f"event: text_delta\ndata: {json.dumps(payload_json)}\n\n"
                        elif current_event == "response.tool_use":
                            tu = payload_json
                            yield f"event: tool_call\ndata: {json.dumps({'name': tu.get('name'), 'type': tu.get('type'), 'input': tu.get('input')})}\n\n"
                        elif current_event == "response.tool_result":
                            extracted = _extract_from_content_items([{"type": "tool_result", "tool_result": payload_json}])
                            yield f"event: tool_result\ndata: {json.dumps({'name': payload_json.get('name'), 'type': payload_json.get('type'), 'status': payload_json.get('status'), 'citations': extracted['citations'], 'verified_query': extracted['verified_query'], 'sql': extracted['sql']})}\n\n"
                        elif current_event == "response":
                            final = _extract_from_content_items(payload_json.get("content", []))
                            final["question"] = question
                            final["warnings"] = [w.get("message", "") for w in payload_json.get("warnings", []) or []]
                            yield f"event: done\ndata: {json.dumps(final)}\n\n"
                        elif current_event == "error":
                            yield f"event: error\ndata: {json.dumps(payload_json)}\n\n"
                        # other event types (response.thinking*, response.text, response.chart,
                        # response.tool_result.status, response.suggested_queries) are intentionally
                        # not forwarded to keep the public stream small; the final `done` event
                        # carries the aggregated result.
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"


@router.post("/ask")
async def ask_question(request: AskRequest, stream: bool = False):
    """
    Ask KAVACH_AGENT a question.

    If stream=true, returns a normalized SSE stream (status, text_delta, tool_call,
    tool_result, done, error). Otherwise returns the complete parsed response.
    """
    if stream:
        return StreamingResponse(_stream_agent(request.question), media_type="text/event-stream")

    url = _agent_url()
    try:
        headers = _auth_headers("application/json")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    payload = _build_payload(request.question, stream=False)

    try:
        async with httpx.AsyncClient(timeout=240.0) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Agent error: {response.text}")

        body = response.json()
        extracted = _extract_from_content_items(body.get("content", []))
        warnings = [w.get("message", "") for w in body.get("warnings", []) or []]

        return AskResponse(
            question=request.question,
            answer=extracted["answer"],
            verified_query=extracted["verified_query"],
            sql=extracted["sql"],
            citations=[Citation(**c) for c in extracted["citations"]],
            tool_calls=[ToolCall(**tc) for tc in extracted["tool_calls"]],
            warnings=warnings,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process question: {type(e).__name__}: {str(e)}")
