import { useMemo, useRef } from 'react';
import { getRandom } from '~/utils/array-helpers';
import { getRandomInt } from '~/utils/number-helpers';

export type AdFeedItem<T> = { type: 'data'; data: T } | { type: 'ad'; data: AdUnitDetail };
export type AdFeed<T> = AdFeedItem<T>[];

type AdMatrix = {
  indices: Array<{ index: number } & AdUnitDetail>;
  lastIndex: number;
};

const adMatrices: Record<string, AdMatrix> = {};

export function createAdFeed<T>({
  data,
  columnCount,
  keys,
}: {
  data: T[];
  columnCount: number;
  /** pass multiple keys to randomize the adunits */
  keys?: AdUnitKey[];
}): AdFeed<T> {
  const interval =
    adDensity.find(([columns]) => columns === columnCount)?.[1] ??
    adDensity[adDensity.length - 1][1];
  if (!keys || !interval) return data.map((data) => ({ type: 'data', data }));
  const key = interval.join('_');
  adMatrices[key] = adMatrices[key] ?? { indices: [], lastIndex: 0 };
  const adMatrix = adMatrices[key];

  const [lower, upper] = interval;
  while (adMatrix.lastIndex < data.length) {
    const min = adMatrix.lastIndex + lower + 1;
    const max = adMatrix.lastIndex + upper;
    const index = getRandomInt(min, max);
    const key = getRandom(keys);
    const [item] = getAdUnitDetails([key]);
    adMatrix.indices.push({ index, ...item });
    adMatrix.lastIndex = index;
  }
  const indices = adMatrix.indices.map((x) => x.index);

  return data.reduce<AdFeed<T>>((acc, item, i) => {
    const adMatrixIndex = indices.indexOf(i);
    if (adMatrixIndex > -1) {
      acc.push({ type: 'ad', data: adMatrix.indices[adMatrixIndex] });
    }
    acc.push({ type: 'data', data: item });
    return acc;
  }, []);
}

type AdDensity = [columns: number, interval: [min: number, max: number]];
const adDensity: AdDensity[] = [
  [1, [5, 7]],
  [2, [6, 9]],
  [3, [7, 10]],
  [4, [8, 11]],
  [5, [9, 12]],
  [6, [10, 13]],
  [7, [12, 18]],
];

const adDefinitions = {
  '970x250:Leaderboard_A': 'civitaicom47456',
  '320x50:Leaderboard_A': 'civitaicom47760',
  '728x90:Leaderboard_B': 'civitaicom47457',
  '320x50:Leaderboard_B': 'civitaicom47761',
  '728x90:Leaderboard_C': 'civitaicom47458',
  '320x50:Leaderboard_C': 'civitaicom47762',
  '300x250:Dynamic_Feeds': 'civitaicom47455',
  '300x600:Dynamic_Feeds': 'civitaicom47453',
  '300x250:model_image_pages': 'civitaicom47763',
};
const adDefinitionKeys = Object.keys(adDefinitions) as AdDefinitionKey[];

type AdDefinitionKey = keyof typeof adDefinitions;

type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
  ? []
  : S extends `${infer T}${D}${infer U}`
  ? [T, ...Split<U, D>]
  : [S];

export type AdUnitKey = AdDefinitionKey | Split<AdDefinitionKey, ':'>[1];

export type AdUnitDetail = ReturnType<typeof getAdUnitDetails>[number];
export function getAdUnitDetails(args: AdUnitKey[]) {
  const keys = args
    .reduce<AdDefinitionKey[]>((acc, adUnitKey) => {
      if (adUnitKey in adDefinitions) return [...acc, adUnitKey as AdDefinitionKey];
      return [...acc, ...adDefinitionKeys.filter((key) => key.includes(adUnitKey))];
    }, [])
    .sort()
    .reverse();

  return keys.map((key) => {
    const [size, name] = key.split(':');
    const [width, height] = size.split('x').map(Number);
    const type = name === 'Dynamic_Feeds' ? ('dynamic' as const) : ('static' as const);
    return {
      width,
      height,
      key,
      type,
      id: adDefinitions[key],
    };
  });
}
