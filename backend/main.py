from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.ai_routes import router as ai_router
from api.config_routes import router as config_router
from api.health_routes import router as health_router
from api.jira_routes import router as jira_router
from api.zephyr_routes import router as zephyr_router
from config.settings import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configured = bool(settings.jira_base_url and settings.jira_email and settings.jira_api_token)
    print("Regression Pilot backend starting...")
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

app.include_router(health_router)
app.include_router(config_router)
app.include_router(jira_router)
app.include_router(ai_router)
app.include_router(zephyr_router)


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run("main:app", host="127.0.0.1", port=settings.backend_port, reload=True)
