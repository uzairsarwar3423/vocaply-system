import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/cache/query-keys';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/store/auth.store';
import type { NotificationPreferences, PartialNotificationPreferences } from '../types';

export function useNotificationPrefs() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id) || '';

  const queryKey = queryKeys.notifications.preferences(userId);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<NotificationPreferences> => {
      const response = await api.get<{ data: { preferences: NotificationPreferences } }>(
        '/notifications/preferences'
      );
      return response.data.data.preferences;
    },
    enabled: !!userId,
  });

  const mutation = useMutation({
    mutationFn: async (patch: PartialNotificationPreferences): Promise<NotificationPreferences> => {
      const response = await api.patch<{ data: { preferences: NotificationPreferences } }>(
        '/notifications/preferences',
        patch
      );
      return response.data.data.preferences;
    },
    onMutate: async (newPatch) => {
      await queryClient.cancelQueries({ queryKey });

      const previousPrefs = queryClient.getQueryData<NotificationPreferences>(queryKey);

      if (previousPrefs) {
        const optimisticallyUpdated = {
          email: { ...previousPrefs.email, ...newPatch.email },
          slack: { ...previousPrefs.slack, ...newPatch.slack },
          inApp: { ...previousPrefs.inApp, ...newPatch.inApp },
        };
        queryClient.setQueryData<NotificationPreferences>(queryKey, optimisticallyUpdated);
      }

      return { previousPrefs };
    },
    onError: (_err, _newPatch, context) => {
      // Revert after 120ms to let the toggle switch animation play smoothly before snapping back
      setTimeout(() => {
        if (context?.previousPrefs) {
          queryClient.setQueryData(queryKey, context.previousPrefs);
        }
      }, 120);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    isUpdating: mutation.isPending,
    updatePreferences: mutation.mutate,
    error: query.error || mutation.error,
  };
}
