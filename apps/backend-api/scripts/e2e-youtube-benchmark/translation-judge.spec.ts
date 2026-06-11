import { describe, expect, it } from '@jest/globals';

import {
  buildJudgePrompt,
  summarizeJudgeResults,
} from './translation-judge';

describe('translation judge helpers', () => {
  it('builds a source/nmt/final comparison prompt', () => {
    const prompt = buildJudgePrompt({
      sourceSegments: ['你好', '请问你是王静吗？'],
      nmtTranslations: ['Xin chao', 'Ban co phai Vuong Tinh khong?'],
      finalTranslations: ['Chao ban', 'Cho minh hoi ban co phai Vuong Tinh khong?'],
      targetLanguage: 'vi',
    });

    expect(prompt).toContain('meaning preservation');
    expect(prompt).toContain('context consistency');
    expect(prompt).toContain('subtitle readability');
  });

  it('summarizes judge win rates and score deltas', () => {
    const summary = summarizeJudgeResults([
      {
        winner: 'llm_final',
        scores: { meaning: 5, fluency: 5, consistency: 4, readability: 5 },
      },
      {
        winner: 'tie',
        scores: { meaning: 4, fluency: 4, consistency: 4, readability: 4 },
      },
    ]);

    expect(summary.llmWinRate).toBe(0.5);
    expect(summary.tieRate).toBe(0.5);
  });
});
