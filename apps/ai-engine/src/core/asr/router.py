from __future__ import annotations

from dataclasses import dataclass

from src.config import settings
from src.core.asr.base import ASRRouteConfig, ASRRouteDecision

_ROUTE_ALIASES: dict[str, str] = {
    "turbo": "whisper_turbo",
    "full": "whisper_full",
    "distil": "distil_whisper_en",
    "distil_en": "distil_whisper_en",
    "sensevoice": "sensevoice_small",
    "paraformer": "paraformer_zh",
}


@dataclass(slots=True)
class ASRRouter:
    routes: dict[str, ASRRouteConfig]

    def allowed_route_ids(self) -> tuple[str, ...]:
        mode = str(settings.WORKER_MODEL_MODE or "auto").strip().lower()
        allowed = [
            route_id
            for route_id, route in self.routes.items()
            if mode in route.worker_modes
        ]
        return tuple(allowed or self.routes.keys())

    def canonicalize(self, route_id: str | None) -> str:
        normalized = settings.normalize_route_id(route_id)
        return _ROUTE_ALIASES.get(normalized, normalized)

    def route_for_language(self, language: str | None) -> str:
        if settings.asr_force_route:
            return settings.asr_force_route

        normalized = settings.normalize_language_tag(language)
        if not settings.AI_ASR_ROUTING_ENABLED:
            return "whisper_full" if self._is_cjk_language(normalized) else "whisper_turbo"

        base = normalized.split("-")[0] if normalized else ""
        if base == "en":
            return settings.asr_default_route_en
        if normalized == "yue" or base in {"zh", "ja", "ko"}:
            if base == "zh" and settings.AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE:
                return settings.asr_experimental_route_zh
            if normalized == "yue" and settings.AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE:
                return settings.asr_experimental_route_zh
            return settings.asr_default_route_zh
        return settings.asr_fallback_route_en

    def resolve_route(self, route_id: str | None) -> str:
        requested = self.canonicalize(route_id)
        allowed = set(self.allowed_route_ids())

        if requested in self.routes and requested in allowed:
            return requested

        for fallback_route in self.fallback_chain(requested):
            if fallback_route in allowed:
                return fallback_route

        default_fallback = self.canonicalize(settings.asr_fallback_route_en)
        if default_fallback in self.routes and default_fallback in allowed:
            return default_fallback

        return next(iter(allowed))

    def fallback_chain(self, route_id: str | None) -> tuple[str, ...]:
        canonical = self.canonicalize(route_id)
        visited: set[str] = set()
        ordered: list[str] = []

        def _visit(current: str) -> None:
            if current in visited or current not in self.routes:
                return
            visited.add(current)
            ordered.append(current)
            for fallback_route in self.routes[current].fallback_route_ids:
                _visit(self.canonicalize(fallback_route))

        _visit(canonical)
        return tuple(ordered)

    def decision_for_language(
        self,
        language: str | None,
        *,
        requested_policy: str,
        route_override: str | None = None,
    ) -> ASRRouteDecision:
        requested_route = self.canonicalize(route_override) or self.route_for_language(
            language
        )
        resolved_route = self.resolve_route(requested_route)
        route = self.routes[resolved_route]
        normalized_policy = self._normalize_policy(requested_policy)
        auto_downgraded = (
            normalized_policy == "during_asr"
            and not route.during_asr_certified
            and settings.AI_ASR_ALLOW_AUTO_POLICY_DOWNGRADE
        )
        effective_policy = "after_asr" if auto_downgraded else normalized_policy
        return ASRRouteDecision(
            route_id=resolved_route,
            provider_id=route.provider_id,
            model_id=route.model_id,
            requested_policy=normalized_policy,
            effective_policy=effective_policy,
            auto_downgraded=auto_downgraded,
            during_asr_certified=route.during_asr_certified,
            fallback_chain=self.fallback_chain(resolved_route),
        )

    @staticmethod
    def _normalize_policy(policy: str | None) -> str:
        value = str(policy or "during_asr").strip().lower()
        if value not in {"during_asr", "after_asr"}:
            return "during_asr"
        return value

    @staticmethod
    def _is_cjk_language(language: str) -> bool:
        if not language:
            return False
        base = language.split("-")[0]
        return language == "yue" or base in {"zh", "ja", "ko"}

