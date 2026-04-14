# Regression Pilot

A dedicated regression prep tool for HCSS E360/Fleet Mobile releases. Connects to Jira to discover releases & tickets, uses Gemini AI to generate structured Zephyr Scale test cases, and pushes them back to Jira — all from a sleek glassmorphic desktop app.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Tauri Desktop Shell (native window)        │
│  ┌───────────────────────────────────────┐  │
│  │  React + TypeScript Frontend          │  │
│  │  - Glassmorphic obsidian UI           │  │
│  │  - Release/version picker             │  │
│  │  - Ticket browser & selector          │  │
│  │  - AI Chat panel (streaming)          │  │
│  │  - Test case preview & editor         │  │
│  └──────────────┬────────────────────────┘  │
│                 │ HTTP (localhost:8000)     │
│  ┌──────────────▼────────────────────────┐  │
│  │  Python FastAPI Backend               │  │
│  │  - Jira REST API v3 integration       │  │
│  │  - Zephyr Scale API integration       │  │
│  │  - Gemini 2.5 Flash (structured out)  │  │
│  │  - Local config/token storage         │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Desktop   | Tauri v2                            |
| Frontend  | React 18 + TypeScript + Vite        |
| Styling   | Tailwind CSS + custom glassmorphic  |
| Backend   | Python 3.11+ / FastAPI              |
| AI        | Google Gemini 2.5 Flash             |
| APIs      | Jira REST v3 + Zephyr Scale         |

## Gemini Features Used

- **Structured JSON Output** — `response_json_schema` guarantees valid JSON matching
  our test case schema. No parsing hacks, no retries. Gemini enforces the schema natively.
- **Async Streaming** — `client.aio.models.generate_content_stream` for real-time
  chat responses displayed character-by-character.
- **Large Context Window** — Feed entire release ticket batches (28+ tickets) in a
  single request for holistic analysis and deduplication.

## Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- **Rust** (for Tauri) — install via https://rustup.rs
- **Tauri CLI** — `cargo install tauri-cli`
- **Gemini API Key** — free at https://aistudio.google.com/apikey

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Jira credentials and Gemini API key
python main.py
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev          # Dev mode (browser at localhost:1420)
npm run tauri dev    # Dev mode (desktop app)
npm run tauri build  # Production build
```

## Features

- [x] Discover Jira projects and fix versions dynamically
- [x] Fetch all tickets under a release via JQL
- [x] AI-powered test case generation via Gemini (structured output)
- [x] Interactive streaming chat for refining test cases
- [x] Push test cases to Zephyr Scale
- [x] Glassmorphic obsidian dark UI
- [x] Secure local credential storage
