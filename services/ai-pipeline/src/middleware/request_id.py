"""
middleware/request_id.py
────────────────────────
X-Request-ID injection and propagation middleware.

PRINCIPAL DESIGN:
- Reads inbound X-Request-ID if present (propagated from Node.js API,
  which already generates req_{cuid} per the platform's existing convention).
- Generates a new UUID if absent.
- Sets the request_id ContextVar (imported from config/logging.py) so
  every structlog call in the request's lifecycle carries the ID automatically.
- Echoes the request_id back on the response header for client-side correlation.

This is what stitches a single meeting's full processing trace across both
the Node.js and Python services in shared logs.

IMPLEMENTATION NOTE: Pure ASGI middleware (not BaseHTTPMiddleware) for lower
overhead — BaseHTTPMiddleware has a known double-wrapping overhead on some
Starlette versions for streaming responses.
"""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from src.config.logging import request_id_var

_REQUEST_ID_HEADER = "X-Request-Id"


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Inject or propagate X-Request-ID header, bind to structlog ContextVar."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: object) -> Response:
        # Preserve inbound request_id (from Node.js) or generate fresh UUID
        inbound = request.headers.get(_REQUEST_ID_HEADER)
        request_id = inbound if inbound else f"py-{uuid.uuid4().hex}"

        # Bind to ContextVar — all structlog calls in this request's stack
        # automatically include this value without explicit parameter passing
        token = request_id_var.set(request_id)

        try:
            response: Response = await call_next(request)  # type: ignore[operator]
            response.headers[_REQUEST_ID_HEADER] = request_id
            return response
        finally:
            # Always reset the ContextVar — prevents leakage between requests
            # in async contexts where coroutines may be reused
            request_id_var.reset(token)
