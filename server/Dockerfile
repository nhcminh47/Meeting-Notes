FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install --no-cache-dir .

EXPOSE 8000

# GPU libraries are deliberately not required by this base image. A later ASR image may use an
# NVIDIA CUDA base while retaining a CPU-safe startup path.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
