import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components";
import {
  useExplainStream,
  type ExplainChatMessage,
} from "@/hooks/useExplainStream";
import type { Sentence } from "@/types/subtitle";
import { FloatingSentenceDrawer } from "./FloatingSentenceDrawer";

interface ExplainBottomSheetProps {
  visible: boolean;
  mediaId: string | null;
  segmentIndex: number;
  sentence: Sentence | null;
  targetLanguage: string;
  onClose: () => void;
}

export function ExplainBottomSheet({
  visible,
  mediaId,
  segmentIndex,
  sentence,
  targetLanguage,
  onClose,
}: ExplainBottomSheetProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");
  const { height } = useWindowDimensions();
  const listRef = useRef<FlatList<ExplainChatMessage>>(null);
  const [input, setInput] = useState("");
  const initializedKeyRef = useRef<string | null>(null);
  const sheetHeight = Math.min(Math.max(height * 0.78, 560), height - 24);

  const {
    messages,
    creditsRemaining,
    isLoadingHistory,
    isStreaming,
    error,
    loadHistory,
    start,
    abort,
    reset,
  } = useExplainStream({ mediaId, segmentIndex });
  const loadHistoryRef = useRef(loadHistory);
  const startRef = useRef(start);
  const initialExplainMessageRef = useRef(
    buildInitialExplainMessage(sentence, targetLanguage),
  );

  const activeKey = mediaId ? `${mediaId}:${segmentIndex}` : null;

  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    initialExplainMessageRef.current = buildInitialExplainMessage(
      sentence,
      targetLanguage,
    );
  }, [sentence, targetLanguage]);

  useEffect(() => {
    if (!visible || !activeKey) {
      return;
    }

    if (initializedKeyRef.current === activeKey) {
      return;
    }

    let cancelled = false;
    initializedKeyRef.current = activeKey;

    void (async () => {
      try {
        const history = await loadHistoryRef.current();
        if (!cancelled && history.messages.length === 0) {
          await startRef.current({
            localUserMessage: initialExplainMessageRef.current,
          });
        }
      } catch {
        // The hook owns the user-facing error state.
      }
    })();

    return () => {
      cancelled = true;
      abort();
    };
  }, [abort, activeKey, visible]);

  useEffect(() => {
    if (!visible && initializedKeyRef.current) {
      initializedKeyRef.current = null;
      reset();
    }
  }, [reset, visible]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages]);

  const canSend = input.trim().length > 0 && !isStreaming && !isLoadingHistory;

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    setInput("");
    void start({ userMessage: trimmed });
  }, [input, isStreaming, start]);

  const creditsLabel = useMemo(
    () =>
      creditsRemaining == null
        ? t("explainCreditsPending")
        : t("explainCredits", { count: creditsRemaining }),
    [creditsRemaining, t],
  );

  const renderMessage = useCallback(
    ({ item }: { item: ExplainChatMessage }) => {
      const isUser = item.role === "user";
      const isPendingAssistant =
        !isUser && item.status === "streaming" && !item.content.trim();

      return (
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
            {
              backgroundColor: isUser
                ? theme.colors.primary
                : theme.colors.card,
              borderColor: isUser ? theme.colors.primary : theme.colors.border,
            },
          ]}
        >
          {isPendingAssistant ? (
            <View style={styles.thinkingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                style={[
                  styles.messageText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {t("explainThinking")}
              </Text>
            </View>
          ) : (
            <Text
              style={[
                styles.messageText,
                {
                  color: isUser
                    ? theme.colors.textOnPrimary
                    : theme.colors.text,
                },
              ]}
            >
              {item.content}
            </Text>
          )}
        </View>
      );
    },
    [t, theme],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} height={sheetHeight}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardRoot}
      >
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {t("explainEyebrow")}
            </Text>
            <View
              style={[
                styles.creditsPill,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Ionicons
                name="sparkles-outline"
                size={14}
                color={theme.colors.primary}
              />
              <Text style={[styles.creditsLabel, { color: theme.colors.text }]}>
                {creditsLabel}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={isStreaming ? abort : onClose}
            style={[
              styles.stopButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Ionicons
              name={isStreaming ? "stop-circle-outline" : "close-outline"}
              size={18}
              color={theme.colors.text}
            />
          </Pressable>
        </View>

        <View style={styles.messagesShell}>
          {isLoadingHistory && messages.length === 0 ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                style={[
                  styles.stateText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {t("explainLoading")}
              </Text>
            </View>
          ) : (
            <>
              <FlatList
                ref={listRef}
                data={messages}
                extraData={isStreaming}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.messageList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              />
            </>
          )}
        </View>

        <FloatingSentenceDrawer sentence={sentence} />

        {error ? (
          <Text style={[styles.errorText, { color: theme.colors.error }]}>
            {error}
          </Text>
        ) : null}

        <View
          style={[
            styles.inputShell,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
            },
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("explainInputPlaceholder")}
            placeholderTextColor={theme.colors.placeholder}
            style={[styles.input, { color: theme.colors.text }]}
            multiline
            maxLength={500}
            editable={!isStreaming && !isLoadingHistory}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={[
              styles.sendButton,
              {
                backgroundColor: canSend
                  ? theme.colors.primary
                  : theme.colors.disabled,
              },
            ]}
          >
            <Ionicons
              name="send"
              size={18}
              color={theme.colors.textOnPrimary}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  keyboardRoot: {
    flex: 1,
    gap: theme.spacing[3],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  headerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
  },
  creditsPill: {
    borderWidth: 1,
    borderRadius: theme.radii["2xl"],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  stopButton: {
    borderWidth: 1,
    borderRadius: theme.radii["2xl"],
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  creditsLabel: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
  },
  messagesShell: {
    flex: 1,
    minHeight: 0,
  },
  messageList: {
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    paddingBottom: theme.spacing[2],
  },
  messageBubble: {
    maxWidth: "88%",
    borderWidth: 1,
    borderRadius: theme.radii["2xl"],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
  },
  userBubble: {
    alignSelf: "flex-end",
  },
  assistantBubble: {
    alignSelf: "flex-start",
  },
  messageText: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: 22,
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  feedbackRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
    alignSelf: "flex-end",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  stateText: {
    fontSize: theme.typography.sizes.sm,
  },
  errorText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderRadius: theme.radii["2xl"],
    padding: theme.spacing[2],
    gap: theme.spacing[2],
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 92,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    fontSize: theme.typography.sizes.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.xl,
    alignItems: "center",
    justifyContent: "center",
  },
}));

function buildInitialExplainMessage(
  sentence: Sentence | null,
  targetLanguage: string,
): string {
  const sentenceText = sentence?.text ?? "";
  const translationText = sentence?.translation?.trim() ?? "";
  const normalizedTarget = targetLanguage
    .split(/[-_]/)[0]
    ?.toLowerCase()
    ?.trim();

  if (normalizedTarget === "vi") {
    return translationText
      ? `Hãy giúp tôi hiểu câu này:\n${sentenceText}\nBản dịch hiện tại: ${translationText}`
      : `Hãy giúp tôi hiểu câu này:\n${sentenceText}`;
  }

  return translationText
    ? `Help me explain this phrase:\n${sentenceText}\nCurrent translation: ${translationText}`
    : `Help me explain this phrase:\n${sentenceText}`;
}
