import React, { useCallback, useEffect, useMemo } from "react";
import {
  ScrollView,
  Text,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ScreenHeader } from "@/components";
import { useSubscriptionStatus } from "@/hooks";
import { useBillingStatus, billingKeys } from "@/hooks/use-billing-status";
import { openBillingHandoff } from "@/services/billing-handoff.service";
import { subscriptionKeys } from "@/hooks/useSubscriptionStatus";
import type { AvailablePlan, BillingCycleType } from "@/types/subscription";

function formatMinutes(seconds: number | null, unlimitedLabel: string): string {
  if (seconds == null) {
    return unlimitedLabel;
  }

  return `${Math.floor(seconds / 60)} min`;
}

function formatCycle(
  cycle: BillingCycleType,
  t: any,
): string {
  const key =
    cycle === "MONTHLY"
      ? "monthly"
      : cycle === "SIX_MONTHS"
        ? "sixMonths"
        : cycle === "YEARLY"
          ? "yearly"
          : "lifetime";
  return t(`subscription.cycles.${key}` as never);
}

function formatPlanPrice(
  plan: AvailablePlan,
  t: any,
): string {
  if (Number(plan.price) <= 0) {
    return t("subscription.freePrice");
  }

  return t("subscription.priceLabel", {
    price: plan.price,
    currency: plan.currency,
    cycle: formatCycle(plan.billingCycleType, t),
  });
}

