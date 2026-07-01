"""
services/cleanup/__init__.py
─────────────────────────────
Public surface of the cleanup service package.

Only clean_transcript is exported — internal helpers stay internal.
"""

from src.services.cleanup.transcript_cleaner import clean_transcript

__all__ = ["clean_transcript"]
