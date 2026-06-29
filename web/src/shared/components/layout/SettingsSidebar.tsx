"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  href: string;
  label: string;
  enabled: boolean;
  comingDay?: number;
}

const SETTINGS_NAV: readonly NavItem[] = [
  { href: '/settings/profile', label: 'Profile', enabled: true },
  { href: '/settings/team', label: 'Team', enabled: true },
  { href: '/settings/members', label: 'Members', enabled: true },
  { href: '/settings/integrations', label: 'Integrations', enabled: true },
  { href: '/settings/billing', label: 'Billing', enabled: true },
  { href: '/settings/notifications', label: 'Notifications', enabled: true },
  { href: '/settings/security', label: 'Security', enabled: true },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="w-[220px] shrink-0 py-4 px-2 select-none">
      <h2 className="font-heading font-semibold text-[13px] px-2 mb-2 text-muted-foreground uppercase tracking-wider">
        Settings
      </h2>
      <ul className="space-y-0.5">
        {SETTINGS_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          if (!item.enabled) {
            return (
              <li key={item.href}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center justify-between h-8 px-2 rounded-md text-[13px] font-sans text-muted-foreground/50 cursor-default">
                        {item.label}
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 normal-case font-normal select-none">Soon</Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      Coming Day {item.comingDay}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center h-8 px-2 rounded-md text-[13px] font-sans transition-colors duration-150',
                  active
                    ? 'font-medium bg-muted text-foreground'
                    : 'font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
