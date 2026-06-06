import { useCallback, useEffect, useRef, useState } from "react";
import { fetch as expoFetch } from "expo/fetch";
import { api, API_BASE_URL } from "@/services/api";
import { getTokens } from "@/services/token-storage";
import { ENDPOINTS } from "@/constants/endpoint";
import type {
  ChatFeedbackRequest,
  ChatHistoryMessage,
  ChatHistoryResponse,
  ExplainRequest,
  ExplainSseEvent,
} from "@/types/explain";

export interface ExplainChatMessage extends ChatHistoryMessage {
  status?: "streaming" | "sent" | "error";
}

interface UseExplainStreamInput {
  mediaId: string | null;
  segmentIndex: number;
}

interface StartExplainOptions {
  userMessage?: string;
  localUserMessage?: string;
}

export function useExplainStream({
  mediaId,
  segmentIndex,
}: UseExplainStreamInput) {
  const [messages, setMessages] = useState<ExplainChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  useEffect(() => abort, [abort]);

  const loadHistory = useCallback(async (): Promise<ChatHistoryResponse> => {
    if (!mediaId || segmentIndex < 0) {
      const empty: ChatHistoryResponse = {
        sessionId: null,
        segmentIndex,
        messages: [],
      };
      setMessages([]);
      setSessionId(null);
      return empty;
    }

    setIsLoadingHistory(true);
    setError(null);

    try {
      const { data } = await api.get<ChatHistoryResponse>(
        ENDPOINTS.MEDIA_EXPLAIN_HISTORY(mediaId),
        { params: { segmentIndex } },
      );
      setSessionId(data.sessionId);
      setMessages(data.messages.map((message) => ({ ...message, status: "sent" })));
      return data;
    } catch (historyError) {
      const message =
        historyError instanceof Error
          ? historyError.message
          : "Unable to load explanation history.";
      setError(message);
      throw historyError;
    } finally {
      setIsLoadingHistory(false);
    }
  }, [mediaId, segmentIndex]);

  const start = useCallback(
    async (options?: StartExplainOptions): Promise<void> => {
      if (!mediaId || segmentIndex < 0 || isStreaming) {
        return;
      }

      const trimmedMessage = options?.userMessage?.trim();
      const localUserMessage = options?.localUserMessage?.trim();
      const localBubbleContent = localUserMessage || trimmedMessage;

      if (localBubbleContent) {
        setMessages((current) => [
          ...current,
          {
            id: `local-user-${Date.now()}`,
            role: "user",
            content: localBubbleContent,
            createdAt: new Date().toISOString(),
            status: "sent",
          },
        ]);
      }

      const tokens = await getTokens();
      if (!tokens?.accessToken) {
        setError("Authentication is required.");
        return;
      }

      const abortController = new AbortController();
      abortRef.current = abortController;
      setIsStreaming(true);
      setError(null);

      const localAssistantId = `local-assistant-${Date.now()}`;
      let activeAssistantId: string | null = localAssistantId;
      setMessages((current) => [
        ...current,
        {
          id: localAssistantId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          status: "streaming",
        },
      ]);

      const payload: ExplainRequest = { segmentIndex };
      if (sessionId) {
        payload.sessionId = sessionId;
      }
      if (trimmedMessage) {
        payload.userMessage = trimmedMessage;
      }

      try {
        const response = await expoFetch(
          `${API_BASE_URL}${ENDPOINTS.MEDIA_EXPLAIN(mediaId)}`,
          {
            method: "POST",
            headers: {
              Accept: "text/event-stream",
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokens.accessToken}`,
            },
            body: JSON.stringify(payload),
            signal: abortController.signal,
          },
        );

        if (!response.ok || !response.body) {
          throw new Error(`Explain request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const consumeBlock = (block: string) => {
          const event = parseSseBlock(block);
          if (!event) {
            return;
          }

          if (event.event === "meta") {
            const previousAssistantId = activeAssistantId;
            activeAssistantId = event.data.messageId;
            setSessionId(event.data.sessionId);
            setCreditsRemaining(event.data.creditsRemaining);
            setMessages((current) => {
              const hasServerAssistant = current.some(
                (message) => message.id === event.data.messageId,
              );
              if (hasServerAssistant) {
                return current;
              }

              const pendingAssistantId = previousAssistantId ?? localAssistantId;
              const hasPendingAssistant = current.some(
                (message) => message.id === pendingAssistantId,
              );
              if (hasPendingAssistant) {
                return current.map((message) =>
                  message.id === pendingAssistantId
                    ? {
                        ...message,
                        id: event.data.messageId,
                        status: "streaming",
                      }
                    : message,
                );
              }

              return [
                ...current,
                {
                  id: event.data.messageId,
                  role: "assistant",
                  content: "",
                  createdAt: new Date().toISOString(),
                  status: "streaming",
                },
              ];
            });
            return;
          }

          if (event.event === "delta") {
            const fallbackAssistantId = `local-assistant-${Date.now()}`;
            const targetId: string = activeAssistantId ?? fallbackAssistantId;
            if (!activeAssistantId) {
              activeAssistantId = targetId;
              setMessages((current) => [
                ...current,
                {
                  id: targetId,
                  role: "assistant",
                  content: "",
                  createdAt: new Date().toISOString(),
                  status: "streaming",
                },
              ]);
            }

            setMessages((current) =>
              current.map((message) =>
                message.id === targetId
                  ? {
                      ...message,
                      content: message.content + event.data.content,
                    }
                  : message,
              ),
            );
            return;
          }

          if (event.event === "error") {
            if (
              event.data.code === "INSUFFICIENT_CREDITS" &&
              activeAssistantId
            ) {
              setError(null);
              setMessages((current) =>
                current.map((message) =>
                  message.id === activeAssistantId
                    ? {
                        ...message,
                        content: event.data.message,
                        status: "sent",
                      }
                    : message,
                ),
              );
              return;
            }

            setError(event.data.message);
            setMessages((current) =>
              activeAssistantId
                ? current.map((message) =>
                    message.id === activeAssistantId
                      ? { ...message, status: "error" }
                      : message,
                  )
                : current,
            );
            return;
          }

          if (event.event === "done") {
            setMessages((current) =>
              current.map((message) =>
                message.id === activeAssistantId
                  ? { ...message, status: "sent" }
                  : message,
              ),
            );
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            consumeBlock(block);
          }
        }

        buffer += decoder.decode();
        for (const block of buffer.split(/\r?\n\r?\n/)) {
          if (block.trim()) {
            consumeBlock(block);
          }
        }
      } catch (streamError) {
        if (!abortController.signal.aborted) {
          const message =
            streamError instanceof Error
              ? streamError.message
              : "Unable to stream explanation.";
          setError(message);
          setMessages((current) =>
            activeAssistantId
              ? current.map((item) =>
                  item.id === activeAssistantId
                    ? { ...item, status: "error" }
                    : item,
                )
              : current,
          );
        }
      } finally {
        if (abortRef.current === abortController) {
          abortRef.current = null;
        }
        setIsStreaming(false);
      }
    },
    [isStreaming, mediaId, segmentIndex, sessionId],
  );

  const submitFeedback = useCallback(
    async (payload: ChatFeedbackRequest): Promise<void> => {
      if (!mediaId) {
        return;
      }

      await api.post(ENDPOINTS.MEDIA_EXPLAIN_FEEDBACK(mediaId), payload);
      setMessages((current) =>
        current.map((message) =>
          message.id === payload.chatMessageId
            ? { ...message, feedback: { rating: payload.rating } }
            : message,
        ),
      );
    },
    [mediaId],
  );

  const reset = useCallback(() => {
    abort();
    setMessages([]);
    setSessionId(null);
    setCreditsRemaining(null);
    setError(null);
  }, [abort]);

  return {
    messages,
    sessionId,
    creditsRemaining,
    isLoadingHistory,
    isStreaming,
    error,
    loadHistory,
    start,
    abort,
    submitFeedback,
    reset,
  };
}

function parseSseBlock(block: string): ExplainSseEvent | null {
  const lines = block.split(/\r?\n/);
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");

  if (!event || !data) {
    return null;
  }

  const parsedData = JSON.parse(data) as unknown;

  switch (event) {
    case "meta":
    case "delta":
    case "error":
    case "done":
      return { event, data: parsedData } as ExplainSseEvent;
    default:
      return null;
  }
}
