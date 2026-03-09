import { io, Socket } from "socket.io-client";
import { getTokens } from "./token-storage";
import { API_BASE_URL } from "./api";
import { MediaItem } from "@/types/media";

class SocketService {
  private socket: Socket | null = null;
  private listeners: Set<(media: MediaItem) => void> = new Set();

  /**
   * Calculates the origin of the backend WebSocket server based on API_BASE_URL.
   * e.g. "http://10.0.2.2:3000/api" -> "http://10.0.2.2:3000"
   */
  private getSocketUrl() {
    try {
      // In JS, new URL("http://10.0.2.2:3000/api").origin is "http://10.0.2.2:3000"
      const url = new URL(API_BASE_URL);
      return url.origin;
    } catch {
      // Fallback if parsing fails for some reason
      return API_BASE_URL.replace(/\/api\/?$/, "");
    }
  }

  async connect() {
    if (this.socket?.connected) return;

    const tokens = await getTokens();
    if (!tokens?.accessToken) {
      console.warn("[Socket] Cannot connect without access token");
      return;
    }

    const socketUrl = this.getSocketUrl();

    this.socket = io(socketUrl, {
      auth: { token: `Bearer ${tokens.accessToken}` },
      reconnection: true,
      transports: ["websocket"],
    });

    this.socket.on("connect", () => {
      console.log("[Socket] Connected to server", this.socket?.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error.message);
    });

    // Listen for media updates
    this.socket.on("media_updated", (media: MediaItem) => {
      console.log(
        `[Socket] Media ${media.id} updated to status ${media.status}`,
      );
      this.listeners.forEach((listener) => listener(media));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  subscribeToMediaUpdates(callback: (media: MediaItem) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}

export const socketService = new SocketService();
