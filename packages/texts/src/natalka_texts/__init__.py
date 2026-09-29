"""Prompts, model access and the editor that checks what comes back."""

from .facts import fact_sheet
from .generate import Reading, SectionText, write_reading
from .providers import (
    Completion,
    ModelUnavailableError,
    OpenRouterProvider,
    Provider,
    ScriptedProvider,
)
from .sections import SectionSpec, specs, title
from .validate import Report, check

__all__ = [
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
    "title",
    "write_reading",
]
