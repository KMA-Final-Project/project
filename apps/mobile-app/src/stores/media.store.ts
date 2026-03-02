/**
 * Media Store — Kapter
 *
 * Zustand store to manage the user's media library and filters.
 */
import { create } from "zustand";
import { mediaService } from "@/services/media";
import type { MediaItem } from "@/types/media";

interface MediaState {
  items: MediaItem[];
  isLoading: boolean;
  error: string | null;
  filter: string;

  setFilter: (filter: string) => void;
  fetchLibrary: () => Promise<void>;
  refreshItem: (id: string) => Promise<void>;
  addItemLocally: (item: MediaItem) => void;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  filter: "ALL", // "ALL" | "PROCESSING" | "COMPLETED" | "FAILED"

  setFilter: (filter) => set({ filter }),

  fetchLibrary: async () => {
    try {
      set({ isLoading: true, error: null });
      const items = await mediaService.getLibrary();
      set({ items, isLoading: false });
    } catch (err: any) {
      set({
        isLoading: false,
        error:
          err.response?.data?.message ||
          err.message ||
          "Failed to load library",
      });
    }
  },

  refreshItem: async (id: string) => {
    try {
      const statusRes = await mediaService.getStatus(id);
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id
            ? {
                ...item,
                status: statusRes.status,
                progress: statusRes.progress,
                failReason: statusRes.failReason,
              }
            : item,
        ),
      }));
    } catch (err) {
      console.error(`Failed to refresh item ${id}:`, err);
    }
  },

  addItemLocally: (item) => {
    set((state) => ({
      items: [item, ...state.items],
    }));
  },
}));
