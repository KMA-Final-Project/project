import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';

import type {
  SourceLanguage,
  SubtitleDownloadResult,
  SubtitleSelection,
} from './types';
import { round } from './utils';

const execFileAsync = promisify(execFile);
const DEFAULT_YOUTUBE_EXTRACTOR_ARGS = 'youtube:player_client=android';

type YtDlpSubtitleInfo = {
  ext?: string;
  url?: string;
};

type YtDlpMetadata = {
  subtitles?: Record<string, YtDlpSubtitleInfo[]>;
  automatic_captions?: Record<string, YtDlpSubtitleInfo[]>;
};

type SubtitleClient = {
  resolveManualSubtitle(
    url: string,
    sourceLanguage: SourceLanguage,
  ): Promise<SubtitleSelection | null>;
  downloadManualSubtitle(
    url: string,
    sourceLanguage: SourceLanguage,
    outputDirectory: string,
  ): Promise<SubtitleDownloadResult | null>;
};

export function createSubtitleClient(): SubtitleClient {
  return {
    async resolveManualSubtitle(
      url: string,
      sourceLanguage: SourceLanguage,
    ): Promise<SubtitleSelection | null> {
      const metadata = await fetchSubtitleMetadata(url);
      return selectManualSubtitle(metadata, sourceLanguage);
    },
    async downloadManualSubtitle(
      url: string,
      sourceLanguage: SourceLanguage,
      outputDirectory: string,
    ): Promise<SubtitleDownloadResult | null> {
      const startedAt = Date.now();
      const metadata = await fetchSubtitleMetadata(url);
      const selection = await resolveDownloadSelection(
        metadata,
        url,
        sourceLanguage,
        outputDirectory,
      );
      if (!selection) {
        return null;
      }
      return {
        subtitlePath: selection.subtitlePath,
        languageTag: selection.languageTag,
        format: selection.subtitlePath.split('.').pop() ?? 'unknown',
        availableManualTags: selection.availableManualTags,
        availableAutomaticTags: selection.availableAutomaticTags,
        cueTexts: selection.cueTexts,
        acquisitionSeconds: round((Date.now() - startedAt) / 1000, 3),
      };
    },
  };
}

async function fetchSubtitleMetadata(url: string): Promise<YtDlpMetadata> {
  const args = ['--dump-single-json', '--skip-download', '--no-update', url];
  const { stdout } = await runYtDlp(args);
  return JSON.parse(stdout) as YtDlpMetadata;
}

function selectManualSubtitle(
  metadata: YtDlpMetadata,
  sourceLanguage: SourceLanguage,
): SubtitleSelection | null {
  const availableManualTags = Object.keys(metadata.subtitles ?? {});
  const availableAutomaticTags = Object.keys(metadata.automatic_captions ?? {});
  const preferredTags = preferredSubtitleTags(sourceLanguage);

  const exactTag = preferredTags.find((tag) => availableManualTags.includes(tag));
  if (exactTag) {
    return {
      languageTag: exactTag,
      availableManualTags,
      availableAutomaticTags,
    };
  }

  const prefixMatch = availableManualTags.find((tag) =>
    preferredTags.some((preferred) => tag === preferred || tag.startsWith(`${preferred}-`)),
  );
  if (prefixMatch) {
    return {
      languageTag: prefixMatch,
      availableManualTags,
      availableAutomaticTags,
    };
  }

  return null;
}

function preferredSubtitleTags(sourceLanguage: SourceLanguage): string[] {
  if (sourceLanguage === 'en') {
    return ['en'];
  }
  return ['zh-Hans', 'zh-CN', 'zh', 'zh-Hant', 'zh-TW'];
}

async function resolveDownloadSelection(
  metadata: YtDlpMetadata,
  url: string,
  sourceLanguage: SourceLanguage,
  outputDirectory: string,
): Promise<
  | (SubtitleSelection & {
      subtitlePath: string;
      cueTexts: string[];
    })
  | null
