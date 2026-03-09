import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketService } from "@/services/socket.service";
import { useAuthStore } from "@/stores/auth.store";
import { mediaKeys } from "./useMedia";

/**
 * Global hook to manage Socket.io connection and sync to React Query.
 * Should be mounted near the root of the app.
 */
export function useSocketSync() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Connection Management
  useEffect(() => {
    if (isAuthenticated) {
      socketService.connect();
    } else {
      socketService.disconnect();
    }

    return () => {
      socketService.disconnect();
    };
  }, [isAuthenticated]);

  // Event Listeners
  useEffect(() => {
    const unsubscribe = socketService.subscribeToMediaUpdates((media) => {
      // 1. Update the specific media query so Processing screen refreshes instantly
      queryClient.setQueryData(mediaKeys.status(media.id), media);

      // 2. Update the global media list so the Home library updates in background without fetching
      queryClient.setQueryData(mediaKeys.all, (oldData: any) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        return oldData.map((item: any) =>
          item.id === media.id ? { ...item, ...media } : item,
        );
      });
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);
}
