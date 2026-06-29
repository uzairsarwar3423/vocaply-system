import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/cache/query-keys';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/store/auth.store';

export function useUnreadCount() {
  const userId = useAuthStore((state) => state.user?.id) || '';

  const query = useQuery({
    queryKey: queryKeys.notifications.unreadCount(userId),
    queryFn: async (): Promise<number> => {
      const response = await api.get<{ data: { count: number } }>('/notifications/unread-count');
      return response.data.data.count;
    },
    enabled: !!userId,
  });

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}
