import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '@/shared/lib/cache/query-keys';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { socketManager } from '@/shared/lib/websocket/socket';
import { SERVER_EVENTS } from '@/shared/lib/websocket/socket.events';
import type { InAppNotification } from '../types';

interface NotificationsPage {
  items: InAppNotification[];
  nextCursor?: string;
}

export function useInAppNotifications() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id) || '';

  const queryKey = queryKeys.notifications.inApp(userId);
  const unreadCountKey = queryKeys.notifications.unreadCount(userId);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<NotificationsPage> => {
      const response = await api.get<{ data: NotificationsPage }>('/notifications/in-app', {
        params: {
          limit: 10,
          cursor: pageParam || undefined,
        },
      });
      return response.data.data;
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!userId,
  });

  // Mark single as read mutation
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/in-app/${id}/read`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      await queryClient.cancelQueries({ queryKey: unreadCountKey });

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: any) =>
              item.id === id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item
            ),
          })),
        };
      });

      queryClient.setQueryData(unreadCountKey, (old: number | undefined) => {
        if (old === undefined) return 0;
        return Math.max(0, old - 1);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: unreadCountKey });
    },
  });

  // Mark all as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.post('/notifications/in-app/read-all');
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      await queryClient.cancelQueries({ queryKey: unreadCountKey });

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: any) => ({
              ...item,
              isRead: true,
              readAt: new Date().toISOString(),
            })),
          })),
        };
      });

      queryClient.setQueryData(unreadCountKey, 0);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: unreadCountKey });
    },
  });

  // Listen to realtime socket events
  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    const handleNotificationCreated = (notification: InAppNotification) => {
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        const firstPage = old.pages[0];
        if (!firstPage) return old;

        const exists = old.pages.some((page: any) =>
          page.items.some((item: any) => item.id === notification.id)
        );
        if (exists) return old;

        const newPages = [...old.pages];
        newPages[0] = {
          ...firstPage,
          items: [notification, ...firstPage.items],
        };

        return {
          ...old,
          pages: newPages,
        };
      });

      queryClient.setQueryData(unreadCountKey, (old: number | undefined) => {
        if (old === undefined) return 1;
        return old + 1;
      });
    };

    const handleNotificationRead = (payload: { id?: string; all?: boolean }) => {
      if (payload.all) {
        queryClient.setQueryData(queryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              items: page.items.map((item: any) => ({
                ...item,
                isRead: true,
                readAt: new Date().toISOString(),
              })),
            })),
          };
        });

        queryClient.setQueryData(unreadCountKey, 0);
      } else if (payload.id) {
        queryClient.setQueryData(queryKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              items: page.items.map((item: any) =>
                item.id === payload.id
                  ? { ...item, isRead: true, readAt: new Date().toISOString() }
                  : item
              ),
            })),
          };
        });

        queryClient.setQueryData(unreadCountKey, (old: number | undefined) => {
          if (old === undefined) return 0;
          return Math.max(0, old - 1);
        });
      }
    };

    socket.on(SERVER_EVENTS.NOTIFICATION_CREATED, handleNotificationCreated);
    socket.on(SERVER_EVENTS.NOTIFICATION_READ, handleNotificationRead);

    return () => {
      socket.off(SERVER_EVENTS.NOTIFICATION_CREATED, handleNotificationCreated);
      socket.off(SERVER_EVENTS.NOTIFICATION_READ, handleNotificationRead);
    };
  }, [queryClient, queryKey, unreadCountKey]);

  return {
    notifications: query.data?.pages.flatMap((page) => page.items) ?? [],
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    isLoading: query.isLoading,
    error: query.error,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
  };
}
