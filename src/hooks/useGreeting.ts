import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";

/** Time-based greeting: 05-11 morning, 12-17 afternoon, 18-04 evening */
export function useGreeting() {
  const { user } = useAuth();

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const firstName = useMemo(() => {
    if (!user) return "there";
    const full = (user.user_metadata?.full_name as string)?.trim();
    if (full) return full.split(/\s+/)[0] || full;
    const email = (user.email ?? "").split("@")[0];
    if (email) return email.charAt(0).toUpperCase() + email.slice(1).toLowerCase();
    return "there";
  }, [user]);

  return `${greeting}, ${firstName}`;
}
