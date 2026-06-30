"""
middleware/error_handler.py
────────────────────────────
Global exception → ErrorEnvelope mapping.

PRINCIPAL DESIGN:
1. Typed handler for AIPipelineError (and its whole hierarchy) — each subclass
   already carries http_status and error_code, so the handler doesn't need to
   introspect string messages. Typed exceptions, not string-matched exceptions.

2. Catch-all handler for genuinely unexpected errors — maps to 500 ErrorEnvelope
   but NEVER leaks a raw Python traceback into the HTTP response body.
   Defense in depth: "it's not public" is not a substitute for "it's secure".
   Stack traces expose file paths, internal hostnames, dependency versions.

3. Both handlers log the full exception + stack trace via structlog for
   internal observability — the response is sanitized, the logs are not.
"""

from __future__ import annotations

import traceback

from fastapi import Request
from fastapi.responses import JSONResponse

from src.config.logging import get_logger, request_id_var
from src.models.common import ErrorEnvelope
from src.models.exceptions import AIPipelineError

log = get_logger(__name__)


async def ai_pipeline_error_handler(request: Request, exc: AIPipelineError) -> JSONResponse:
    """Handle all AIPipelineError subclasses with their typed HTTP status codes."""
    request_id = request_id_var.get()

    log.error(
        "ai_pipeline_error",
        error_code=exc.error_code,
        message=exc.message,
        exception_type=type(exc).__name__,
        context=exc.context,
        path=str(request.url.path),
    )

    envelope = ErrorEnvelope(
        error_code=exc.error_code,
        message=exc.message,
        request_id=request_id,
        details=exc.context if exc.context else None,
    )

    return JSONResponse(
        status_code=exc.http_status,
        content=envelope.model_dump(),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unexpected exceptions.

    SECURITY: Never includes raw traceback in response body, even on an internal
    service. The full traceback is logged internally for debugging.
    """
    request_id = request_id_var.get()

    # Log full traceback internally
    log.error(
        "unhandled_exception",
        exception_type=type(exc).__name__,
        message=str(exc),
        traceback=traceback.format_exc(),
        path=str(request.url.path),
    )

    # Return sanitized error — no traceback, no internal details
    envelope = ErrorEnvelope(
        error_code="INTERNAL_ERROR",
        message="An unexpected internal error occurred. Please try again or contact support.",
        request_id=request_id,
        details=None,  # Deliberately no details — defense in depth
    )

    return JSONResponse(
        status_code=500,
        content=envelope.model_dump(),
    )
