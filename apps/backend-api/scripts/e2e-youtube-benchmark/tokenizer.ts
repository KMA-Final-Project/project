import { spawnSync } from 'node:child_process';

import type { SourceLanguage } from './types';

export type Tokenizer = {
  tokenize(language: SourceLanguage, text: string): Promise<string[]>;
};

export function createTokenizer(options: {
  aiEnginePythonPath: string;
  aiEngineWorkingDirectory: string;
}): Tokenizer {
  return {
    async tokenize(language: SourceLanguage, text: string): Promise<string[]> {
      if (language === 'en') {
        return tokenizeEnglish(text);
      }
      return tokenizeChinese(text, options);
    },
  };
}

export function dedupeCueTokens(
  cueTokenLists: string[][],
  language: SourceLanguage,
): string[] {
  const deduped: string[] = [];

  for (const tokenList of cueTokenLists) {
    if (tokenList.length === 0) {
      continue;
    }
    if (deduped.length === 0) {
      deduped.push(...tokenList);
      continue;
    }

    const overlap = findLongestOverlap(deduped, tokenList, language);
    deduped.push(...tokenList.slice(overlap));
  }

  return deduped;
}

function tokenizeEnglish(text: string): string[] {
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s+/)
    .map((token) => token.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

async function tokenizeChinese(
  text: string,
  options: {
    aiEnginePythonPath: string;
    aiEngineWorkingDirectory: string;
  },
): Promise<string[]> {
  if (!text.trim()) {
    return [];
  }

  const script = [
    'import json',
    'import sys',
    'from src.core.chinese_word_segmenter import _lexical_tokens_from_text',
    'text = sys.stdin.read()',
    'print(json.dumps(_lexical_tokens_from_text(text), ensure_ascii=False))',
  ].join('; ');

  const result = spawnSync(
    options.aiEnginePythonPath,
    ['-c', script],
    {
      cwd: options.aiEngineWorkingDirectory,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
      input: text,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Chinese tokenizer failed: ${(result.stderr || result.stdout || '').trim()}`,
    );
  }

  const tokens = JSON.parse(result.stdout) as unknown;
  if (!Array.isArray(tokens)) {
    throw new Error('Chinese tokenizer returned a non-array payload');
  }

  return tokens
    .map((token) => String(token).trim())
    .filter(Boolean);
}

function findLongestOverlap(
  accumulated: string[],
  next: string[],
  language: SourceLanguage,
): number {
  const maxOverlap = Math.min(accumulated.length, next.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const left = accumulated.slice(-size);
    const right = next.slice(0, size);
    if (tokensEqual(left, right, language)) {
      return size;
    }
  }
  return 0;
}

function tokensEqual(
  left: string[],
  right: string[],
  language: SourceLanguage,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (value, index) => normalizeToken(value, language) === normalizeToken(right[index], language),
  );
}

function normalizeToken(token: string, language: SourceLanguage): string {
  if (language === 'en') {
    return token.normalize('NFKC').toLowerCase();
  }
  return token.normalize('NFKC');
}
