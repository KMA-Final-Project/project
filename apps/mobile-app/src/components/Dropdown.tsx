import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";

interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  style?: any;
}



export function Dropdown({ label, value, options, onChange, style }: DropdownProps) {
  const { theme } = useUnistyles();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  const handleSelect = (val: string) => {
    onChange(val);
    setModalVisible(false);
  };

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      
      <Pressable
        style={({ pressed }) => [
          styles.dropdownButton,
          pressed && styles.dropdownButtonPressed,
        ]}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.dropdownButtonText} numberOfLines={1}>
          {selectedOption?.label}
        </Text>
        <Ionicons
          name="chevron-down"
          size={16}
          color={theme.colors.textSecondary}
        />
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{label}</Text>
                <FlatList
                  data={options}
                  keyExtractor={(item) => item.value}
                  renderItem={({ item }) => {
                    const isSelected = item.value === value;
                    return (
                      <Pressable
                        style={[
                          styles.optionItem,
                          isSelected && styles.optionItemActive,
                        ]}
                        onPress={() => handleSelect(item.value)}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            isSelected && styles.optionTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={theme.colors.primary}
                          />
                        )}
                      </Pressable>
                    );
                  }}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(1.5) || 6,
  },
  label: {
    fontSize: theme.typography.sizes.xs || 12,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textSecondary,
  },
  dropdownButton: {
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md || 8,
    paddingHorizontal: theme.spacing[3] || 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
  },
  dropdownButtonPressed: {
    borderColor: theme.colors.primary,
  },
  dropdownButtonText: {
    fontSize: theme.typography.sizes.sm || 14,
    color: theme.colors.text,
    flex: 1,
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing[6] || 24,
  },
  modalContent: {
    width: "100%",
    maxHeight: 280,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl || 16,
    padding: theme.spacing[5] || 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  modalTitle: {
    fontSize: theme.typography.sizes.base || 16,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing[4] || 16,
    textAlign: "center",
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[3] || 12,
    paddingHorizontal: theme.spacing[2] || 8,
    borderRadius: theme.radii.md || 8,
  },
  optionItemActive: {
    backgroundColor: "rgba(32, 138, 239, 0.08)", // Transparent brand primary
  },
  optionText: {
    fontSize: theme.typography.sizes.sm || 14,
    color: theme.colors.textSecondary,
  },
  optionTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.semibold,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
}));
