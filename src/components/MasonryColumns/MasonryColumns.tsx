import OneKeyMap from '@essentials/one-key-map';
import trieMemoize from 'trie-memoize';
import { createStyles } from '@mantine/core';
import React from 'react';
import { useMasonryColumns } from '~/components/MasonryColumns/masonry.utils';
import { useMasonryContext } from '~/components/MasonryColumns/MasonryProvider';
import {
  MasonryRenderItemProps,
  MasonryAdjustHeightFn,
  MasonryImageDimensionsFn,
} from '~/components/MasonryColumns/masonry.types';
import { AdUnit } from '~/components/Ads/AdUnit';
import { TwCard } from '~/components/TwCard/TwCard';

type Props<TData> = {
  data: TData[];
  render: React.ComponentType<MasonryRenderItemProps<TData>>;
  imageDimensions: MasonryImageDimensionsFn<TData>;
  adjustHeight?: MasonryAdjustHeightFn<TData>;
  maxItemHeight?: number;
  itemId?: (data: TData) => string | number;
  staticItem?: (props: { columnWidth: number; height: number }) => React.ReactNode;
  /** [lowerInterval, upperInterval] */
  withAds?: boolean;
};

export function MasonryColumns<TData>({
  data,
  render: RenderComponent,
  imageDimensions,
  adjustHeight,
  maxItemHeight,
  itemId,
  staticItem,
  withAds,
}: Props<TData>) {
  const { columnCount, columnWidth, columnGap, rowGap, maxSingleColumnWidth } = useMasonryContext();

  const { classes } = useStyles({
    columnCount,
    columnWidth,
    columnGap,
    rowGap,
    maxSingleColumnWidth,
  });

  const columns = useMasonryColumns(
    data,
    columnWidth,
    columnCount,
    imageDimensions,
    adjustHeight,
    maxItemHeight,
    withAds
  );

  return (
    <div className={classes.columns}>
      {columns.map((items, colIndex) => (
        <div key={colIndex} className={classes.column}>
          {items.map(({ height, data }, index) => {
            const key = data.type === 'data' ? itemId?.(data.data) ?? index : `ad_${index}`;
            const showStaticItem = colIndex === 0 && index === 0 && staticItem;

            return (
              <React.Fragment key={key}>
                {showStaticItem && staticItem({ columnWidth, height: 450 })}
                {data.type === 'data' &&
                  createRenderElement(RenderComponent, index, data.data, columnWidth, height)}
                {data.type === 'ad' && (
                  <AdUnit className="justify-center" keys={[data.data.key]} withFeedback>
                    <TwCard className="border p-2 shadow">
                      <AdUnit.Content />
                    </TwCard>
                  </AdUnit>
                )}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const useStyles = createStyles(
  (
    theme,
    {
      columnCount,
      columnWidth,
      columnGap,
      rowGap,
      maxSingleColumnWidth,
    }: {
      columnCount: number;
      columnWidth: number;
      columnGap: number;
      rowGap: number;
      maxSingleColumnWidth?: number;
    }
  ) => {
    return {
      columns: {
        display: 'flex',
        columnGap,
        justifyContent: 'center',
        margin: '0 auto',
      },
      column: {
        display: 'flex',
        flexDirection: 'column',
        width: columnCount === 1 ? '100%' : columnWidth,
        maxWidth: maxSingleColumnWidth,
        rowGap,
      },
    };
  }
);

// supposedly ~5.5x faster than createElement without the memo
const createRenderElement = trieMemoize(
  [OneKeyMap, {}, WeakMap, OneKeyMap, OneKeyMap],
  (RenderComponent, index, data, columnWidth, columnHeight) => (
    <RenderComponent index={index} data={data} width={columnWidth} height={columnHeight} />
  )
);
