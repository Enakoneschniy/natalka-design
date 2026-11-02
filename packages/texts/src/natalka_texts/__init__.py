"""Prompts, model access and the editor that checks what comes back."""

from .facts import fact_sheet, synastry_sheet
from .generate import Reading, SectionText, write_horoscope, write_reading
from .providers import (
    AnthropicProvider,
    Completion,
    FallbackProvider,
    ModelUnavailableError,
    OpenRouterProvider,
    Provider,
    ScriptedProvider,
    default_provider,
)
from .sections import (
    PREVIEW,
    PREVIEW_NO_TIME,
    PREVIEW_SYNASTRY,
    PREVIEW_TITLES,
    PREVIEW_TITLES_NO_TIME,
    PREVIEW_TITLES_SYNASTRY,
    SectionSpec,
    specs,
    title,
)
from .validate import Report, check

__all__ = [
    "PREVIEW",
    "PREVIEW_NO_TIME",
    "PREVIEW_SYNASTRY",
    "PREVIEW_TITLES",
    "PREVIEW_TITLES_NO_TIME",
    "PREVIEW_TITLES_SYNASTRY",
    "AnthropicProvider",
    "Completion",
    "FallbackProvider",
    "ModelUnavailableError",
    "OpenRouterProvider",
    "Provider",
    "Reading",
    "Report",
    "ScriptedProvider",
    "SectionSpec",
    "SectionText",
    "check",
    "default_provider",
    "fact_sheet",
    "specs",
    "synastry_sheet",
    "title",
    "write_horoscope",
    "write_reading",
]
