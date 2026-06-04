import { useQuery } from "@tanstack/react-query";
import { wordBankService } from "@/services/word-bank.service";

export const wordBankKeys = {
  all: ["word-bank"] as const,
};

export function useWordBank() {
  return useQuery({
    queryKey: wordBankKeys.all,
    queryFn: () => wordBankService.getWordBank(),
  });
}
