import {
  ActionIcon,
  ContainerProps,
  Group,
  Stack,
  Title,
  Text,
  ThemeIcon,
  Menu,
} from '@mantine/core';
import { IconCloudOff, IconDotsVertical, IconPencil } from '@tabler/icons-react';
import { IsClient } from '~/components/IsClient/IsClient';
import { MasonryContainer } from '~/components/MasonryColumns/MasonryContainer';
import { MasonryProvider } from '~/components/MasonryColumns/MasonryProvider';
import { ModelsInfinite } from '~/components/Model/Infinite/ModelsInfinite';
import { constants } from '~/server/common/constants';
import { trpc } from '~/utils/trpc';
import { CollectionFollowAction } from '~/components/Collections/components/CollectionFollow';
import { NextLink } from '@mantine/next';

export function Collection({
  collectionId,
  ...containerProps
}: { collectionId: number } & Omit<ContainerProps, 'children'>) {
  const { data: { collection, permissions } = {}, isLoading } = trpc.collection.getById.useQuery({
    id: collectionId,
  });

  if (!isLoading && !collection) {
    return (
      <Stack w="100%" align="center">
        <Stack spacing="md" align="center" maw={800}>
          <Title order={1} lh={1}>
            Whoops!
          </Title>
          <Text align="center">
            It looks like you landed on the wrong place.The collection you are trying to access does
            not exist or you do not have the sufficient permissions to see it.
          </Text>
          <ThemeIcon size={128} radius={100} sx={{ opacity: 0.5 }}>
            <IconCloudOff size={80} />
          </ThemeIcon>
        </Stack>
      </Stack>
    );
  }

  return (
    <MasonryProvider
      columnWidth={constants.cardSizes.model}
      maxColumnCount={7}
      maxSingleColumnWidth={450}
    >
      <MasonryContainer {...containerProps}>
        <Stack spacing="xs" w="100%">
          <Group align="center" spacing="xs" noWrap style={{ alignItems: 'flex-start' }}>
            <Stack spacing={0}>
              <Title order={1} lh={1}>
                {collection?.name ?? 'Loading...'}
              </Title>
              {collection?.description && (
                <Text size="xs" color="dimmed">
                  {collection.description}
                </Text>
              )}
            </Stack>
            {collection && permissions && (
              <Group ml="auto">
                <CollectionFollowAction collection={collection} permissions={permissions} />
                {permissions.manage && (
                  <Menu>
                    <Menu.Target>
                      <ActionIcon variant="outline">
                        <IconDotsVertical size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        component={NextLink}
                        icon={<IconPencil size={14} stroke={1.5} />}
                        href={`/collections/${collection.id}/review`}
                      >
                        Review Items
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Group>
            )}
          </Group>

          <IsClient>
            <ModelsInfinite filters={{ collectionId, period: 'AllTime' }} />
          </IsClient>
        </Stack>
      </MasonryContainer>
    </MasonryProvider>
  );
}
