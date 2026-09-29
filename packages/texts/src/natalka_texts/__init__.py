"""Prompts, model access and the editor that checks what comes back."""

from .facts import fact_sheet, synastry_sheet
from .generate import Reading, SectionText, write_reading
from .providers import (
    Completion,
    ModelUnavailableError,
    OpenRouterProvider,
    Provider,
    ScriptedProvider,
)
from .sections import PREVIEW, PREVIEW_TITLES, PREVIEW_TITLES_NO_TIME, SectionSpec, specs, title
from .validate import Report, check

__all__ = [
    "PREVIEW",
    "PREVIEW_TITLES",
    "PREVIEW_TITLES_NO_TIME",
    "Completion",
    "ModelUnavailableError",
    "OpenRouterProvider",
    "Provider",
    "Reading",
    "Report",
    "ScriptedProvider",
    "SectionSpec",
    "SectionText",
    "check",
    "fact_sheet",
    "specs",
    "synastry_sheet",
    "title",
    "write_reading",
]
