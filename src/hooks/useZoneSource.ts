import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIntervalsIntegration } from "./useIntervalsIntegration";

/** Zone source hierarchy: lab test > intervals.icu > max HR formula */
export function useZoneSource(): string {
  const { isConnected: intervalsConnected } = useIntervalsIntegration();
  const { data: labSource } = useQuery({
    queryKey: ["zone-source-lab"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("athlete_profile")
        .select("vo2max, lactate_threshold_hr, lab_name, lab_test_date")
        .eq("user_id", user.id)
        .maybeSingle();
      const hasLab = data?.vo2max != null || data?.lactate_threshold_hr != null;
      if (!hasLab) return null;
      const lab = data?.lab_name ? ` (${data.lab_name})` : "";
      const date = data?.lab_test_date ? ` — ${data.lab_test_date}` : "";
      return `Lab test${lab}${date}`;
    },
  });
  if (labSource) return labSource;
  if (intervalsConnected) return "intervals.icu";
  return "Max HR";
}
