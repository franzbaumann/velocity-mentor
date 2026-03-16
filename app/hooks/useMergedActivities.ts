import { useActivitiesList } from "./useActivities";

export function useMergedActivities(days = 730) {
  const base = useActivitiesList(days);

  return {
    data: base.items,
    isLoading: base.isLoading,
    isRefetching: base.isRefetching,
    refetch: base.refetch,
    isEmpty: base.isEmpty,
  };
}

