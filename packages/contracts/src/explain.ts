export type ExplainFinishReason = "stop" | "length" | "aborted";

export type ExplainErrorCode =
  | "INSUFFICIENT_CREDITS"
  | "GUARDRAIL_REJECTED"
  | "SUBTITLE_CONTEXT_UNAVAILABLE"
  | "LLM_UNAVAILABLE"
  | "LLM_ERROR"
  | "RATE_LIMITED";

export type ChatFeedbackRating = "POSITIVE" | "NEGATIVE";

export interface ExplainRequest {
  segmentIndex: number;
  sessionId?: string;
  userMessage?: string;
}

export interface ExplainMetaEvent {
  sessionId: string;
  messageId: string;
  cacheHit: boolean;
  creditsRemaining: number;
  model: string;
  promptVersion: string;
}

export interface ExplainDeltaEvent {
  content: string;
}

export interface ExplainErrorEvent {
  code: ExplainErrorCode;
  message: string;
}

export interface ExplainDoneEvent {
  tokensUsed: number;
  finishReason: ExplainFinishReason;
}

export type ExplainSseEvent =
  | { event: "meta"; data: ExplainMetaEvent }
  | { event: "delta"; data: ExplainDeltaEvent }
  | { event: "error"; data: ExplainErrorEvent }
  | { event: "done"; data: ExplainDoneEvent };

export interface ChatFeedbackRequest {
  chatMessageId: string;
  rating: ChatFeedbackRating;
  reason?: string;
}

export interface ChatHistoryFeedback {
  rating: ChatFeedbackRating;
}

export interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  feedback?: ChatHistoryFeedback;
}

export interface ChatHistoryResponse {
  sessionId: string | null;
  segmentIndex: number;
  messages: ChatHistoryMessage[];
}
