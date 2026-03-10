import { useMemo } from "react";
import { useSupabaseAuth } from "../SupabaseProvider";

export function useGreeting(): string {
  const { user } = useSupabaseAuth();

  return useMemo(() => {
    const h = new Date().getHours();
    let time = "Good evening";
    if (h >= 5 && h < 12) time = "Good morning";
    else if (h >= 12 && h < 18) time = "Good afternoon";

    let name = "there";
    if (user) {
      const full = (user.user_metadata?.full_name as string)?.trim();
      if (full) name = full.split(/\s+/)[0] || full;
      else {
        const email = (user.email ?? "").split("@")[0];
        if (email) name = email.charAt(0).toUpperCase() + email.slice(1).toLowerCase();
      }
    }
    return `${time}, ${name}`;
  }, [user]);
}
