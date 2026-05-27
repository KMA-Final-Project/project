import type { WerBreakdown } from './types';
import { round } from './utils';

type Operation = 'match' | 'substitute' | 'delete' | 'insert';

export function computeWer(
  referenceTokens: string[],
  hypothesisTokens: string[],
): WerBreakdown {
  const rows = referenceTokens.length + 1;
  const cols = hypothesisTokens.length + 1;

  const dp: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let row = 0; row < rows; row += 1) {
    dp[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    dp[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      if (referenceTokens[row - 1] === hypothesisTokens[col - 1]) {
        dp[row][col] = dp[row - 1][col - 1];
        continue;
      }

      dp[row][col] = Math.min(
        dp[row - 1][col - 1] + 1,
        dp[row - 1][col] + 1,
        dp[row][col - 1] + 1,
      );
    }
  }

  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let row = referenceTokens.length;
  let col = hypothesisTokens.length;

  while (row > 0 || col > 0) {
    const operation = selectOperation(referenceTokens, hypothesisTokens, dp, row, col);
    switch (operation) {
      case 'match':
        row -= 1;
        col -= 1;
        break;
      case 'substitute':
        substitutions += 1;
        row -= 1;
        col -= 1;
        break;
      case 'delete':
        deletions += 1;
        row -= 1;
        break;
      case 'insert':
        insertions += 1;
        col -= 1;
        break;
    }
  }

  return {
    substitutions,
    deletions,
    insertions,
    referenceTokenCount: referenceTokens.length,
    hypothesisTokenCount: hypothesisTokens.length,
    finalWer:
      referenceTokens.length === 0
        ? 0
        : round(
            (substitutions + deletions + insertions) / referenceTokens.length,
            6,
          ),
  };
}

function selectOperation(
  referenceTokens: string[],
  hypothesisTokens: string[],
  dp: number[][],
  row: number,
  col: number,
): Operation {
  if (row > 0 && col > 0 && referenceTokens[row - 1] === hypothesisTokens[col - 1]) {
    return 'match';
  }

  const current = dp[row][col];
  if (row > 0 && col > 0 && dp[row - 1][col - 1] + 1 === current) {
    return 'substitute';
  }
  if (row > 0 && dp[row - 1][col] + 1 === current) {
    return 'delete';
  }
  return 'insert';
}