> {
  const selection = selectManualSubtitle(metadata, sourceLanguage);
  if (!selection) {
    return null;
  }

  if (sourceLanguage !== 'zh') {
    const downloaded = await downloadSubtitleTrack(
      url,
      selection.languageTag,
      outputDirectory,
      'ground-truth',
    );
    return {
      ...selection,
      subtitlePath: downloaded.subtitlePath,
      cueTexts: extractCueTexts(readFileSync(downloaded.subtitlePath, 'utf8'), sourceLanguage),
    };
  }

  const candidateTags = collectChineseCandidateTags(selection.availableManualTags);
  let bestCandidate: {
    languageTag: string;
    subtitlePath: string;
    cueTexts: string[];
    score: number;
  } | null = null;

  for (const languageTag of candidateTags) {
    const stem = `candidate-${sanitizeForFilename(languageTag)}`;
    let downloaded: { subtitlePath: string } | null = null;
    try {
      downloaded = await downloadSubtitleTrack(url, languageTag, outputDirectory, stem);
    } catch {
      continue;
    }
    const cueTexts = extractCueTexts(
      readFileSync(downloaded.subtitlePath, 'utf8'),
      sourceLanguage,
    );
    const score = scoreChineseCueTexts(cueTexts);
    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = {
        languageTag,
        subtitlePath: downloaded.subtitlePath,
        cueTexts,
        score,
      };
    }
  }

  if (!bestCandidate) {
    return null;
  }

  if (bestCandidate.score <= 0 || !cueTextsContainHan(bestCandidate.cueTexts)) {
    cleanupUnusedCandidates(outputDirectory, null);
    return null;
  }

  const finalPath = moveCandidateToGroundTruth(bestCandidate.subtitlePath, outputDirectory);
  cleanupUnusedCandidates(outputDirectory, bestCandidate.languageTag);

  return {
    languageTag: bestCandidate.languageTag,
    availableManualTags: selection.availableManualTags,
    availableAutomaticTags: selection.availableAutomaticTags,
    subtitlePath: finalPath,
    cueTexts: bestCandidate.cueTexts,
  };
}

async function downloadSubtitleTrack(
  url: string,
  languageTag: string,
  outputDirectory: string,
  outputStem: string,
): Promise<{ subtitlePath: string }> {
  const outputTemplate = join(outputDirectory, `${outputStem}.%(ext)s`);
  const args = [
    '--skip-download',
    '--no-update',
    '--write-subs',
    '--sub-langs',
    languageTag,
    '--sub-format',
    'vtt/srt/best',
    '-o',
    outputTemplate,
    '--print',
    'after_move:filepath',
    url,
  ];
  const { stdout } = await runYtDlp(args);
  const subtitlePath =
    extractSubtitlePath(stdout) ??
    findDownloadedSubtitlePath(outputTemplate, languageTag);
  if (!subtitlePath || !existsSync(subtitlePath)) {
    throw new Error(`yt-dlp did not produce a subtitle file for ${url} (${languageTag})`);
  }
  return { subtitlePath };
}

function collectChineseCandidateTags(availableManualTags: string[]): string[] {
  const preferred = preferredSubtitleTags('zh');
  const ranked = preferred.filter((tag) => availableManualTags.includes(tag));
  const prefixed = availableManualTags.filter(
    (tag) =>
      tag.startsWith('zh-') &&
      !ranked.includes(tag),
  );
  const generic = availableManualTags.filter(
    (tag) => tag === 'zh' && !ranked.includes(tag),
  );
  return [...ranked, ...prefixed, ...generic];
}

async function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const commandArgs = buildYtDlpArgs(args);
  return execFileAsync('yt-dlp', commandArgs, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function buildYtDlpArgs(args: string[]): string[] {
  const youtubeUrl = args.at(-1);
  const leadingArgs = youtubeUrl ? args.slice(0, -1) : [...args];
  const commandArgs = [...leadingArgs];
  const cookiesFile = process.env.YT_DLP_COOKIES_FILE?.trim();
  const cookiesFromBrowser = process.env.YT_DLP_COOKIES_FROM_BROWSER?.trim();
  const extractorArgs =
    process.env.YT_DLP_YOUTUBE_EXTRACTOR_ARGS?.trim() ||
    DEFAULT_YOUTUBE_EXTRACTOR_ARGS;

  if (cookiesFile) {
    commandArgs.push('--cookies', cookiesFile);
  } else if (cookiesFromBrowser) {
    commandArgs.push('--cookies-from-browser', cookiesFromBrowser);
  }

  if (extractorArgs) {
    commandArgs.push('--extractor-args', extractorArgs);
  }

  if (youtubeUrl) {
    commandArgs.push(youtubeUrl);
  }

  return commandArgs;
}

function extractSubtitlePath(stdout: string): string | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidate = [...lines].reverse().find((line) =>
    /\.(vtt|srt|ttml|srv\d|json3)$/i.test(line),
  );
  return candidate ?? null;
}

