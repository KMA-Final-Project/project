import { ENDPOINTS } from "@/constants/endpoint";
import { api } from "@/services/api";
import type { WordBankListResponse } from "@/types/word-bank";

export const wordBankService = {
  async getWordBank(): Promise<WordBankListResponse> {
    const res = await api.get<WordBankListResponse>(ENDPOINTS.WORD_BANK_LIST);
    return res.data;
  },
};
