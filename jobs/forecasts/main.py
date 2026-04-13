"""
BigQuery mart → forecast engine → BigQuery output job.
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
logger = logging.getLogger("forecasts")


def load_config() -> dict:
    config_path = Path(os.environ.get("JOB_CONFIG_PATH", "config/job_config.example.yml"))
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with open(config_path) as f:
        return yaml.safe_load(f)


def main() -> None:
    logger.info("start: forecast job")

    config = load_config()
    logger.info(
        "config loaded: project=%s mart=%s",
        config.get("bigquery", {}).get("project_id"),
        config.get("bigquery", {}).get("mart_dataset"),
    )

    # --- stub: import modules (real work after credentials are available) ---
    from src.mart_reader import MartReader  # noqa: F401
    from src.forecast_engine import ForecastEngine  # noqa: F401
    from src.results_writer import ResultsWriter  # noqa: F401

    logger.info("done: all modules initialised (stub mode, no real I/O performed)")


if __name__ == "__main__":
    main()
