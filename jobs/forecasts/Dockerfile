FROM python:3.12-slim

WORKDIR /app

# statsmodels requires numpy/scipy build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY jobs/forecasts/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY jobs/forecasts/ ./
COPY dbt ./dbt

ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]
