'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useInAppNotifications } from '../hooks/useInAppNotifications';
import { useUnreadCount } from '../hooks/useUnreadCount';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Check, Inbox, CheckSquare } from 'lucide-react';

export function NotificationBellDropdown() {
  const router = useRouter();
  const { notifications, markRead, markAllRead, isLoading } = useInAppNotifications();
  const { count } = useUnreadCount();

  const handleNotificationClick = (id: string, actionUrl: string | null) => {
    markRead(id);
    if (actionUrl) {
      router.push(actionUrl);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  // Limit display list to 10 items
  const recentNotifications = notifications.slice(0, 10);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 bg-background/50 hover:bg-muted text-muted-foreground hover:text-foreground outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={`View notifications, ${count} unread`}
        >
          <Bell className="h-4.5 w-4.5" />
          
          {/* Unread badge with scale transition and tabular-nums styling */}
          <span
            className={`absolute -top-1 -right-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground leading-none shadow-sm transition-all duration-300 ease-out origin-top-right select-none tabular-nums ${
              count > 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`}
          >
            {count > 99 ? '99+' : count}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[360px] p-0 border-border/40 bg-card/95 backdrop-blur-md shadow-2xl shadow-black/10 overflow-hidden"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-muted/15">
          <span className="text-sm font-semibold tracking-tight text-foreground font-sans">
            Notifications
          </span>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                markAllRead();
              }}
              className="h-7 px-2.5 text-xs text-primary hover:text-primary/80 hover:bg-primary/5 font-medium transition-colors"
            >
              <CheckSquare className="mr-1 h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>

        {/* List Content */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs text-muted-foreground">Loading notifications...</span>
          </div>
        ) : recentNotifications.length === 0 ? (
          /* Empty State */
          <div className="py-12 flex flex-col items-center justify-center text-center px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30 text-muted-foreground/60 mb-3 border border-dashed border-border/60">
              <Inbox className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium text-foreground">All caught up!</span>
            <span className="text-xs text-muted-foreground mt-1 max-w-[200px]">
              We will notify you here when new actions are needed.
            </span>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[360px]">
              <div className="divide-y divide-border/20">
                {recentNotifications.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    className="flex items-start gap-3 p-3.5 cursor-pointer hover:bg-muted/15 focus:bg-muted/15 focus:outline-none select-none transition-colors group relative"
                    onClick={() => handleNotificationClick(item.id, item.actionUrl)}
                  >
                    {/* Unread indicator dot */}
                    {!item.isRead && (
                      <span className="absolute left-2.5 top-5 h-2 w-2 rounded-full bg-primary" />
                    )}

                    <div className={`flex-1 min-w-0 ${!item.isRead ? 'pl-2' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-xs font-semibold leading-tight text-foreground ${!item.isRead ? 'font-bold' : ''}`}>
                          {item.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap pt-0.5 tabular-nums">
                          {formatTime(item.createdAt)}
                        </span>
                      </div>
                      
                      {item.body && (
                        <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2 leading-relaxed">
                          {item.body}
                        </p>
                      )}
                    </div>

                    {/* Inline checkmark mark-read button */}
                    {!item.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead(item.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex h-6 w-6 items-center justify-center rounded-md border border-border/40 bg-background hover:bg-primary hover:text-primary-foreground hover:border-transparent text-muted-foreground transition-all duration-150 shrink-0"
                        title="Mark as read"
                        aria-label="Mark as read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-border/30 bg-muted/10 px-4 py-2.5 text-center">
              <span className="text-[11px] font-medium text-muted-foreground">
                In-app history panel coming soon
              </span>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
