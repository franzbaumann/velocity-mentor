import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  requestAuthorization,
} from "@kingstinct/react-native-healthkit";
import { appleHealthReadAuth } from "../lib/appleHealth";

export function useAppleHealth() {
  const [kitAvailable, setKitAvailable] = useState(false);
  const [requestStatus, setRequestStatus] =
    useState<AuthorizationRequestStatus | null>(null);
  const [loading, setLoading] = useState(Platform.OS === "ios");
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    if (Platform.OS !== "ios") {
      setKitAvailable(false);
      setRequestStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ok = isHealthDataAvailable();
      setKitAvailable(ok);
      if (ok) {
        const status = await getRequestStatusForAuthorization(appleHealthReadAuth);
        setRequestStatus(status);
      } else {
        setRequestStatus(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    if (Platform.OS !== "ios" || !kitAvailable) return false;
    setConnecting(true);
    try {
      await requestAuthorization(appleHealthReadAuth);
      await refresh();
      return true;
    } finally {
      setConnecting(false);
    }
  }, [kitAvailable, refresh]);

  return {
    supported: Platform.OS === "ios",
    kitAvailable,
    loading,
    connecting,
    requestStatus,
    hasBeenPrompted: requestStatus === AuthorizationRequestStatus.unnecessary,
    shouldShowSystemPrompt: requestStatus === AuthorizationRequestStatus.shouldRequest,
    refresh,
    connect,
  };
}
