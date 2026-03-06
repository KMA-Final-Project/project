/**
 * Pipeline Constants — Kapter
 * Maps exact backend pipeline steps to their UI strings via i18n keys.
 */
export const PIPELINE_STEPS = [
  {
    key: "AUDIO_PREP",
    labelKey: "steps.audioProcess.label",
    sublabelKey: "steps.audioProcess.sublabel",
  },
  {
    key: "INSPECTING",
    labelKey: "steps.analysis.label",
    sublabelKey: "steps.analysis.sublabel",
  },
  {
    key: "VAD",
    labelKey: "steps.vad.label",
    sublabelKey: "steps.vad.sublabel",
  },
  {
    key: "TRANSCRIBING",
    labelKey: "steps.transcribe.label",
    sublabelKey: "steps.transcribe.sublabel",
  },
  {
    key: "MERGING",
    labelKey: "steps.grouping.label",
    sublabelKey: "steps.grouping.sublabel",
  },
  {
    key: "TRANSLATING",
    labelKey: "steps.translate.label",
    sublabelKey: "steps.translate.sublabel",
  },
  {
    key: "EXPORTING",
    labelKey: "steps.export.label",
    sublabelKey: "steps.export.sublabel",
  },
];
