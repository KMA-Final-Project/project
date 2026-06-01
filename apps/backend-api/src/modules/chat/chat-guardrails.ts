const BLOCKED_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|all)\s+(instructions|rules|prompts?)/i,
  /forget\s+(everything|your|all)/i,
  /you\s+are\s+(now|no\s+longer)/i,
  /act\s+as\s+a?\s*(different|new)/i,
  /override\s+(your|system|these)/i,
  /reveal\s+(your|the|system)\s+(prompt|instructions)/i,
  /\b(execute|run|eval)\s*(code|script|command)/i,
  /system\s*prompt/i,
  /<\/?\s*(system|assistant|user)\s*>/i,
  /\[\s*SYSTEM\s*\]/i,
];

export const EXPLAIN_REFUSAL_MESSAGE =
  'I can only help with language learning topics related to this subtitle. What would you like to know?';

export function isUserMessageSafe(value: string | undefined): boolean {
  if (!value) {
    return true;
  }

  return !BLOCKED_PATTERNS.some((pattern) => pattern.test(value));
}

export function isStructuredRefusal(value: string): boolean {
  return /^\s*\{\s*"refusal"\s*:\s*true/.test(value.slice(0, 100));
}

export function mayBecomeStructuredRefusal(value: string): boolean {
  const trimmed = value.trimStart();

  return (
    trimmed.length === 0 ||
    '{"refusal":true'.startsWith(trimmed.replace(/\s+/g, '')) ||
    '{"refusal": true'.startsWith(trimmed)
  );
}

export function containsPromptLeak(value: string): boolean {
  return /ABSOLUTE RULES|subtitle_context_|OPAQUE REFERENCE DATA/i.test(value);
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
