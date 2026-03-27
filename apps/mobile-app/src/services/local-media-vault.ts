/**
 * Local Media Vault — Kapter
 *
 * Simple app-sandbox media registry for device-selected originals.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
} from "expo-file-system";

const VAULT_KEY = "@kapter/local-vault";
const VAULT_DIR = `${documentDirectory ?? ""}local-media-vault`;

export interface LocalVaultEntry {
  mediaItemId: string;
  localUri: string;
  originalFileName: string;
  mediaKind: "audio" | "video";
  sizeBytes: number;
  durationSec: number | null;
  createdAt: string;
  pinned: boolean; // if true, don't evict automatically
}

interface SaveLocalVaultEntryInput {
  mediaItemId: string;
  sourceUri: string;
  originalFileName: string;
  mediaKind: LocalVaultEntry["mediaKind"];
  sizeBytes: number;
  durationSec: number | null;
  pinned?: boolean;
}

const ensureVaultDirectory = async (): Promise<void> => {
  const vaultInfo = await getInfoAsync(VAULT_DIR);

  if (!vaultInfo.exists) {
    await makeDirectoryAsync(VAULT_DIR, { intermediates: true });
  }
};

const sanitizeFileName = (fileName: string): string =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

export const localMediaVault = {
  /** Get the whole vault map */
  async getVault(): Promise<Record<string, LocalVaultEntry>> {
    await ensureVaultDirectory();
    const data = await AsyncStorage.getItem(VAULT_KEY);
    return data ? JSON.parse(data) : {};
  },

  /** Save a new entry */
  async saveEntry(entry: LocalVaultEntry): Promise<void> {
    const vault = await this.getVault();
    vault[entry.mediaItemId] = entry;
    await AsyncStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  },

  /** Copy a picked file into the app sandbox and register it in the vault */
  async copyIntoVault(
    input: SaveLocalVaultEntryInput,
  ): Promise<LocalVaultEntry> {
    await ensureVaultDirectory();

    const fileName = sanitizeFileName(input.originalFileName);
    const targetUri = `${VAULT_DIR}/${input.mediaItemId}-${Date.now()}-${fileName}`;

    await copyAsync({
      from: input.sourceUri,
      to: targetUri,
    });

    const entry: LocalVaultEntry = {
      mediaItemId: input.mediaItemId,
      localUri: targetUri,
      originalFileName: input.originalFileName,
      mediaKind: input.mediaKind,
      sizeBytes: input.sizeBytes,
      durationSec: input.durationSec,
      createdAt: new Date().toISOString(),
      pinned: input.pinned ?? false,
    };

    await this.saveEntry(entry);

    return entry;
  },

  /** Get an entry by mediaItemId */
  async getEntry(mediaItemId: string): Promise<LocalVaultEntry | null> {
    const vault = await this.getVault();
    const entry = vault[mediaItemId];
    if (!entry) return null;

    // Verify file still exists
    const fileInfo = await getInfoAsync(entry.localUri);
    if (!fileInfo.exists) {
      await this.removeEntry(mediaItemId);
      return null;
    }

    return entry;
  },

  /** Remove an entry from the vault and optionally delete the copied file */
  async removeEntry(
    mediaItemId: string,
    options?: { deleteFile?: boolean },
  ): Promise<void> {
    const vault = await this.getVault();
    const entry = vault[mediaItemId];

    if (!entry) {
      return;
    }

    if (options?.deleteFile) {
      await deleteAsync(entry.localUri, { idempotent: true });
    }

    delete vault[mediaItemId];
    await AsyncStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  },
};
