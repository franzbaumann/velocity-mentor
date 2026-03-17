import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabase } from "./shared/supabase";

const AUTH_CALLBACK_URL = "velocitycoach://auth/callback";

function parseSessionFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  if (!url.startsWith(AUTH_CALLBACK_URL)) return null;
  const hash = url.split("#")[1];
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

async function handleAuthUrl(url: string) {
  const session = parseSessionFromUrl(url);
  if (!session) return;
  try {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch (_) {
    // ignore; onAuthStateChange will still fire if Supabase accepted it
  }
}

type SupabaseContextValue = {
  client: SupabaseClient;
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  devBypass: boolean;
  bypassLogin: () => void;
};

const SupabaseContext = createContext<SupabaseContextValue | undefined>(undefined);

export const SupabaseProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [devBypass, setDevBypass] = useState(false);
  const lastSessionRef = useRef<Pick<NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>>["data"]["session"], "expires_at" | "user"> | null>(null);
  const intentionalSignOutRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("[auth] getSession error during init", error);
        }
        const session = data.session ?? null;
        lastSessionRef.current = session
          ? { expires_at: session.expires_at, user: session.user }
          : null;
        if (!isMounted) return;
        setUser(session?.user ?? null);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    init();

    Linking.getInitialURL().then((url) => {
      if (url) handleAuthUrl(url);
    });
    const linkSub = Linking.addEventListener("url", ({ url }) => handleAuthUrl(url));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (_event === "SIGNED_OUT" && !intentionalSignOutRef.current) {
        const last = lastSessionRef.current;
        console.warn("[auth] Unexpected SIGNED_OUT event", {
          hadPreviousUser: !!last?.user,
          previousUserId: last?.user?.id,
          previousExpiresAt: last?.expires_at,
        });
      }
      if (session) {
        lastSessionRef.current = {
          expires_at: session.expires_at,
          user: session.user,
        };
      } else {
        lastSessionRef.current = null;
      }
      setUser(session?.user ?? null);
      setLoading(false);
      if (_event === "TOKEN_REFRESHED") {
        console.log("[auth] Token refreshed", {
          expires_at: session?.expires_at,
          userId: session?.user?.id,
        });
      }
    });

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth
          .refreshSession()
          .then(({ data, error }) => {
            if (error) {
              console.warn("[auth] refreshSession error on foreground", error);
            } else if (data.session) {
              lastSessionRef.current = {
                expires_at: data.session.expires_at,
                user: data.session.user,
              };
            }
          })
          .catch((err) => {
            console.warn("[auth] refreshSession throw on foreground", err);
          });
      }
    });

    return () => {
      isMounted = false;
      linkSub.remove();
      subscription?.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    if (error) throw error;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    intentionalSignOutRef.current = true;
    await supabase.auth.signOut();
    intentionalSignOutRef.current = false;
  }, []);

  const bypassLogin = useCallback(() => {
    setDevBypass(true);
    setLoading(false);
  }, []);

  const value = useMemo<SupabaseContextValue>(
    () => ({
      client: supabase,
      user,
      loading,
      signInWithEmail,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      devBypass,
      bypassLogin,
    }),
    [user, loading, devBypass]
  );

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
};

export const useSupabase = () => {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error("useSupabase must be used inside SupabaseProvider");
  }
  return ctx.client;
};

export const useSupabaseAuth = () => {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error("useSupabaseAuth must be used inside SupabaseProvider");
  }
  const {
    user,
    loading,
    signInWithEmail,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    devBypass,
    bypassLogin,
  } = ctx;
  return {
    user,
    loading,
    signInWithEmail,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    devBypass,
    bypassLogin,
  };
};

