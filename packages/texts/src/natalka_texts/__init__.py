"""Prompts, model access and the editor that checks what comes back."""

from .facts import fact_sheet
from .generate import Reading, SectionText, write_reading
from .providers import (
    AnthropicProvider,
    Completion,
    ModelUnavailableError,
    Provider,
    ScriptedProvider,
)
from .sections import SectionSpec, specs, title
from .validate import Report, check

__all__ = [
    "AnthropicProvider",
    "Completion",
    "ModelUnavailableError",
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