function findDownloadedSubtitlePath(
  outputTemplate: string,
  languageTag: string,
): string | null {
  const directory = dirname(outputTemplate);
  const files = readdirSync(directory);
  const templateStem = basename(outputTemplate).replace('.%(ext)s', '');
  const exactPrefix = `${templateStem}.${languageTag}.`;
  const exactMatch = files.find((file) => file.startsWith(exactPrefix));
  if (exactMatch) {
    return join(directory, exactMatch);
  }

  const genericPrefix = `${templateStem}.`;
  const genericMatch = files.find((file) => file.startsWith(genericPrefix));
  return genericMatch ? join(directory, genericMatch) : null;
}

function extractCueTexts(content: string, sourceLanguage: SourceLanguage): string[] {
  const cues: string[] = [];
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  let collecting = false;
  let currentCueLines: string[] = [];
  let inNote = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (collecting && currentCueLines.length > 0) {
        const cleaned = cleanupCueText(currentCueLines, sourceLanguage);
        if (cleaned) {
          cues.push(cleaned);
        }
      }
      collecting = false;
      currentCueLines = [];
      inNote = false;
      continue;
    }

    if (line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:')) {
      continue;
    }

    if (line.startsWith('NOTE')) {
      inNote = true;
      continue;
    }

    if (inNote) {
      continue;
    }

    if (/^\d+$/.test(line) && !collecting) {
      continue;
    }

    if (line.includes('-->')) {
      collecting = true;
      currentCueLines = [];
      continue;
    }

    if (collecting) {
      currentCueLines.push(rawLine);
    }
  }

  if (collecting && currentCueLines.length > 0) {
    const cleaned = cleanupCueText(currentCueLines, sourceLanguage);
    if (cleaned) {
      cues.push(cleaned);
    }
  }

  return cues;
}

function cleanupCueText(lines: string[], sourceLanguage: SourceLanguage): string {
  const cleanedLines = lines
    .map((line) =>
      decodeHtmlEntities(
        line
          .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\{\\an\d\}/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    )
    .filter(Boolean);

  if (sourceLanguage === 'zh') {
    const hanLines = cleanedLines.filter(containsHanCharacters);
    if (hanLines.length > 0) {
      return hanLines.join(' ');
    }
  }

  return cleanedLines.join(' ').trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function containsHanCharacters(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

function containsPinyinMarks(text: string): boolean {
  return /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüɡŋ]/u.test(text);
}

function scoreChineseCueTexts(cueTexts: string[]): number {
  const text = cueTexts.join(' ');
  const hanCount = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const pinyinCount = (text.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüɡŋ]/gu) ?? []).length;
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  return hanCount * 100 - pinyinCount * 10 - latinCount;
}

function sanitizeForFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_');
}

function moveCandidateToGroundTruth(
  sourcePath: string,
  outputDirectory: string,
): string {
  const ext = sourcePath.split('.').pop() ?? 'vtt';
  const destinationPath = join(outputDirectory, `ground-truth.${ext}`);
  if (sourcePath !== destinationPath) {
    if (existsSync(destinationPath)) {
      rmSync(destinationPath, { force: true });
    }
    renameSync(sourcePath, destinationPath);
  }
  return destinationPath;
}

function cleanupUnusedCandidates(
  outputDirectory: string,
  selectedLanguageTag: string | null,
): void {
  const selectedStem = selectedLanguageTag
    ? `candidate-${sanitizeForFilename(selectedLanguageTag)}.`
    : null;
  for (const file of readdirSync(outputDirectory)) {
    if (
      file.startsWith('candidate-') &&
      (!selectedStem || !file.startsWith(selectedStem))
    ) {
      rmSync(join(outputDirectory, file), { force: true });
    }
  }
}

function cueTextsContainHan(cueTexts: string[]): boolean {
  return cueTexts.some(containsHanCharacters);
}
