import { useActivities } from "@/hooks/useActivities";
import { useReadiness } from "@/hooks/useReadiness";

export function useMergedActivities(days = 730) {
  const { data: supabaseActivities = [], isLoading: supabaseLoading } = useActivities(days);

  return {
    data: supabaseActivities,
    isLoading: supabaseLoading,
  };
}

export function useMergedReadiness(days = 730) {
  const { data: supabaseReadiness = [], isLoading: supabaseLoading } = useReadiness(days);

  return {
    data: supabaseReadiness,
    isLoading: supabaseLoading,
  };
}
