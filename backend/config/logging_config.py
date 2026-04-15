import logging
import logging.handlers
import sys
from pathlib import Path

import structlog

LOGS_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_FILE = LOGS_DIR / "app.log"


def setup_logging(log_level: str = "info") -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    level = getattr(logging, log_level.upper(), logging.INFO)

    timestamper = structlog.processors.TimeStamper(fmt="iso")

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        timestamper,
    ]

    logging.basicConfig(
        level=level,
        format="%(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.handlers.RotatingFileHandler(
                LOG_FILE,
                maxBytes=5 * 1024 * 1024,
                backupCount=5,
                encoding="utf-8",
            ),
        ],
    )

    structlog.configure(
        processors=shared_processors
        + [
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
