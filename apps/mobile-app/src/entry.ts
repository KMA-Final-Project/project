/**
 * Custom Entry Point — Kapter
 *
 * Ensures Unistyles themes and i18n are initialized
 * BEFORE expo-router loads any component.
 */
import "./i18n/i18n";
import "./theme/unistyles";
import "expo-router/entry";
