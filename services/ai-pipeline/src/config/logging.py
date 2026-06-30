"""
config/logging.py
─────────────────
structlog configuration for the AI pipeline service.

PRINCIPAL DESIGN DECISIONS:

1. request_id ContextVar: any log call anywhere in the call stack —
   deep inside gemini_client.py, with zero explicit parameter-passing —
   automatically includes the current request's ID. This is what makes
   a single meeting's full processing journey traceable end-to-end,
   the same observability bar already set by the Node.js side.

2. JSON renderer in production, human-readable in development:
   JSON output is designed for log aggregator ingestion (Axiom/Datadog).
   Console renderer is for local developer ergonomics.

3. service="ai-pipeline" on every log entry: distinguishes AI-pipeline
   logs from Node.js API logs in a shared log aggregation pipeline.

4. No print() rule: ruff T201 in pyproject.toml fails CI on any stray
   print() call — structured logging discipline enforced mechanically.
"""

from __future__ import annotations

import contextvars
import logging
import sys
from typing import Any

import structlog
from structlog.types import EventDict

from src.config.settings import get_settings

# ─── Request ID Context Variable ──────────────────────────────────────────────
# Declared here (not in middleware) so any module can import it.
# The request_id middleware sets this at the start of each request.
# Structlog reads it automatically via the context-var merger processor below.

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default="no-request-id"
)


# ─── Custom Processors ────────────────────────────────────────────────────────


def _inject_request_id(logger: Any, method: str, event_dict: EventDict) -> EventDict:  # noqa: ANN401
    """Inject the current request_id into every log record automatically."""
    event_dict["request_id"] = request_id_var.get()
    return event_dict


def _inject_service_name(logger: Any, method: str, event_dict: EventDict) -> EventDict:  # noqa: ANN401
    """Inject a static service field so log aggregators can filter by service."""
    event_dict["service"] = "ai-pipeline"
    return event_dict


# ─── Configuration ────────────────────────────────────────────────────────────


def configure_logging() -> None:
    """Configure structlog once at application startup (called from lifespan).

    Safe to call multiple times (structlog.configure() is idempotent in practice),
    but designed to be called exactly once from main.py's lifespan.
    """
    s = get_settings()
    is_production = s.environment == "production"

    # Shared processors that run for both structlog-native and stdlib-bridged log records
    # NOTE: add_logger_name is intentionally excluded — it requires a stdlib logger
    # (.name attribute) but PrintLoggerFactory produces a PrintLogger without .name.
    # Module names are already carried via get_logger(__name__) call sites.
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,  # Merge structlog contextvars
        _inject_request_id,                        # ContextVar-based request_id
        _inject_service_name,                      # Static "service" field
        structlog.stdlib.add_log_level,            # level: "info", "error", etc.
        structlog.processors.TimeStamper(fmt="iso", utc=True),  # timestamp in UTC ISO
        structlog.processors.StackInfoRenderer(),
    ]

    if is_production:
        # JSON for log aggregator ingestion — machine-readable, no ANSI codes
        renderer: Any = structlog.processors.JSONRenderer()
    else:
        # Human-readable with colors for local dev
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.processors.dict_tracebacks,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(s.log_level)
        ),
        context_class=dict,
        # PrintLoggerFactory: writes directly to stdout — no stdlib routing needed.
        # Using stdlib.LoggerFactory() would require add_logger_name (incompatible with PrintLogger).
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Bridge stdlib logging → structlog so third-party libs (uvicorn, motor)
    # have their logs rendered through the same pipeline
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.getLevelName(s.log_level),
    )

    # Silence noisy uvicorn access logs — we have our own request logger middleware
    logging.getLogger("uvicorn.access").disabled = True


def get_logger(name: str | None = None) -> structlog.BoundLogger:
    """Convenience factory — returns a structlog bound logger.

    Usage:
        log = get_logger(__name__)
        log.info("event", field="value")
    """
    return structlog.get_logger(name)
