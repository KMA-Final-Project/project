/**
 * PipelineStepper — Kapter
 *
 * Vertical 7-step pipeline indicator for the Processing Status screen.
 * Maps the AI engine's `currentStep` string constants to user-friendly labels.
 */
import React from "react";
import { View, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { MediaStatus } from "@/types/media";
import { PIPELINE_STEPS } from "@/constants/pipeline";

interface PipelineStepperProps {
  currentStep: string | null;
  status: MediaStatus;
}

type StepState = "completed" | "active" | "pending";

function getStepState(
  stepIndex: number,
  activeIndex: number,
  status: MediaStatus,
): StepState {
  if (status === "COMPLETED") return "completed";
  if (status === "FAILED")
    return stepIndex <= activeIndex ? "completed" : "pending";
  if (activeIndex < 0) return "pending"; // QUEUED — nothing started
  if (stepIndex < activeIndex) return "completed";
  if (stepIndex === activeIndex) return "active";
  return "pending";
}

export function PipelineStepper({ currentStep, status }: PipelineStepperProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("processing");

  const activeIndex = currentStep
    ? PIPELINE_STEPS.findIndex((s) => s.key === currentStep)
    : -1;

  return (
    <View style={styles.container}>
      {PIPELINE_STEPS.map((step, index) => {
        const state = getStepState(index, activeIndex, status);
        const isLast = index === PIPELINE_STEPS.length - 1;

        return (
          <View key={step.key} style={styles.row}>
            {/* Left column: icon + connector line */}
            <View style={styles.iconColumn}>
              <StepIcon state={state} theme={theme} />
              {!isLast && (
                <View
                  style={[
                    styles.connector,
                    {
                      backgroundColor:
                        state === "completed"
                          ? theme.colors.success
                          : theme.colors.border,
                    },
                  ]}
                />
              )}
            </View>

            {/* Right column: label + sublabel */}
            <View style={styles.textColumn}>
              <Text
                style={[
                  styles.label,
                  {
                    color:
                      state === "active"
                        ? theme.colors.primary
                        : state === "completed"
                          ? theme.colors.text
                          : theme.colors.textTertiary,
                    fontWeight: state === "active" ? "700" : "600",
                  },
                ]}
              >
                {t(step.labelKey as any)}
              </Text>
              <Text
                style={[
                  styles.sublabel,
                  {
                    color:
                      state === "active"
                        ? theme.colors.primary + "CC"
                        : theme.colors.textTertiary,
                    fontStyle: state === "active" ? "italic" : "normal",
                  },
                ]}
              >
                {state === "completed"
                  ? t("states.completed")
                  : state === "active"
                    ? t(step.sublabelKey as any)
                    : t("states.pending")}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StepIcon({ state, theme }: { state: StepState; theme: any }) {
  if (state === "completed") {
    return (
      <View
        style={[styles.iconCircle, { backgroundColor: theme.colors.success }]}
      >
        <Ionicons name="checkmark" size={14} color="#fff" />
      </View>
    );
  }

  if (state === "active") {
    return (
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: theme.colors.primary + "22",
            borderWidth: 2,
            borderColor: theme.colors.primary,
          },
        ]}
      >
        <View
          style={[styles.activeDot, { backgroundColor: theme.colors.primary }]}
        />
      </View>
    );
  }

  // pending
  return (
    <View
      style={[
        styles.iconCircle,
        {
          backgroundColor: "transparent",
          borderWidth: 2,
          borderColor: theme.colors.border,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing[4],
  },
  iconColumn: {
    alignItems: "center",
    width: 24,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: theme.spacing[5],
    marginVertical: 2,
  },
  textColumn: {
    flex: 1,
    paddingBottom: theme.spacing[5],
  },
  label: {
    fontSize: 15,
  },
  sublabel: {
    fontSize: 12,
    marginTop: 2,
  },
}));
