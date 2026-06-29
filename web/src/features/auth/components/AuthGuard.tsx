"use client";

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/auth.store';
import { FullPageSpinner } from '@/components/shared/feedback/FullPageSpinner';
import { SessionExpiredModal } from './SessionExpiredModal';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const isSessionExpired = useAuthStore((state) => state.isSessionExpired);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated && !isSessionExpired) {
        router.push('/login');
      } else if (user && !user.onboardingCompleted) {
        const isExemptRoute = pathname.startsWith('/onboarding') || pathname.startsWith('/invite');
        if (!isExemptRoute) {
          if (!user.teamId) {
            router.push('/onboarding');
          } else {
            router.push('/onboarding/connect-calendar');
          }
        }
      }
    }
  }, [isLoading, isAuthenticated, isSessionExpired, user, router, pathname]);

  // If still fetching initial status, show loading spinner
  if (isLoading) {
    return <FullPageSpinner />;
  }

  const isOnboardingRoute = pathname.startsWith('/onboarding') || pathname.startsWith('/invite');

  // If verified authenticated, team exists, and onboarding is complete, render page content
  if ((isAuthenticated && user && user.teamId && user.onboardingCompleted) || isSessionExpired) {
    return (
      <>
        {children}
        <SessionExpiredModal />
      </>
    );
  }
  
  // If verified authenticated but onboarding NOT complete, only render if on an exempt route
  if (isAuthenticated && user && !user.onboardingCompleted && isOnboardingRoute) {
    return <>{children}</>;
  }

  // Render nothing while redirecting
  return null;
}
