'use client';

import React from 'react';
import { useNotificationPrefs } from '../hooks/useNotificationPrefs';
import { useIntegrations } from '@/features/integrations/hooks/useIntegrations';
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_MAP } from '../data/notification-types.config';
import { NotificationPreferencesFormSkeleton } from './NotificationPreferencesFormSkeleton';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Mail, Bell, Info, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export function NotificationPreferencesForm() {
  const { preferences, isLoading, updatePreferences } = useNotificationPrefs();
  const { data: integrationsData } = useIntegrations();

  // Check if Slack is connected
  const isSlackConnected = integrationsData?.teamIntegrations?.some(
    (integration) => integration.provider === 'SLACK' && integration.isActive
  ) ?? false;

  // Delegate loading state to the proper extracted skeleton component
  if (isLoading || !preferences) {
    return <NotificationPreferencesFormSkeleton />;
  }


  // Toggle cell handler
  const handleToggle = (typeId: string, channel: 'email' | 'slack') => {
    const prefKey = NOTIFICATION_TYPE_MAP[typeId]?.[channel];
    if (!prefKey) return;

    const currentVal = preferences[channel]?.[prefKey as keyof typeof preferences.email] !== false;
    
    updatePreferences({
      [channel]: {
        [prefKey]: !currentVal,
      },
    });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Slack Connection Alert Hint */}
        <div
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-all duration-300 ${
            isSlackConnected
              ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
              : 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400'
          }`}
        >
          <Info className="mt-0.5 h-4.5 w-4.5 shrink-0" />
          <div className="flex-1">
            <span className="font-medium">
              {isSlackConnected
                ? 'Slack integration connected.'
                : 'Slack integration is not connected.'}
            </span>{' '}
            {isSlackConnected ? (
              <span>You can configure both Email and Slack notification triggers.</span>
            ) : (
              <span>
                To receive team alerts directly in your Slack workspace, please{' '}
                <Link
                  href="/settings/integrations"
                  className="font-semibold underline hover:opacity-80 inline-flex items-center gap-0.5"
                >
                  Connect Slack in Integrations <ExternalLink className="h-3 w-3" />
                </Link>
                .
              </span>
            )}
          </div>
        </div>

        {/* Preferences Grid Table */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-xl shadow-black/5 overflow-hidden">
          <CardHeader className="border-b border-border/40 bg-muted/20 px-6 py-5">
            <h2 className="text-xl font-semibold tracking-tight text-foreground font-sans">
              Preferences Matrix
            </h2>
            <p className="text-muted-foreground text-sm">
              Map notification channels for each system event type.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="min-w-full overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-4 font-medium">Notification Event Type</th>
                    <th className="px-6 py-4 text-center font-medium w-32">
                      <div className="flex items-center justify-center gap-1.5">
                        <Mail className="h-4 w-4" /> Email
                      </div>
                    </th>
                    <th className="px-6 py-4 text-center font-medium w-32">
                      <div className="flex items-center justify-center gap-1.5">
                        <img src="/icons/slack.svg" alt="Slack" className="h-4 w-4 object-contain" /> Slack
                      </div>
                    </th>
                    <th className="px-6 py-4 text-center font-medium w-32">
                      <div className="flex items-center justify-center gap-1.5">
                        <Bell className="h-4 w-4" /> In-App
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {NOTIFICATION_TYPES.map((type) => {
                    const emailPrefKey = NOTIFICATION_TYPE_MAP[type.id]?.email;
                    const slackPrefKey = NOTIFICATION_TYPE_MAP[type.id]?.slack;

                    const isEmailChecked =
                      emailPrefKey &&
                      preferences.email?.[emailPrefKey as keyof typeof preferences.email] !== false;

                    const isSlackChecked =
                      isSlackConnected &&
                      slackPrefKey &&
                      preferences.slack?.[slackPrefKey as keyof typeof preferences.slack] !== false;

                    return (
                      <tr
                        key={type.id}
                        className="group hover:bg-muted/10 transition-colors duration-150"
                      >
                        <td className="px-6 py-4.5">
                          <div className="font-medium text-foreground text-sm leading-snug">
                            {type.label}
                          </div>
                          <div className="text-muted-foreground text-xs mt-1 max-w-md leading-relaxed">
                            {type.description}
                          </div>
                        </td>

                        {/* Email Column */}
                        <td className="px-6 py-4.5 text-center">
                          <div className="flex justify-center">
                            <Switch
                              checked={!!isEmailChecked}
                              onCheckedChange={() => handleToggle(type.id, 'email')}
                              aria-label={`Enable Email for ${type.label}`}
                              className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white"
                            />
                          </div>
                        </td>

                        {/* Slack Column */}
                        <td className="px-6 py-4.5 text-center">
                          <div className="flex justify-center transition-opacity duration-300">
                            {isSlackConnected ? (
                              <Switch
                                checked={!!isSlackChecked}
                                onCheckedChange={() => handleToggle(type.id, 'slack')}
                                aria-label={`Enable Slack for ${type.label}`}
                                className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white"
                              />
                            ) : (
                              <Tooltip delayDuration={100}>
                                <TooltipTrigger asChild>
                                  <div className="cursor-not-allowed">
                                    <Switch
                                      checked={false}
                                      disabled
                                      className="opacity-40"
                                      aria-label={`Enable Slack for ${type.label} (Slack disconnected)`}
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                                  Slack is disconnected. Connect in integrations to enable.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </td>

                        {/* In-App Column */}
                        <td className="px-6 py-4.5 text-center">
                          <div className="flex justify-center">
                            <Tooltip delayDuration={100}>
                              <TooltipTrigger asChild>
                                <div className="cursor-not-allowed">
                                  <Switch checked disabled className="opacity-70 data-[state=checked]:bg-black dark:data-[state=checked]:bg-white" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                                In-app notifications are mandatory for essential workspace updates.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
