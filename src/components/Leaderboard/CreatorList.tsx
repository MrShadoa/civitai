import { useMantineTheme, Stack } from '@mantine/core';
import { List } from 'masonic';
import { useRouter } from 'next/router';
import { z } from 'zod';

import { CreatorCard } from '~/components/Leaderboard/CreatorCard';
import { numericString } from '~/utils/zod-helpers';
import { LeaderboardGetModel } from '~/types/router';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useEffect, useRef } from 'react';

const schema = z.object({
  position: numericString().optional(),
  id: z.string().default('overall'),
});

export function CreatorList({ data }: { data: LeaderboardGetModel[] }) {
  const theme = useMantineTheme();
  const router = useRouter();
  const result = schema.safeParse(router.query);
  let position: number | undefined = undefined;
  let leaderboardId: string | undefined = undefined;
  if (result.success) {
    position = result.data.position;
    leaderboardId = result.data.id;
  }

  // const virtuoso = useRef<VirtuosoHandle>(null);
  // useEffect(() => {
  //   console.log('fire', { virtuoso });
  //   if (!position || !virtuoso.current) return;
  //   virtuoso.current.scrollToIndex({ index: position, align: 'center', behavior: 'auto' });
  // }, [position]);

  // return (
  //   <Virtuoso
  //     // ref={virtuoso}
  //     style={{ height: '100%', flex: 1 }}
  //     data={data}
  //     components={{ List: Stack }}
  //     initialTopMostItemIndex={position}
  //     itemContent={(index, item) => <CreatorCard data={item} index={index} />}
  //   />
  // );

  return (
    <List
      key={leaderboardId}
      items={data}
      render={CreatorCard}
      scrollToIndex={
        position && position <= data.length
          ? { index: data.findIndex((x) => x.position === Number(position)), align: 'center' }
          : undefined
      }
      rowGutter={theme.spacing.md}
      overscanBy={3}
      itemHeightEstimate={98}
    />
  );
}
