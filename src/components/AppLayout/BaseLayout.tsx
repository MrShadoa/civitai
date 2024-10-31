import { useMantineTheme } from '@mantine/core';
import dynamic from 'next/dynamic';
import React from 'react';
import { ContainerProvider } from '~/components/ContainerProvider/ContainerProvider';
import { GenerationSidebar } from '~/components/ImageGeneration/GenerationSidebar';
import { MetaPWA } from '~/components/Meta/MetaPWA';
import { onboardingSteps } from '~/components/Onboarding/onboarding.utils';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { Flags } from '~/shared/utils';

const UserBanned = dynamic(() => import('~/components/User/UserBanned'));
const OnboardingWizard = dynamic(() => import('~/components/Onboarding/OnboardingWizard'));

export function BaseLayout({ children }: { children: React.ReactNode }) {
  const theme = useMantineTheme();
  const currentUser = useCurrentUser();
  const isBanned = currentUser?.bannedAt ?? false;
  const shouldOnboard =
    !!currentUser && !onboardingSteps.every((step) => Flags.hasFlag(currentUser.onboarding, step));

  return (
    <>
      <MetaPWA />
      <div className={`flex size-full ${theme.colorScheme}`}>
        {!isBanned && !shouldOnboard && <GenerationSidebar />}
        <ContainerProvider id="main" containerName="main" className="flex-1">
          {isBanned ? (
            <UserBanned />
          ) : shouldOnboard ? (
            <OnboardingWizard
              onComplete={() => {
                return;
              }}
            />
          ) : (
            children
          )}
        </ContainerProvider>
      </div>
    </>
  );
}
