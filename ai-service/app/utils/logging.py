"""Structured logging setup.

One call, at process startup (see app/main.py), configures every
logger in the process consistently - no per-module logging.basicConfig
calls scattered around the codebase.
"""

import logging
import sys


class _RequestIdFilter(logging.Filter):
    """Ensures every log record has a request_id field, even ones logged
    outside of a request context (startup, background tasks)."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.setLevel(level.upper())

    handler = logging.StreamHandler(stream=sys.stdout)
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | req=%(request_id)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    handler.setFormatter(formatter)
    handler.addFilter(_RequestIdFilter())

    root.handlers.clear()
    root.addHandler(handler)

    # Quiet down noisy third-party loggers unless we're debugging.
    if level.upper() != "DEBUG":
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("kubernetes").setLevel(logging.WARNING)
        logging.getLogger("azure").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
