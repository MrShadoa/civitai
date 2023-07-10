import { client } from '~/server/meilisearch/client';
import {
  getOrCreateIndex,
  onSearchIndexDocumentsCleanup,
  waitForTasksWithRetries,
} from '~/server/meilisearch/util';
import { EnqueuedTask } from 'meilisearch';
import {
  createSearchIndexUpdateProcessor,
  SearchIndexRunContext,
} from '~/server/search-index/base.search-index';
import {
  MetricTimeframe,
  Prisma,
  PrismaClient,
  SearchIndexUpdateQueueAction,
} from '@prisma/client';

const READ_BATCH_SIZE = 1000;
const MEILISEARCH_DOCUMENT_BATCH_SIZE = 100;
const INDEX_ID = 'tags';
const SWAP_INDEX_ID = `${INDEX_ID}_NEW`;

const onIndexSetup = async ({ indexName }: { indexName: string }) => {
  if (!client) {
    return;
  }

  const index = await getOrCreateIndex(indexName, { primaryKey: 'id' });
  console.log('onIndexSetup :: Index has been gotten or created', index);

  if (!index) {
    return;
  }

  const updateSearchableAttributesTask = await index.updateSearchableAttributes(['name']);

  console.log(
    'onIndexSetup :: updateSearchableAttributesTask created',
    updateSearchableAttributesTask
  );

  const sortableFieldsAttributesTask = await index.updateSortableAttributes([
    'metrics.modelCount',
    'metrics.imageCount',
    'createdAt',
    'metrics.postCount',
    'metrics.articleCount',
    'metrics.followerCount',
    'metrics.hiddenCount',
  ]);

  const updateRankingRulesTask = await index.updateRankingRules([
    'attribute',
    'metrics.modelCount:desc',
    'metrics.imageCount:desc',
    'words',
    'typo',
    'proximity',
    'sort',
    'exactness',
  ]);

  console.log('onIndexSetup :: sortableFieldsAttributesTask created', sortableFieldsAttributesTask);
  console.log('onIndexSetup :: updateRankingRulesTask created', updateRankingRulesTask);
  console.log('onIndexSetup :: all tasks completed');
};

const onFetchItemsToIndex = async ({
  db,
  whereOr,
  indexName,
  ...queryProps
}: {
  db: PrismaClient;
  indexName: string;
  whereOr?: Prisma.Enumerable<Prisma.TagWhereInput>;
  skip?: number;
  take?: number;
}) => {
  const offset = queryProps.skip || 0;
  console.log(
    `onFetchItemsToIndex :: fetching starting for ${indexName} range:`,
    offset,
    offset + READ_BATCH_SIZE - 1,
    ' filters:',
    whereOr
  );

  const tags = await db.tag.findMany({
    skip: offset,
    take: READ_BATCH_SIZE,
    select: {
      id: true,
      name: true,
      nsfw: true,
      isCategory: true,
      createdAt: true,
      metrics: {
        select: {
          postCount: true,
          articleCount: true,
          followerCount: true,
          modelCount: true,
          imageCount: true,
          hiddenCount: true,
        },
        where: {
          timeframe: MetricTimeframe.AllTime,
        },
      },
    },
    where: {
      unlisted: false,
      adminOnly: false,
      // if lastUpdatedAt is not provided,
      // this should generate the entirety of the index.
      OR: whereOr,
    },
  });

  console.log(
    `onFetchItemsToIndex :: fetching complete for ${indexName} range:`,
    offset,
    offset + READ_BATCH_SIZE - 1,
    'filters:',
    whereOr
  );

  // Avoids hitting the DB without data.
  if (tags.length === 0) {
    return [];
  }

  const indexReadyRecords = tags.map((tagRecord) => {
    return {
      ...tagRecord,
      metrics: {
        // Flattens metric array
        ...(tagRecord.metrics[0] || {}),
      },
    };
  });

  return indexReadyRecords;
};

const onUpdateQueueProcess = async ({ db, indexName }: { db: PrismaClient; indexName: string }) => {
  const queuedItems = await db.searchIndexUpdateQueue.findMany({
    select: {
      id: true,
    },
    where: { type: INDEX_ID, action: SearchIndexUpdateQueueAction.Update },
  });

  console.log(
    'onUpdateQueueProcess :: A total of ',
    queuedItems.length,
    ' have been updated and will be re-indexed'
  );

  const batchCount = Math.ceil(queuedItems.length / READ_BATCH_SIZE);

  const itemsToIndex: Awaited<ReturnType<typeof onFetchItemsToIndex>> = [];

  for (let batchNumber = 0; batchNumber < batchCount; batchNumber++) {
    const batch = queuedItems.slice(
      batchNumber * READ_BATCH_SIZE,
      batchNumber * READ_BATCH_SIZE + READ_BATCH_SIZE
    );

    const itemIds = batch.map(({ id }) => id);

    const newItems = await onFetchItemsToIndex({
      db,
      indexName,
      whereOr: {
        id: {
          in: itemIds,
        },
      },
    });

    itemsToIndex.push(...newItems);
  }

  return itemsToIndex;
};

const onIndexUpdate = async ({ db, lastUpdatedAt, indexName }: SearchIndexRunContext) => {
  if (!client) return;

  // Confirm index setup & working:
  await onIndexSetup({ indexName });
  // Cleanup documents that require deletion:
  // Always pass INDEX_ID here, not index name, as pending to delete will
  // always use this name.
  await onSearchIndexDocumentsCleanup({ db, indexName: INDEX_ID });

  let offset = 0;
  const tagTasks: EnqueuedTask[] = [];

  if (lastUpdatedAt) {
    // Only if this is an update (NOT a reset or first run) will we care for queued items:

    // Update whatever items we have on the queue.
    // Do it on batches, since it's possible that there are far more items than we expect:
    const updateTasks = await onUpdateQueueProcess({
      db,
      indexName,
    });

    if (updateTasks.length > 0) {
      const updateBaseTasks = await client
        .index(indexName)
        .updateDocumentsInBatches(updateTasks, MEILISEARCH_DOCUMENT_BATCH_SIZE);

      console.log('onIndexUpdate :: base tasks for updated items have been added');
      tagTasks.push(...updateBaseTasks);
    }
  }

  while (true) {
    const indexReadyRecords = await onFetchItemsToIndex({
      db,
      indexName,
      skip: offset,
      whereOr: !lastUpdatedAt
        ? undefined
        : [
            {
              createdAt: {
                gt: lastUpdatedAt,
              },
            },
            {
              updatedAt: {
                gt: lastUpdatedAt,
              },
            },
          ],
    });

    // Avoids hitting the DB without data.
    if (indexReadyRecords.length === 0) break;

    const tasks = await client
      .index(indexName)
      .updateDocumentsInBatches(indexReadyRecords, MEILISEARCH_DOCUMENT_BATCH_SIZE);

    tagTasks.push(...tasks);

    offset += indexReadyRecords.length;
  }

  console.log('onIndexUpdate :: start waitForTasks');
  await waitForTasksWithRetries(tagTasks.map((task) => task.taskUid));
  console.log('onIndexUpdate :: complete waitForTasks');
};

export const tagsSearchIndex = createSearchIndexUpdateProcessor({
  indexName: INDEX_ID,
  swapIndexName: SWAP_INDEX_ID,
  onIndexUpdate,
  onIndexSetup,
});
