import { Text } from '@mantine/core';
import { NextLink } from '@mantine/next';
import { Currency, ModelType } from '@prisma/client';
import { IconAlertCircle } from '@tabler/icons-react';
import React from 'react';

import { AlertWithIcon } from '~/components/AlertWithIcon/AlertWithIcon';
import { Countdown } from '~/components/Countdown/Countdown';
import { CurrencyIcon } from '~/components/Currency/CurrencyIcon';
import { LoginRedirect } from '~/components/LoginRedirect/LoginRedirect';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useFeatureFlags } from '~/providers/FeatureFlagsProvider';
import { isFutureDate } from '~/utils/date-helpers';
import { showSuccessNotification, showErrorNotification } from '~/utils/notifications';
import { getDisplayName } from '~/utils/string-helpers';
import { trpc } from '~/utils/trpc';
import { useQueryModelVersionDonationGoals } from '../ModelVersions/model-version.utils';

export function EarlyAccessAlert({ modelId, versionId, modelType, deadline }: Props) {
  const features = useFeatureFlags();
  const currentUser = useCurrentUser();
  const queryUtils = trpc.useUtils();
  const { donationGoals } = useQueryModelVersionDonationGoals({
    modelVersionId: versionId,
  });

  const inEarlyAccess = features.earlyAccessModel && !!deadline && isFutureDate(deadline);

  const { data: { Notify: notifying = [] } = { Notify: [] } } =
    trpc.user.getEngagedModelVersions.useQuery(
      { id: modelId },
      {
        enabled: !!currentUser && inEarlyAccess,
        cacheTime: Infinity,
        staleTime: Infinity,
      }
    );
  const alreadyNotifying = notifying.includes(versionId);

  const toggleNotifyMutation = trpc.modelVersion.toggleNotifyEarlyAccess.useMutation({
    async onMutate() {
      await queryUtils.user.getEngagedModels.cancel();

      const prevEngaged = queryUtils.user.getEngagedModelVersions.getData();

      // Toggle the model in the Notify list
      queryUtils.user.getEngagedModelVersions.setData(
        { id: modelId },
        ({ Notify = [], ...old } = { Notify: [], Downloaded: [] }) => {
          if (alreadyNotifying) return { Notify: Notify.filter((id) => id !== versionId), ...old };
          return { Notify: [...Notify, versionId], ...old };
        }
      );

      return { prevEngaged };
    },
    onSuccess() {
      showSuccessNotification({
        message: !alreadyNotifying
          ? 'You have been removed from the notification list'
          : 'You will be notified when this is available for download',
      });
    },
    onError(error, _variables, context) {
      showErrorNotification({ error: new Error(error.message) });
      queryUtils.user.getEngagedModelVersions.setData({ id: modelId }, context?.prevEngaged);
    },
  });
  const handleNotifyMeClick = () => {
    toggleNotifyMutation.mutate({ id: versionId });
  };

  if (!inEarlyAccess) return null;

  const earlyAccessDonationGoal = (donationGoals ?? []).find((dg) => dg.isEarlyAccess);

  return (
    <AlertWithIcon
      color="yellow"
      iconColor="yellow.1"
      icon={<CurrencyIcon currency={Currency.BUZZ} />}
    >
      The creator of this {getDisplayName(modelType).toLowerCase()} has set this version to{' '}
      <Text weight="bold" component="span">
        Early Access
      </Text>{' '}
      and as such it is only availble for people who purchase it. it will be available for free in{' '}
      <Countdown endTime={deadline} />
      {earlyAccessDonationGoal ? ' or once the donation goal is met' : ''}.
    </AlertWithIcon>
  );
}

type Props = { modelId: number; versionId: number; modelType: ModelType; deadline?: Date };
