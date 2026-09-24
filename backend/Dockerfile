FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY . /app/
RUN python3 scripts/seed_db.py
ENV DB_TYPE=sqlite
ENV DB_PATH=/data/blog.db
ENV REDIS_ENABLED=false
ENV PYTHONUNBUFFERED=1
ENV DEBUG=false
RUN mkdir -p /app/uploads
HEALTHCHECK --interval=300s --timeout=10s --start-period=20s --retries=3 CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/health', timeout=5).read()" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
