# Stage 1: build the React frontend
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Build to a fixed output dir (overrides vite.config.js outDir)
RUN npx vite build --outDir /dist --emptyOutDir

# Stage 2: Python backend
FROM python:3.11-slim
WORKDIR /app

RUN pip install uv --quiet

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/ ./
COPY --from=frontend-build /dist ./static

EXPOSE 8080
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
