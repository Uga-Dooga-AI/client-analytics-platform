"""
AppMetrica Logs API → GCS → BigQuery ingestion job.
Entry point for Cloud Run Job execution.
"""

import logging
import os
import sys
import yaml
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("ingestion")


def load_config() -> dict:
    config_path = Path(os.environ.get("JOB_CONFIG_PATH", "config/job_config.example.yml"))
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with open(config_path) as f:
        return yaml.safe_load(f)


def main() -> None:
    logger.info("start: AppMetrica ingestion job")

    config = load_config()
    logger.info("config loaded: app_ids=%s", config.get("appmetrica", {}).get("app_ids", []))

    # --- stub: import modules (real work after credentials are available) ---
    from src.appmetrica_client import AppMetricaClient  # noqa: F401
    from src.gcs_uploader import GCSUploader  # noqa: F401
    from src.bq_loader import BQLoader  # noqa: F401

    logger.info("done: all modules initialised (stub mode, no real I/O performed)")


if __name__ == "__main__":
    main()
