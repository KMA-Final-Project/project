import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ENDPOINTS } from "@/constants/endpoint";
import { api } from "@/services/api";
import type {
  LookupErrorResponse,
  LookupRequest,
  LookupResponse,
  SaveLookupWordRequest,
  SaveLookupWordResponse,
} from "@/types/lookup";

export function useVocabularyLookup(mediaId: string | null) {
  const lookupMutation = useMutation({
    mutationFn: async (payload: LookupRequest): Promise<LookupResponse> => {
      if (!mediaId) {
        throw new Error("Media ID is required for vocabulary lookup.");
      }

      const { data } = await api.post<LookupResponse>(
        ENDPOINTS.MEDIA_LOOKUP(mediaId),
        payload,
      );
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (
      payload: SaveLookupWordRequest,
    ): Promise<SaveLookupWordResponse> => {
      if (!mediaId) {
        throw new Error("Media ID is required for saving vocabulary.");
      }

      const { data } = await api.post<SaveLookupWordResponse>(
        ENDPOINTS.MEDIA_LOOKUP_BOOKMARK(mediaId),
        payload,
      );
      return data;
    },
  });

  return {
    lookupMutation,
    saveMutation,
  };
}

export function extractLookupError(error: unknown): LookupErrorResponse | null {
  if (!isAxiosError(error)) {
    return error instanceof Error
      ? { message: error.message }
      : { message: "Lookup request failed." };
  }

  const payload = error.response?.data;
  if (!payload || typeof payload !== "object") {
    return { message: error.message };
  }

  const candidate = payload as LookupErrorResponse;
  return {
    code: candidate.code,
    message:
      typeof candidate.message === "string" ? candidate.message : error.message,
    quota: candidate.quota,
  };
}
