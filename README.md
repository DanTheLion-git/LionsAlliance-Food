# 🦁 LionsAlliance Food Tracker

A Docker-based food tracking application designed for Raspberry Pi (ARM64). Track your groceries by uploading receipts, look up macros, manage your food inventory, build meals, and monitor your daily nutrition.

## Features

- **Receipt Upload**: Upload Jumbo PNG receipts (Dutch) or Netto PDF receipts (German) — parsed automatically via OCR/PDF extraction
- **Macro Lookup**: Automatic nutrition data via Open Food Facts
- **Food Catalog**: Browse, search, add, and edit food items with full macro info
- **Inventory**: Track what you have at home, linked to receipts
- **Meal Builder**: Create meals from ingredients (by grams or percentage), log servings
- **Nutrition Dashboard**: Daily macro summary with progress bars, 7-day calorie history chart

## Requirements

- Docker + Docker Compose (ARM64-compatible images used throughout)
- A Raspberry Pi (or any Linux/macOS/Windows machine with Docker)

## Getting Started

1. **Clone / copy** this folder onto your Pi.

2. **Create your `.env` file**:
   ```bash
   cp .env.example .env
   # Edit .env and change POSTGRES_PASSWORD to something secure
   ```

3. **Start all services**:
   ```bash
   docker compose up -d
   ```

4. **Access the app**:
   - Frontend: http://\<pi-ip\>:3000
   - Backend API docs: http://\<pi-ip\>:8000/docs

## Services

| Service  | Port | Description                     |
|----------|------|---------------------------------|
| db       | 5432 | PostgreSQL 16                   |
| backend  | 8000 | FastAPI + uvicorn               |
| frontend | 3000 | React app served via nginx      |

## Receipt Formats Supported

| Store | Format | Language | Parser          |
|-------|--------|----------|-----------------|
| Jumbo | PNG    | Dutch    | pytesseract OCR |
| Netto | PDF    | German   | pdfplumber      |

## Development

To rebuild after code changes:
```bash
docker compose build
docker compose up -d
```

To view logs:
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## Data Persistence

- PostgreSQL data: stored in the `postgres_data` Docker volume
- Uploaded receipts: stored in `./Uploads/` (bind-mounted into the backend container)
