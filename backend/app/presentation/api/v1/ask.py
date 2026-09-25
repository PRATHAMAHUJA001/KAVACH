"""
Ask endpoint - Cortex Analyst with SSE streaming
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import httpx
from typing import AsyncIterator
from app.infrastructure.config.settings import settings

router = APIRouter()

DEFAULT_SEMANTIC_VIEW = "KAVACH_DB.AI.KAVACH_SV"


class AskRequest(BaseModel):
    """Ask request model"""
    question: str
    semantic_view: str = DEFAULT_SEMANTIC_VIEW


class AskResponse(BaseModel):
    """Ask response model (for non-streaming)"""
    question: str
    text: str
    sql: str
    verified_query: bool
    citations: list[str]


def _get_auth_token() -> str:
    """Programmatic access token used to authenticate REST calls to Cortex Analyst"""
    if settings.snowflake_token:
        return settings.snowflake_token
    raise RuntimeError("SNOWFLAKE_TOKEN (programmatic access token) is not configured")


def _build_payload(question: str, semantic_view: str, stream: bool) -> dict:
    return {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": question}
                ]
            }
        ],
        "semantic_view": semantic_view,
        "stream": stream,
    }


def _extract_from_message(message: dict) -> tuple[str, str, bool, list[str]]:
    """Extract text, sql, verified-query badge and citations from an analyst message"""
    text = ""
    sql_text = ""
    verified = False
    citations: list[str] = []

    for block in message.get("content", []):
        block_type = block.get("type")
        if block_type == "text":
            text += block.get("text", "")
        elif block_type == "sql":
            sql_text = block.get("statement", "")
            confidence = block.get("confidence") or {}
            vqu = confidence.get("verified_query_used")
            if vqu:
                verified = True
                citations.append(f"Verified query: {vqu.get('name', '')} — {vqu.get('question', '')}")

    return text, sql_text, verified, citations


async def stream_cortex_analyst(question: str, semantic_view: str) -> AsyncIterator[str]:
    """Stream Cortex Analyst responses via SSE, re-emitting Cortex's own SSE events"""

    url = f"https://{settings.snowflake_account}.snowflakecomputing.com/api/v2/cortex/analyst/message"

    try:
        token = _get_auth_token()
    except Exception as e:
        yield f"data: {json.dumps({'error': f'Failed to obtain session token: {e}'})}\n\n"
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
        "Accept": "application/json, text/event-stream",
    }

    payload = _build_payload(question, semantic_view, stream=True)

    try:
        async with httpx.AsyncClient() as client:
            async with client.stream("POST", url, json=payload, headers=headers, timeout=60.0) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    yield f"data: {json.dumps({'error': error_body.decode()})}\n\n"
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
                        yield f"event: {current_event}\ndata: {json.dumps(payload_json)}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@router.post("/ask")
async def ask_question(request: AskRequest, stream: bool = False):
    """
    Ask a question to Cortex Analyst over the KAVACH semantic view.

    If stream=true, returns SSE stream of Cortex Analyst's native events
    (status, message.content.delta, warnings, response_metadata, done).
    Otherwise returns the complete parsed response.
    """

    if stream:
        return StreamingResponse(
            stream_cortex_analyst(request.question, request.semantic_view),
            media_type="text/event-stream"
        )

    url = f"https://{settings.snowflake_account}.snowflakecomputing.com/api/v2/cortex/analyst/message"

    try:
        token = _get_auth_token()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to obtain session token: {e}")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
        "Accept": "application/json",
    }

    payload = _build_payload(request.question, request.semantic_view, stream=False)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=60.0)

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Cortex Analyst error: {response.text}"
            )

        body = response.json()
        message = body.get("message", {})
        text, sql_text, verified, citations = _extract_from_message(message)

        return AskResponse(
            question=request.question,
            text=text,
            sql=sql_text,
            verified_query=verified,
            citations=citations
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process question: {str(e)}")
