"""
middleware/request_logger.py
─────────────────────────────
Structured HTTP access log — one line per completed request.

PRINCIPAL DESIGN: Log at request *completion* (not start) to capture the full
lifecycle (method, path, status, duration) in one line rather than two
correlated-but-separate lines. Reduces log volume and query complexity.

The request_id is already in the ContextVar from RequestIdMiddleware,
so structlog automatically includes it — no explicit threading needed.
"""

from __future__ import annotations

import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from src.config.logging import get_logger

log = get_logger(__name__)


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """Log one structured line per HTTP request at completion."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: object) -> Response:
        start = time.monotonic()

        response: Response = await call_next(request)  # type: ignore[operator]

        duration_ms = round((time.monotonic() - start) * 1000, 2)

        # Determine log level: ERROR for 5xx, WARNING for 4xx, INFO otherwise
        status = response.status_code
        if status >= 500:
            log_fn = log.error
        elif status >= 400:
            log_fn = log.warning
        else:
            log_fn = log.info

        log_fn(
            "http_request",
            method=request.method,
            path=request.url.path,
            status_code=status,
            duration_ms=duration_ms,
            client_host=request.client.host if request.client else "unknown",
        )

        return response
