import {
  MasonryAdjustHeightFn,
  MasonryImageDimensionsFn,
} from '~/components/MasonryColumns/masonry.types';
import { useMemo } from 'react';
import { AdFeedItem, createAdFeed } from '~/components/Ads/ads.utils';
import { useAdsContext } from '~/components/Ads/AdsProvider';
import { useBrowsingLevelDebounced } from '~/components/BrowsingLevel/BrowsingLevelProvider';
import { getIsSafeBrowsingLevel } from '~/shared/constants/browsingLevel.constants';

// don't know if I need memoized
export const useColumnCount = (width = 0, columnWidth = 0, gutter = 8, maxColumnCount?: number) =>
  useMemo(
    () => getColumnCount(width, columnWidth, gutter, maxColumnCount),
    [width, columnWidth, gutter, maxColumnCount]
  );

export const getColumnCount = (
  width = 0,
  columnWidth = 0,
  gutter = 8,
  maxColumnCount?: number
): [columnCount: number, combinedWidth: number] => {
  if (width === 0) return [0, 0];
  const count =
    Math.min(Math.floor((width + gutter) / (columnWidth + gutter)), maxColumnCount || Infinity) ||
    1;
  const combinedWidth = count * columnWidth + (count - 1) * gutter;
  return [count, combinedWidth];
};

export function useMasonryColumns<TData>(
  data: TData[],
  columnWidth: number,
  columnCount: number,
  imageDimensions: MasonryImageDimensionsFn<TData>,
  adjustDimensions?: MasonryAdjustHeightFn<TData>,
  maxItemHeight?: number,
  withAds?: boolean
) {
  const { adsEnabled } = useAdsContext();
  const browsingLevel = useBrowsingLevelDebounced();
  const adsReallyAreEnabled = adsEnabled && getIsSafeBrowsingLevel(browsingLevel) && withAds;

  return useMemo(
    () =>
      getMasonryColumns(
        data,
        columnWidth,
        columnCount,
        imageDimensions,
        adjustDimensions,
        maxItemHeight,
        adsReallyAreEnabled
      ),
    [data, columnWidth, columnCount, maxItemHeight, adsReallyAreEnabled] // eslint-disable-line
  );
}

type ColumnItem<TData> = {
  height: number;
  data: TData;
};

const getMasonryColumns = <TData>(
  data: TData[],
  columnWidth: number,
  columnCount: number,
  imageDimensions: MasonryImageDimensionsFn<TData>,
  adjustHeight?: MasonryAdjustHeightFn<TData>,
  maxItemHeight?: number,
  showAds?: boolean
): ColumnItem<AdFeedItem<TData>>[][] => {
  // Track the height of each column.
  // Layout algorithm below always inserts into the shortest column.
  if (columnCount === 0) return [];

  const feed = createAdFeed({
    data,
    columnCount,
    keys: showAds ? ['300x250:Dynamic_Feeds', '300x600:Dynamic_Feeds'] : undefined,
  });

  const columnHeights: number[] = Array(columnCount).fill(0);
  const columnItems: ColumnItem<AdFeedItem<TData>>[][] = Array(columnCount).fill([]);

  for (const item of feed) {
    let height = 0;
    if (item.type === 'ad') {
      height = item.data.height + 20;
    } else {
      const { width: originalWidth, height: originalHeight } = imageDimensions(item.data);

      const ratioHeight = (originalHeight / originalWidth) * columnWidth;
      const adjustedHeight =
        adjustHeight?.(
          {
            imageRatio: columnWidth / ratioHeight,
            width: columnWidth,
            height: ratioHeight,
          },
          item.data
        ) ?? ratioHeight;
      height = maxItemHeight ? Math.min(adjustedHeight, maxItemHeight) : adjustedHeight;
    }

    // look for the shortest column on each iteration
    let shortest = 0;
    for (let j = 1; j < columnCount; ++j) {
      if (columnHeights[j] < columnHeights[shortest]) {
        shortest = j;
      }
    }
    columnHeights[shortest] += height;
    columnItems[shortest] = [...columnItems[shortest], { height, data: item }];
  }

  return columnItems;
};
