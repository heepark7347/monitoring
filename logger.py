"""
Shared structured logger for all services (FastAPI, Agent, etc.)
Outputs JSON logs to both console and logs/error.log
"""

import json
import logging
import socket
import traceback
from datetime import datetime, timezone
from pathlib import Path


class JSONFormatter(logging.Formatter):
    """Formats log records as JSON for ELK/Grafana compatibility."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "hostname": socket.gethostname(),
            "service": record.name,
            "message": record.getMessage(),
        }

        # Attach GPU ID if provided via `extra={"gpu_id": ...}`
        if hasattr(record, "gpu_id"):
            payload["gpu_id"] = record.gpu_id

        # Attach exception info if present
        if record.exc_info:
            payload["error"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "detail": str(record.exc_info[1]),
                "traceback": traceback.format_exception(*record.exc_info),
            }

        return json.dumps(payload, ensure_ascii=False)


def get_logger(name: str = "gpu-monitor") -> logging.Logger:
    """
    Returns a named logger with JSON console + file handlers.

    Usage:
        logger = get_logger("fastapi-service")
        logger = get_logger("agent")
    """
    logger = logging.getLogger(name)

    if logger.handlers:
        # Avoid duplicate handlers on repeated calls
        return logger

    logger.setLevel(logging.DEBUG)

    formatter = JSONFormatter()

    # --- Console handler ---
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(formatter)

    # --- File handler (logs/error.log) ---
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    file_handler = logging.FileHandler(log_dir / "error.log", encoding="utf-8")
    file_handler.setLevel(logging.ERROR)  # Only ERROR+ goes to file
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger


# ---------------------------------------------------------------------------
# Convenience wrapper for GPU error logging
# ---------------------------------------------------------------------------

def log_gpu_error(
    logger: logging.Logger,
    message: str,
    gpu_id: int | str | None = None,
    exc_info: bool = True,
) -> None:
    """
    Log an error with an optional GPU ID attached.

    Args:
        logger:   Logger instance from get_logger()
        message:  Human-readable error description
        gpu_id:   GPU index or UUID (optional)
        exc_info: Whether to capture current exception info (default True)
    """
    extra = {"gpu_id": gpu_id} if gpu_id is not None else {}
    logger.error(message, exc_info=exc_info, extra=extra)


# ---------------------------------------------------------------------------
# Usage examples
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logger = get_logger("example-service")

    # --- Basic error ---
    try:
        result = 1 / 0
    except ZeroDivisionError:
        log_gpu_error(logger, "Division error during GPU metric calculation", gpu_id=0)

    # --- FastAPI style ---
    try:
        raise RuntimeError("CUDA out of memory")
    except RuntimeError:
        log_gpu_error(logger, "GPU memory error", gpu_id=2)

    # --- Without GPU ID ---
    try:
        raise ConnectionError("Cannot connect to monitoring agent")
    except ConnectionError:
        log_gpu_error(logger, "Agent connection failed")

    # --- Info/debug (console only, not written to error.log) ---
    logger.info("Service started", extra={"gpu_id": None})
