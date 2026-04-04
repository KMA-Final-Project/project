/**
 * Local Media Vault — Kapter
 *
 * Simple app-sandbox media registry for device-selected originals.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

const VAULT_KEY = "@kapter/local-vault";
const VAULT_DIR = new Directory(Paths.document, "local-media-vault");

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
  VAULT_DIR.create({ idempotent: true, intermediates: true });
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

    const existingEntry = await this.getEntry(input.mediaItemId);
    // delete existing file if present to avoid orphaned files and ensure we don't exceed storage limits
    if (existingEntry?.localUri) {
      await this.removeEntry(input.mediaItemId, { deleteFile: true });
    }

    const fileName = sanitizeFileName(input.originalFileName);
    const targetFile = new File(
      VAULT_DIR,
      `${input.mediaItemId}-${Date.now()}-${fileName}`,
    );
    const sourceFile = new File(input.sourceUri);

    sourceFile.copy(targetFile);

    const entry: LocalVaultEntry = {
      mediaItemId: input.mediaItemId,
      localUri: targetFile.uri,
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
    const localFile = new File(entry.localUri);
    if (!localFile.exists) {
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
      const localFile = new File(entry.localUri);
      if (localFile.exists) {
        localFile.delete();
      }
    }

    delete vault[mediaItemId];
    await AsyncStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  },
};
