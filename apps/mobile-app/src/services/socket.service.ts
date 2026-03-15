import { io, Socket } from "socket.io-client";
import { getTokens } from "./token-storage";
import { API_BASE_URL } from "./api";
import type {
  MediaProgressEvent,
  MediaChunkReadyEvent,
  MediaBatchReadyEvent,
  MediaCompletedEvent,
  MediaFailedEvent,
} from "@/types/socket-events";

// ─── Callback type aliases ───────────────────────────────────────

type ProgressCb = (e: MediaProgressEvent) => void;
type ChunkReadyCb = (e: MediaChunkReadyEvent) => void;
type BatchReadyCb = (e: MediaBatchReadyEvent) => void;
type CompletedCb = (e: MediaCompletedEvent) => void;
type FailedCb = (e: MediaFailedEvent) => void;

class SocketService {
  private socket: Socket | null = null;

  private progressListeners = new Set<ProgressCb>();
  private chunkReadyListeners = new Set<ChunkReadyCb>();
  private batchReadyListeners = new Set<BatchReadyCb>();
  private completedListeners = new Set<CompletedCb>();
  private failedListeners = new Set<FailedCb>();

  /**
   * Calculates the origin of the backend WebSocket server based on API_BASE_URL.
   * e.g. "http://10.0.2.2:3000/api" -> "http://10.0.2.2:3000"
   */
  private getSocketUrl() {
    try {
      const url = new URL(API_BASE_URL);
      return url.origin;
    } catch {
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

    // ── Per-event listeners matching backend SocketService events ──

    this.socket.on("media_progress", (event: MediaProgressEvent) => {
      this.progressListeners.forEach((cb) => cb(event));
    });

    this.socket.on("media_chunk_ready", (event: MediaChunkReadyEvent) => {
      this.chunkReadyListeners.forEach((cb) => cb(event));
    });

    this.socket.on("media_batch_ready", (event: MediaBatchReadyEvent) => {
      this.batchReadyListeners.forEach((cb) => cb(event));
    });

    this.socket.on("media_completed", (event: MediaCompletedEvent) => {
      this.completedListeners.forEach((cb) => cb(event));
    });

    this.socket.on("media_failed", (event: MediaFailedEvent) => {
      this.failedListeners.forEach((cb) => cb(event));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ─── Typed subscription methods (each returns an unsubscribe fn) ──

  onProgress(cb: ProgressCb) {
    this.progressListeners.add(cb);
    return () => {
      this.progressListeners.delete(cb);
    };
  }

  onChunkReady(cb: ChunkReadyCb) {
    this.chunkReadyListeners.add(cb);
    return () => {
      this.chunkReadyListeners.delete(cb);
    };
  }

  onBatchReady(cb: BatchReadyCb) {
    this.batchReadyListeners.add(cb);
    return () => {
      this.batchReadyListeners.delete(cb);
    };
  }

  onCompleted(cb: CompletedCb) {
    this.completedListeners.add(cb);
    return () => {
      this.completedListeners.delete(cb);
    };
  }

  onFailed(cb: FailedCb) {
    this.failedListeners.add(cb);
    return () => {
      this.failedListeners.delete(cb);
    };
  }
}

export const socketService = new SocketService();