export default function SubscriptionScreen() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { data, isLoading } = useSubscriptionStatus();
  const billingQuery = useBillingStatus();
  const hasActivePaidSubscription =
    billingQuery.data?.hasActivePaidSubscription ?? false;
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    refreshBilling?: string;
    context?: string;
  }>();

  useEffect(() => {
    if (params.refreshBilling === "1") {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.status });
      queryClient.invalidateQueries({ queryKey: billingKeys.status });
    }
  }, [params.refreshBilling, queryClient]);

  const handleUpgrade = useCallback(
    (plan: AvailablePlan) => {
      if (hasActivePaidSubscription) {
        openBillingHandoff("account-subscription");
      } else {
        openBillingHandoff("pricing");
      }
    },
    [hasActivePaidSubscription],
  );

  const handleManage = useCallback(() => {
    openBillingHandoff("account-subscription");
  }, []);

  const quotaPercent = useMemo(() => {
    if (
      data?.quota.remainingSeconds == null ||
      data.quota.totalSeconds == null ||
      data.quota.totalSeconds <= 0
    ) {
      return null;
    }

    return Math.min(
      100,
      Math.max(
        0,
        (data.quota.remainingSeconds / data.quota.totalSeconds) * 100,
      ),
    );
  }, [data]);

  const currentPlanLabel =
    data?.currentPlan?.planName ?? t("subscription.noActivePlan");

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("subscription.title")} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>
            {t("subscription.heroEyebrow")}
          </Text>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
            {currentPlanLabel}
          </Text>
          <Text
            style={[styles.heroSubtitle, { color: theme.colors.textSecondary }]}
          >
            {isLoading
              ? t("common.loading")
              : data?.currentPlan
                ? t("subscription.heroSubtitle", {
                    cycle: formatCycle(data.currentPlan.billingCycleType, t),
                  })
                : t("subscription.noActivePlanHint")}
          </Text>

          <View style={styles.heroMetaRow}>
            <View
              style={[
                styles.heroMeta,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={[styles.heroMetaLabel, { color: theme.colors.textTertiary }]}
              >
                {t("subscription.quotaLabel")}
              </Text>
              <Text style={[styles.heroMetaValue, { color: theme.colors.text }]}>
                {data?.quota.remainingSeconds == null ||
                data?.quota.totalSeconds == null
                  ? t("subscription.unlimitedQuota")
                  : t("subscription.quotaSummary", {
                      remaining: Math.floor(data.quota.remainingSeconds / 60),
                      total: Math.floor(data.quota.totalSeconds / 60),
                    })}
              </Text>
            </View>
            <View
              style={[
                styles.heroMeta,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={[styles.heroMetaLabel, { color: theme.colors.textTertiary }]}
              >
                {t("subscription.aiCreditsLabel")}
              </Text>
              <Text style={[styles.heroMetaValue, { color: theme.colors.text }]}>
                {t("subscription.aiCreditsSummary", {
                  remaining: data?.aiCredits.remaining ?? 0,
                  total: data?.aiCredits.includedPerCycle ?? 0,
                })}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t("subscription.mediaQuotaTitle")}
          </Text>
          {quotaPercent != null ? (
            <>
              <View style={styles.progressRow}>
                <Text
                  style={[styles.progressText, { color: theme.colors.textSecondary }]}
                >
                  {t("subscription.quotaSummary", {
                    remaining: Math.floor(
                      (data?.quota.remainingSeconds ?? 0) / 60,
                    ),
                    total: Math.floor((data?.quota.totalSeconds ?? 0) / 60),
                  })}
                </Text>
                <Text
                  style={[styles.progressText, { color: theme.colors.textSecondary }]}
                >
                  {Math.round(quotaPercent)}%
                </Text>
              </View>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: theme.colors.border },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: theme.colors.primary,
                      width: `${quotaPercent}%`,
                    },
                  ]}
                />
              </View>
            </>
          ) : (
            <Text
              style={[styles.sectionBody, { color: theme.colors.textSecondary }]}
            >
              {t("subscription.unlimitedQuota")}
            </Text>
          )}

          <Text
            style={[styles.sectionBody, { color: theme.colors.textSecondary }]}
          >
            {t("subscription.maxDurationSummary", {
              minutes:
                data?.quota.maxDurationPerFileSeconds == null
                  ? t("subscription.unlimitedShort")
                  : Math.ceil(data.quota.maxDurationPerFileSeconds / 60),
            })}
          </Text>
          <Text
            style={[styles.sectionFootnote, { color: theme.colors.textTertiary }]}
          >
            {data
              ? t("subscription.windowSummary", {
                  date: new Date(data.quota.windowEndAt).toLocaleDateString(),
                })
              : t("common.loading")}
          </Text>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t("subscription.availablePlansTitle")}
          </Text>
          <Text
            style={[styles.sectionFootnote, { color: theme.colors.textSecondary }]}
          >
            {t("subscription.availablePlansHint")}
          </Text>

          <View style={styles.planList}>
            {data?.availablePlans.map((plan) => (
              <View
                key={plan.variantId}
                style={[
                  styles.planCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: plan.isCurrent
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <View style={styles.planHeader}>
                  <View style={styles.planIdentity}>
                    <Text
                      style={[styles.planTitle, { color: theme.colors.text }]}
                    >
                      {plan.planName}
                    </Text>
                    <Text
                      style={[
                        styles.planVariant,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      {plan.variantName}
                    </Text>
                  </View>
                  {plan.isCurrent ? (
                    <View
                      style={[
                        styles.currentBadge,
                        { backgroundColor: theme.colors.primary + "18" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.currentBadgeText,
                          { color: theme.colors.primary },
                        ]}
                      >
                        {t("subscription.currentPlanBadge")}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={[styles.planPrice, { color: theme.colors.text }]}>
                  {formatPlanPrice(plan, t)}
                </Text>
                <Text
                  style={[styles.planLimit, { color: theme.colors.textSecondary }]}
                >
                  {t("subscription.planQuotaLine", {
                    quota: formatMinutes(
                      plan.monthlyQuotaSeconds,
                      t("subscription.unlimitedShort"),
                    ),
                  })}
                </Text>
                <Text
                  style={[styles.planLimit, { color: theme.colors.textSecondary }]}
                >
                  {t("subscription.planDurationLine", {
                    duration: formatMinutes(
                      plan.maxDurationPerFileSeconds,
                      t("subscription.unlimitedShort"),
                    ),
                  })}
                </Text>
                <Text
                  style={[styles.planLimit, { color: theme.colors.textSecondary }]}
                >
                  {t("subscription.planCreditsLine", {
                    credits: plan.aiCreditsPerMonth,
                  })}
                </Text>

                {plan.features.slice(0, 3).map((feature) => (
                  <View key={`${plan.variantId}-${feature}`} style={styles.featureRow}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                    <Text
                      style={[
                        styles.featureText,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      {feature}
                    </Text>
                  </View>
                ))}

                {!plan.isCurrent ? (
                  <Button
                    title={
                      hasActivePaidSubscription
                        ? t("subscription.manageAction")
                        : t("subscription.upgradeAction")
                    }
                    onPress={() => handleUpgrade(plan)}
                    style={styles.planButton}
                  />
                ) : hasActivePaidSubscription ? (
                  <Button
                    title={t("subscription.manageAction")}
                    onPress={handleManage}
                    style={styles.planButton}
                    variant="secondary"
                  />
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: 48,
    gap: theme.spacing[4],
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: theme.radii["2xl"],
    padding: theme.spacing[5],
    gap: theme.spacing[2],
  },
  eyebrow: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: theme.typography.sizes["2xl"],
    fontWeight: theme.typography.weights.bold,
  },
  heroSubtitle: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: 20,
  },
  heroMetaRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  heroMeta: {
    flex: 1,
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    padding: theme.spacing[3],
    gap: theme.spacing[1],
  },
  heroMetaLabel: {
    fontSize: theme.typography.sizes.xs,
  },
  heroMetaValue: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    padding: theme.spacing[5],
    gap: theme.spacing[3],
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
  },
  sectionBody: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: 20,
  },
  sectionFootnote: {
    fontSize: theme.typography.sizes.xs,
    lineHeight: 18,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressText: {
    fontSize: theme.typography.sizes.sm,
  },
  progressTrack: {
    height: 8,
    borderRadius: theme.radii.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: theme.radii.full,
  },
  planList: {
    gap: theme.spacing[3],
  },
  planCard: {
    borderWidth: 1,
    borderRadius: theme.radii.xl,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  planIdentity: {
    flex: 1,
    gap: 2,
  },
  planTitle: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.bold,
  },
  planVariant: {
    fontSize: theme.typography.sizes.sm,
  },
  currentBadge: {
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 6,
  },
  currentBadgeText: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.bold,
  },
  planPrice: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
  },
  planLimit: {
    fontSize: theme.typography.sizes.sm,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  featureText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    lineHeight: 20,
  },
  planButton: {
    marginTop: theme.spacing[2],
  },
}));
