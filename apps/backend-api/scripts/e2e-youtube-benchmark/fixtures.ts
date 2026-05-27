import { readFileSync } from 'node:fs';

import type { BenchmarkOptions, CaseDefinition, SourceLanguage } from './types';

export function loadCaseDefinitions(markdownPath: string): CaseDefinition[] {
  const markdown = readFileSync(markdownPath, 'utf8');
  const cases: CaseDefinition[] = [];
  let currentFamily: 'english' | 'chinese' | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('#')) {
      const heading = line.replace(/^#+\s*/, '').trim().toLowerCase();
      if (heading === 'english' || heading === 'chinese') {
        currentFamily = heading;
      } else {
        currentFamily = null;
      }
      continue;
    }
    if (!currentFamily || !line.startsWith('- ')) {
      continue;
    }

    let url = line.slice(2).trim();
    if (
      (url.startsWith('"') && url.endsWith('"')) ||
      (url.startsWith("'") && url.endsWith("'"))
    ) {
      url = url.slice(1, -1);
    }

    const sourceLanguage: SourceLanguage =
      currentFamily === 'english' ? 'en' : 'zh';
    const videoId = extractYoutubeVideoId(url);

    cases.push({
      caseId: `${currentFamily}_${videoId}`,
      family: currentFamily,
      sourceLanguage,
      url,
    });
  }

  return cases;
}

export function resolveSelectedCases(
  allCases: CaseDefinition[],
  options: BenchmarkOptions,
): CaseDefinition[] {
  if (options.caseIds.length === 0) {
    return allCases;
  }

  const caseMap = new Map(allCases.map((entry) => [entry.caseId, entry]));
  return options.caseIds.map((caseId) => {
    const found = caseMap.get(caseId);
    if (!found) {
      throw new Error(`Unknown case id: ${caseId}`);
    }
    return found;
  });
}

export function extractYoutubeVideoId(url: string): string {
  const parsed = new URL(url);
  const videoId = parsed.searchParams.get('v');
  if (videoId) {
    return videoId;
  }
  const fallback = parsed.pathname.split('/').filter(Boolean).pop();
  if (fallback) {
    return fallback;
  }
  throw new Error(`Could not determine YouTube video id from URL: ${url}`);
}
