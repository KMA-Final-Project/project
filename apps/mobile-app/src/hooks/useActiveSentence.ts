import { useMemo } from "react";

import type { Sentence } from "@/types/subtitle";

const findActiveSentenceIndex = (
  segments: Sentence[],
  currentTimeSec: number,
): number => {
  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const segment = segments[mid];

    if (currentTimeSec < segment.start) {
      high = mid - 1;
      continue;
    }

    if (currentTimeSec > segment.end) {
      low = mid + 1;
      continue;
    }

    return mid;
  }

  if (segments.length === 0) {
    return -1;
  }

  if (currentTimeSec < segments[0].start) {
    return 0;
  }

  return Math.min(segments.length - 1, Math.max(0, low - 1));
};

export const useActiveSentence = (
  segments: Sentence[] | undefined,
  currentTimeSec: number,
) =>
  useMemo(() => {
    if (!segments || segments.length === 0) {
      return {
        activeSentenceIndex: -1,
        activeSentence: null,
      };
    }

    const activeSentenceIndex = findActiveSentenceIndex(
      segments,
      currentTimeSec,
    );

    return {
      activeSentenceIndex,
      activeSentence: segments[activeSentenceIndex] ?? null,
    };
  }, [currentTimeSec, segments]);
