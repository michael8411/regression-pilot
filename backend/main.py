"""Regression Pilot — FastAPI Backend.

Serves the Tauri/React frontend with Jira, Zephyr Scale, and Gemini AI endpoints.
"""

import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import get_settings
import jira_service
import ai_service
import zephyr_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configured = bool(settings.jira_base_url and settings.jira_email and settings.jira_api_token)
    print(f"Regression Pilot backend starting...")
    print(f"  Jira configured: {configured}")
    print(f"  Gemini configured: {bool(settings.gemini_api_key)}")
    print(f"  Zephyr configured: {bool(settings.zephyr_api_token)}")
    yield
    print("Shutting down...")


app = FastAPI(
    title="Regression Pilot",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["tauri://localhost", "http://localhost:5173", "http://localhost:1420"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    settings = get_settings()
    return {
        "status": "ok",
        "jira_configured": bool(settings.jira_base_url and settings.jira_api_token),
        "ai_configured": bool(settings.gemini_api_key),
        "zephyr_configured": bool(settings.zephyr_api_token),
    }


@app.get("/config/status")
async def config_status():
    """Check which services are configured (no secrets exposed)."""
    settings = get_settings()
    return {
        "jira": {
            "configured": bool(settings.jira_base_url and settings.jira_api_token),
            "base_url": settings.jira_base_url or None,
            "email": settings.jira_email or None,
        },
        "ai": {"configured": bool(settings.gemini_api_key)},
        "zephyr": {"configured": bool(settings.zephyr_api_token)},
    }


@app.get("/jira/projects")
async def list_projects():
    """List all accessible Jira projects."""
    try:
        return await jira_service.get_projects()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Jira API error: {str(e)}")


@app.get("/jira/projects/{project_key}/versions")
async def list_versions(
    project_key: str,
    status: str = "unreleased",
    order_by: str = "-releaseDate",
):
    """List fix versions (releases) for a project."""
    try:
        return await jira_service.get_versions(project_key, status=status, order_by=order_by)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Jira API error: {str(e)}")


@app.get("/jira/tickets")
async def get_tickets(fix_version: str):
    """Fetch all tickets under a fix version."""
    try:
        return await jira_service.get_tickets_by_version(fix_version)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Jira API error: {str(e)}")


class TicketKeysRequest(BaseModel):
    keys: list[str]


@app.post("/jira/tickets/by-keys")
async def get_tickets_by_keys(req: TicketKeysRequest):
    """Fetch specific tickets by their keys."""
    try:
        return await jira_service.get_tickets_by_keys(req.keys)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Jira API error: {str(e)}")


class GenerateRequest(BaseModel):
    tickets: list[dict]
    instructions: str = ""

class GroupTicketsRequest(BaseModel):
    tickets: list[dict]


@app.post("/ai/generate")
async def generate_test_cases(req: GenerateRequest):
    """Generate test cases for selected tickets using Gemini with structured output."""
    try:
        return await ai_service.generate_test_cases(req.tickets, req.instructions)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini error: {str(e)}")

@app.post("/ai/group-tickets")
async def group_tickets(req: GroupTicketsRequest):
    """Group selected tickets into practical regression themes."""
    try:
        return await ai_service.group_tickets_semantic(req.tickets)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini error: {str(e)}")


class ChatRequest(BaseModel):
    messages: list[dict]
    tickets: list[dict] | None = None


@app.post("/ai/chat")
async def chat(req: ChatRequest):
    """Send a chat message to Gemini with optional ticket context."""
    try:
        response = await ai_service.chat_message(req.messages, req.tickets)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini error: {str(e)}")


@app.post("/ai/chat/stream")
async def chat_stream(req: ChatRequest):
    """Stream a chat response from Gemini."""
    async def event_generator():
        try:
            async for text in ai_service.stream_chat_message(req.messages, req.tickets):
                yield f"data: {json.dumps({'text': text})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.get("/zephyr/folders/{project_key}")
async def list_folders(project_key: str):
    """List test case folders in Zephyr Scale."""
    try:
        return await zephyr_service.get_folders(project_key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Zephyr API error: {str(e)}")


class PushTestCasesRequest(BaseModel):
    project_key: str
    test_cases: list[dict]
    folder_id: int | None = None


@app.post("/zephyr/push")
async def push_test_cases(req: PushTestCasesRequest):
    """Push generated test cases to Zephyr Scale."""
    try:
        results = await zephyr_service.create_test_cases_bulk(
            project_key=req.project_key,
            test_cases=req.test_cases,
            folder_id=req.folder_id,
        )
        return {
            "created": len(results),
            "test_cases": results,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Zephyr API error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run("main:app", host="127.0.0.1", port=settings.backend_port, reload=True)
