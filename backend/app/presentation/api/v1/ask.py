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


class AskRequest(BaseModel):
    """Ask request model"""
    question: str
    semantic_model: str = "AI.RISK_SEMANTIC_MODEL"


class AskResponse(BaseModel):
    """Ask response model (for non-streaming)"""
    question: str
    sql: str
    data: list[dict]
    verified_query: bool
    citations: list[str]


async def stream_cortex_analyst(question: str, semantic_model: str) -> AsyncIterator[str]:
    """Stream Cortex Analyst responses via SSE"""
    
    # Cortex Analyst REST API endpoint
    url = f"https://{settings.snowflake_account}.snowflakecomputing.com/api/v2/cortex/analyst/message"
    
    headers = {
        "Authorization": f"Bearer {settings.snowflake_token}",
        "Content-Type": "application/json",
        "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT"
    }
    
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": question
                    }
                ]
            }
        ],
        "semantic_model": semantic_model
    }
    
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream("POST", url, json=payload, headers=headers, timeout=60.0) as response:
                if response.status_code != 200:
                    error_msg = await response.aread()
                    yield f"data: {json.dumps({'error': error_msg.decode()})}\n\n"
                    return
                
                verified_query = False
                sql_text = ""
                citations = []
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        
                        try:
                            event = json.loads(data)
                            
                            # Check for verified query badge in trace
                            if "trace" in event:
                                trace = event["trace"]
                                if "verified_query" in trace:
                                    verified_query = trace["verified_query"]
                            
                            # Extract SQL
                            if "sql" in event:
                                sql_text = event["sql"]
                            
                            # Extract citations
                            if "citations" in event:
                                citations = event["citations"]
                            
                            # Add verified query badge to the event
                            event["verified_query"] = verified_query
                            
                            yield f"data: {json.dumps(event)}\n\n"
                        except json.JSONDecodeError:
                            continue
                
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@router.post("/ask")
async def ask_question(request: AskRequest, stream: bool = False):
    """
    Ask a question to Cortex Analyst
    
    If stream=true, returns SSE stream
    Otherwise returns complete response
    """
    
    if stream:
        return StreamingResponse(
            stream_cortex_analyst(request.question, request.semantic_model),
            media_type="text/event-stream"
        )
    
    # Non-streaming response (for testing)
    try:
        from app.infrastructure.snowflake.connection import get_session
        session = get_session()
        
        # Call Cortex Analyst via SQL
        sql = f"""
            SELECT SNOWFLAKE.CORTEX.COMPLETE(
                'llama3.1-8b',
                'Convert this question to SQL for the KAVACH database: {request.question}'
            )
        """
        
        result = session.sql(sql).collect()
        generated_sql = result[0][0] if result else "SELECT 1"
        
        return AskResponse(
            question=request.question,
            sql=generated_sql,
            data=[],
            verified_query=False,
            citations=[]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process question: {str(e)}")
