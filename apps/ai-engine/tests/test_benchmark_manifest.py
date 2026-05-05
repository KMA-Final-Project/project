from __future__ import annotations

from src.scripts.benchmark_manifest import load_benchmark_cases, load_test_media_urls


def test_load_benchmark_cases_reads_all_test_media_groups(tmp_path) -> None:
    test_media_path = tmp_path / "test_medias.md"
    test_media_path.write_text(
        "\n".join(
            [
                "# English",
                "",
                '- "https://youtu.be/englishA01"',
                '- "https://www.youtube.com/watch?v=englishB02"',
                "",
                "# Chinese",
                "",
                '- "https://youtu.be/chineseC03"',
            ]
        ),
        encoding="utf-8",
    )

    grouped_urls = load_test_media_urls(test_media_path)
    benchmark_cases = load_benchmark_cases(test_media_path)

    assert grouped_urls["english"] == (
        "https://youtu.be/englishA01",
        "https://www.youtube.com/watch?v=englishB02",
    )
    assert grouped_urls["chinese"] == ("https://youtu.be/chineseC03",)

    assert [case.case_id for case in benchmark_cases] == [
        "english_englishA01",
        "english_englishB02",
        "chinese_chineseC03",
    ]
    assert benchmark_cases[0].source_url == "https://youtu.be/englishA01"
    assert benchmark_cases[0].target_lang == "vi"
