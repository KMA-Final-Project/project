from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qs, urlparse

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_TEST_MEDIA_MARKDOWN_PATH = PROJECT_ROOT / "test_medias.md"
DEFAULT_TARGET_LANGUAGE = "vi"


@dataclass(frozen=True)
class BenchmarkCase:
    case_id: str
    source_family: str
    target_lang: str
    source_url: str
    label: str
    notes: str


def load_test_media_urls(
    markdown_path: Path = DEFAULT_TEST_MEDIA_MARKDOWN_PATH,
) -> dict[str, tuple[str, ...]]:
    grouped_urls: dict[str, list[str]] = {}
    current_family: str | None = None

    for raw_line in markdown_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            current_family = line.lstrip("#").strip().lower()
            grouped_urls.setdefault(current_family, [])
            continue
        if not line.startswith("- "):
            continue
        if current_family is None:
            raise ValueError(
                f"Found media entry before any family heading in {markdown_path}"
            )

        value = line[2:].strip()
        if value[:1] in {'"', "'"} and value[-1:] == value[:1]:
            value = value[1:-1]
        grouped_urls[current_family].append(value)

    return {family: tuple(urls) for family, urls in grouped_urls.items()}


def _youtube_video_id(url: str) -> str:
    parsed_url = urlparse(url)
    host = parsed_url.netloc.lower()
    if host.endswith("youtu.be"):
        video_id = parsed_url.path.strip("/")
        if video_id:
            return video_id

    query_video_id = parse_qs(parsed_url.query).get("v", [])
    if query_video_id and query_video_id[0]:
        return query_video_id[0]

    path_parts = [part for part in parsed_url.path.split("/") if part]
    if path_parts:
        return path_parts[-1]

    raise ValueError(f"Could not determine YouTube video id from URL: {url}")


def _build_cases_for_family(
    family: str,
    urls: Iterable[str],
    *,
    target_lang: str,
) -> tuple[BenchmarkCase, ...]:
    cases: list[BenchmarkCase] = []
    for index, url in enumerate(urls, start=1):
        video_id = _youtube_video_id(url)
        case_id = f"{family}_{video_id}"
        label = f"{family.title()} YouTube case {index:02d}"
        notes = f"Generated from test_medias.md for {family} benchmark coverage."
        cases.append(
            BenchmarkCase(
                case_id=case_id,
                source_family=family,
                target_lang=target_lang,
                source_url=url,
                label=label,
                notes=notes,
            )
        )
    return tuple(cases)


def load_benchmark_cases(
    markdown_path: Path = DEFAULT_TEST_MEDIA_MARKDOWN_PATH,
    *,
    target_lang: str = DEFAULT_TARGET_LANGUAGE,
) -> tuple[BenchmarkCase, ...]:
    grouped_urls = load_test_media_urls(markdown_path)
    cases: list[BenchmarkCase] = []
    for family, urls in grouped_urls.items():
        cases.extend(_build_cases_for_family(family, urls, target_lang=target_lang))
    return tuple(cases)


TEST_MEDIA_URLS_BY_FAMILY = load_test_media_urls()
ENGLISH_TEST_MEDIA_URLS = TEST_MEDIA_URLS_BY_FAMILY.get("english", ())
CHINESE_TEST_MEDIA_URLS = TEST_MEDIA_URLS_BY_FAMILY.get("chinese", ())
