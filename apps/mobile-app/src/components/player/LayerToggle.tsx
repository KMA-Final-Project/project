import React from "react";
import { Switch, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { BottomSheet } from "@/components";
import type { PlayerLayer } from "@/stores/player.store";

interface LayerToggleProps {
  visible: boolean;
  onClose: () => void;
  showPhonetic: boolean;
  showTranslation: boolean;
  showKaraoke: boolean;
  onToggleLayer: (layer: PlayerLayer) => void;
}

export function LayerToggle({
  visible,
  onClose,
  showPhonetic,
  showTranslation,
  showKaraoke,
  onToggleLayer,
}: LayerToggleProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation("player");

  const rows: { key: PlayerLayer; label: string; value: boolean }[] = [
    { key: "phonetic", label: t("phonetic"), value: showPhonetic },
    { key: "translation", label: t("translation"), value: showTranslation },
    { key: "karaoke", label: t("karaoke"), value: showKaraoke },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t("layers")}
        </Text>
        {rows.map((row) => (
          <View key={row.key} style={styles.row}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              {row.label}
            </Text>
            <Switch
              value={row.value}
              onValueChange={() => onToggleLayer(row.key)}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primaryLight,
              }}
              thumbColor={theme.colors.textOnPrimary}
            />
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[4],
  },
  title: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[2],
  },
  label: {
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.medium,
  },
}));
