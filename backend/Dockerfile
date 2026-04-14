FROM python:3.12-slim

# Install tesseract and poppler for OCR/PDF
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-nld \
    tesseract-ocr-deu \
    libpoppler-cpp-dev \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN alembic upgrade head || true

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
