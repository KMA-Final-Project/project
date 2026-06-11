export function buildJudgePrompt(input: {
  sourceSegments: string[];
  nmtTranslations: string[];
  finalTranslations: string[];
  targetLanguage: string;
}): string {
  return [
    `Target language: ${input.targetLanguage}`,
    'Compare NMT vs LLM-final translations.',
    'Score meaning preservation, target-language fluency, context consistency, and subtitle readability on a 1-5 scale.',
    `SOURCE: ${input.sourceSegments.join(' | ')}`,
    `NMT: ${input.nmtTranslations.join(' | ')}`,
    `LLM_FINAL: ${input.finalTranslations.join(' | ')}`,
    'Return winner=nmt|llm_final|tie plus scores.',
  ].join('\n');
}

export function summarizeJudgeResults(results: Array<{ winner: string; scores: { meaning: number; fluency: number; consistency: number; readability: number } }>) {
  const llmWins = results.filter((item) => item.winner === 'llm_final').length;
  const ties = results.filter((item) => item.winner === 'tie').length;
  return {
    llmWinRate: results.length === 0 ? 0 : llmWins / results.length,
    tieRate: results.length === 0 ? 0 : ties / results.length,
  };
}
