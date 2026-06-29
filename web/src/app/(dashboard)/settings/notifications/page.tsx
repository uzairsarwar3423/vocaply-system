import type { Metadata } from 'next';
import { NotificationPreferencesForm } from '@/features/notifications/components/NotificationPreferencesForm';

export const metadata: Metadata = {
  title: 'Notification Settings',
  description: 'Manage your notification preferences, channels, and delivery settings.',
};

export default function NotificationSettingsPage() {
  return (
    <div className="max-w-[760px] space-y-6">
      <div>
        <h1
          className="font-heading font-semibold text-foreground leading-[28px] tracking-[-0.01em] mb-1.5"
          style={{ fontSize: "20px" }}
        >
          Notification Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure how and when you receive notifications from Vocaply.
        </p>
      </div>

      <NotificationPreferencesForm />
    </div>
  );
}
