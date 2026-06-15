import * as WebBrowser from "expo-web-browser";
import { api } from "./api";
import type { MobileWebHandoffResponse } from "@kapter/contracts";

const CALLBACK_URL = "mobileapp://subscription";

export async function openBillingHandoff(
  target: "pricing" | "account-subscription",
){
  const response = await api.post<MobileWebHandoffResponse>(
    "/auth/mobile-web-handoff",
    { target },
  );

  return WebBrowser.openAuthSessionAsync(
    response.data.handoffUrl,
    CALLBACK_URL,
  );
}
