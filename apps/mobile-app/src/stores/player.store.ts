/**
 * Player Store — Kapter
 *
 * Zustand store for UI-only player state.
 */
import { create } from "zustand";

export type PlayerLayer = "phonetic" | "translation" | "karaoke";
export type PlayerMediaMode = "audio" | "video";
export type PlayerPlaybackSourceKind = "local" | "cloud" | "fallback";

interface PlayerState {
  currentTimeSec: number;
  durationSec: number;
  isPlaying: boolean;
  activeSentenceIndex: number;

  showPhonetic: boolean;
  showTranslation: boolean;
  showKaraoke: boolean;

  playbackSpeed: number; // 0.5 | 0.75 | 1.0 | 1.25 | 1.5
  loopSentence: boolean;
  isPinned: boolean;

  mediaMode: PlayerMediaMode;
  playbackSourceKind: PlayerPlaybackSourceKind;
  explainPlaybackHandler: ((startSec: number) => void) | null;

  // Actions
  setCurrentTime: (sec: number) => void;
  setDuration: (sec: number) => void;
  setIsPlaying: (v: boolean) => void;
  setActiveSentenceIndex: (i: number) => void;
  toggleLayer: (layer: PlayerLayer) => void;
  cycleSpeed: () => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleLoop: () => void;
  togglePin: () => void;
  setMediaMode: (mode: PlayerMediaMode) => void;
  setPlaybackSourceKind: (kind: PlayerPlaybackSourceKind) => void;
  registerExplainPlaybackHandler: (
    handler: ((startSec: number) => void) | null,
  ) => void;
  replayExplainSentence: (startSec: number) => void;
  reset: () => void;
}

const initialState: Omit<
  PlayerState,
  | "setCurrentTime"
  | "setDuration"
  | "setIsPlaying"
  | "setActiveSentenceIndex"
  | "toggleLayer"
  | "cycleSpeed"
  | "setPlaybackSpeed"
  | "toggleLoop"
  | "togglePin"
  | "setMediaMode"
  | "setPlaybackSourceKind"
  | "registerExplainPlaybackHandler"
  | "replayExplainSentence"
  | "reset"
> = {
  currentTimeSec: 0,
  durationSec: 0,
  isPlaying: false,
  activeSentenceIndex: -1,

  showPhonetic: true,
  showTranslation: true,
  showKaraoke: true,

  playbackSpeed: 1.0,
  loopSentence: false,
  isPinned: false,

  mediaMode: "audio" as const,
  playbackSourceKind: "fallback" as const,
  explainPlaybackHandler: null,
};

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5];

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...initialState,

  setCurrentTime: (sec) => set({ currentTimeSec: sec }),
  setDuration: (sec) => set({ durationSec: sec }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setActiveSentenceIndex: (i) => set({ activeSentenceIndex: i }),

  toggleLayer: (layer) => {
    if (layer === "phonetic") {
      set((state) => ({ showPhonetic: !state.showPhonetic }));
      return;
    }

    if (layer === "translation") {
      set((state) => ({ showTranslation: !state.showTranslation }));
      return;
    }

    set((state) => ({ showKaraoke: !state.showKaraoke }));
  },

  cycleSpeed: () => {
    const current = get().playbackSpeed;
    const idx = SPEEDS.indexOf(current);
    const nextSpeed = SPEEDS[(idx + 1) % SPEEDS.length];
    set({ playbackSpeed: nextSpeed });
  },

  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  toggleLoop: () => set((s) => ({ loopSentence: !s.loopSentence })),

  togglePin: () => set((s) => ({ isPinned: !s.isPinned })),

  setMediaMode: (mode) => set({ mediaMode: mode }),
  setPlaybackSourceKind: (kind) => set({ playbackSourceKind: kind }),
  registerExplainPlaybackHandler: (handler) =>
    set({ explainPlaybackHandler: handler }),
  replayExplainSentence: (startSec) => {
    get().explainPlaybackHandler?.(startSec);
  },

  reset: () => set(initialState),
}));
