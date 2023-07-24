import dayjs from 'dayjs';
import { createMetricProcessor, MetricProcessorRunContext } from '~/server/metrics/base.metrics';
import { modelsSearchIndex } from '~/server/search-index';
import { Prisma, PrismaClient, SearchIndexUpdateQueueAction } from '@prisma/client';
import { chunk } from 'lodash-es';

export const modelMetrics = createMetricProcessor({
  name: 'Model',
  async update(ctx) {
    // If this is the first metric update of the day, recompute all recently affected metrics
    // -------------------------------------------------------------------
    const shouldFullRefresh = ctx.lastUpdate.getDate() !== new Date().getDate();
    if (shouldFullRefresh) ctx.lastUpdate = dayjs(ctx.lastUpdate).subtract(1.5, 'day').toDate();

    const updatedModelIds = new Set<number>();

    for (const processor of modelMetricProcessors) {
      const processorUpdatedModelIds = await processor(ctx);
      processorUpdatedModelIds.forEach((id) => updatedModelIds.add(id));
    }

    if (updatedModelIds.size > 0) {
      await modelsSearchIndex.queueUpdate(
        [...updatedModelIds].map((id) => ({ id, action: SearchIndexUpdateQueueAction.Update }))
      );
    }
  },
  rank: {
    async refresh(ctx) {
      await refreshModelVersionRank(ctx);
      await refreshModelRank(ctx);
    },
    refreshInterval: 60 * 1000,
  },
});

// #region [metrics]
const modelMetricProcessors = [
  updateVersionDownloadMetrics,
  updateVersionRatingMetrics,
  updateVersionFavoriteMetrics,
  updateVersionCommentMetrics,
  updateModelMetrics,
];

async function getAffectedModelIdsFromModelVersionIds({
  affectedModelVersionIds,
  db,
}: {
  affectedModelVersionIds: Array<number>;
  db: PrismaClient;
}) {
  const affectedModelIds: Set<number> = new Set();
  const batches = chunk(affectedModelVersionIds, 500);
  for (const batch of batches) {
    const batchAffectedModels: Array<{ modelId: number }> =
      await db.$queryRaw`SELECT "modelId" FROM "ModelVersion" WHERE "id" IN (${Prisma.join(
        batch
      )});`;

    for (const { modelId } of batchAffectedModels) affectedModelIds.add(modelId);
  }

  return [...affectedModelIds];
}

async function updateVersionDownloadMetrics({ ch, db, lastUpdate }: MetricProcessorRunContext) {
  const clickhouseSince = dayjs(lastUpdate).toISOString();
  const affectedModelVersionsResponse = await ch.query({
    query: `
      WITH CTE_AffectedModelVersions AS
      (
          SELECT DISTINCT modelVersionId
          FROM modelVersionEvents
          WHERE type = 'Download'
          AND time >= parseDateTimeBestEffortOrNull('${clickhouseSince}')
      )
      SELECT
          mve.modelVersionId AS modelVersionId,
          SUM(if(mve.time >= subtractDays(now(), 1), 1, null)) AS downloads24Hours,
          SUM(if(mve.time >= subtractDays(now(), 7), 1, null)) AS downloads1Week,
          SUM(if(mve.time >= subtractMonths(now(), 1), 1, null)) AS downloads1Month,
          SUM(if(mve.time >= subtractYears(now(), 1), 1, null)) AS downloads1Year,
          COUNT() AS downloadsAll
      FROM CTE_AffectedModelVersions mv
      JOIN modelVersionUniqueDownloads mve
          ON mv.modelVersionId = mve.modelVersionId
      GROUP BY mve.modelVersionId
    `,
    format: 'JSONEachRow',
  });

  const affectedModelVersions = (await affectedModelVersionsResponse?.json()) as [
    {
      modelVersionId: number;
      downloads24Hours: string;
      downloads1Week: string;
      downloads1Month: string;
      downloads1Year: string;
      downloadsAll: string;
    }
  ];

  // We batch the affected model versions up when sending it to the db
  const batches = chunk(affectedModelVersions, 500);
  for (const batch of batches) {
    const batchJson = JSON.stringify(batch);

    await db.$executeRaw`
      INSERT INTO "ModelVersionMetric" ("modelVersionId", timeframe, "downloadCount")
      SELECT
          mvm.modelVersionId, mvm.timeframe, mvm.downloads
      FROM
      (
          SELECT
              CAST(mvs::json->>'modelVersionId' AS INT) AS modelVersionId,
              tf.timeframe,
              CAST(
                CASE
                  WHEN tf.timeframe = 'Day' THEN mvs::json->>'downloads24Hours'
                  WHEN tf.timeframe = 'Week' THEN mvs::json->>'downloads1Week'
                  WHEN tf.timeframe = 'Month' THEN mvs::json->>'downloads1Month'
                  WHEN tf.timeframe = 'Year' THEN mvs::json->>'downloads1Year'
                  WHEN tf.timeframe = 'AllTime' THEN mvs::json->>'downloadsAll'
                END
              AS int) as downloads
          FROM json_array_elements(${batchJson}::json) mvs
          CROSS JOIN (
              SELECT unnest(enum_range(NULL::"MetricTimeframe")) AS timeframe
          ) tf
      ) mvm
      WHERE mvm.downloads IS NOT NULL
      AND mvm.modelVersionId IN (SELECT id FROM "ModelVersion")
      ON CONFLICT ("modelVersionId", timeframe) DO UPDATE
        SET "downloadCount" = EXCLUDED."downloadCount";
    `;
  }

  if (affectedModelVersions.length > 0) {
    // Get affected models from version IDs:
    const affectedModelVersionIds = affectedModelVersions.map(
      ({ modelVersionId }) => modelVersionId
    );
    return getAffectedModelIdsFromModelVersionIds({ affectedModelVersionIds, db });
  }

  return [];
}

async function updateVersionRatingMetrics({ ch, db, lastUpdate }: MetricProcessorRunContext) {
  const clickhouseSince = dayjs(lastUpdate).toISOString();
  const affectedModelVersionsResponse = await ch.query({
    query: `
      SELECT DISTINCT modelVersionId
      FROM resourceReviews
      WHERE time >= parseDateTimeBestEffortOrNull('${clickhouseSince}')
    `,
    format: 'JSONEachRow',
  });

  const affectedModelVersions = (await affectedModelVersionsResponse?.json()) as [
    {
      modelVersionId: number;
    }
  ];

  const modelVersionIds = affectedModelVersions.map((x) => x.modelVersionId);
  const batches = chunk(modelVersionIds, 500);
  for (const batch of batches) {
    const batchJson = JSON.stringify(batch);
    await db.$executeRaw`
      INSERT INTO "ModelVersionMetric" ("modelVersionId", timeframe, "ratingCount", rating)
      SELECT
          rr."modelVersionId",
          tf.timeframe,
          COALESCE(SUM(
              CASE
                  WHEN tf.timeframe = 'AllTime' THEN 1
                  WHEN tf.timeframe = 'Year' THEN IIF(rr.created_at >= NOW() - interval '1 year', 1, 0)
                  WHEN tf.timeframe = 'Month' THEN IIF(rr.created_at >= NOW() - interval '1 month', 1, 0)
                  WHEN tf.timeframe = 'Week' THEN IIF(rr.created_at >= NOW() - interval '1 week', 1, 0)
                  WHEN tf.timeframe = 'Day' THEN IIF(rr.created_at >= NOW() - interval '1 day', 1, 0)
              END
          ), 0),
          COALESCE(AVG(
              CASE
                  WHEN tf.timeframe = 'AllTime' THEN rating
                  WHEN tf.timeframe = 'Year' THEN IIF(rr.created_at >= NOW() - interval '1 year', rating, NULL)
                  WHEN tf.timeframe = 'Month' THEN IIF(rr.created_at >= NOW() - interval '1 month', rating, NULL)
                  WHEN tf.timeframe = 'Week' THEN IIF(rr.created_at >= NOW() - interval '1 week', rating, NULL)
                  WHEN tf.timeframe = 'Day' THEN IIF(rr.created_at >= NOW() - interval '1 day', rating, NULL)
              END
          ), 0)
      FROM (
          SELECT
              r."userId",
              r."modelVersionId",
              MAX(r.rating) rating,
              MAX(r."createdAt") AS created_at
          FROM "ResourceReview" r
          JOIN "Model" m ON m.id = r."modelId" AND m."userId" != r."userId"
          WHERE r.exclude = FALSE
          AND r."tosViolation" = FALSE
          AND r."modelVersionId" = ANY (SELECT json_array_elements(${batchJson}::json)::text::integer)
          GROUP BY r."userId", r."modelVersionId"
      ) rr
      CROSS JOIN (
        SELECT unnest(enum_range(NULL::"MetricTimeframe")) AS timeframe
      ) tf
      GROUP BY rr."modelVersionId", tf.timeframe
      ON CONFLICT ("modelVersionId", timeframe) DO UPDATE SET "ratingCount" = EXCLUDED."ratingCount", rating = EXCLUDED.rating;
    `;
  }

  if (affectedModelVersions.length > 0) {
    // Get affected models from version IDs:
    const affectedModelVersionIds = affectedModelVersions.map(
      ({ modelVersionId }) => modelVersionId
    );
    return getAffectedModelIdsFromModelVersionIds({ affectedModelVersionIds, db });
  }

  return [];
}

async function updateVersionFavoriteMetrics({ ch, db, lastUpdate }: MetricProcessorRunContext) {
  const clickhouseSince = dayjs(lastUpdate).toISOString();
  const affectedModelsResponse = await ch.query({
    query: `
      SELECT DISTINCT modelId
      FROM modelEngagements
      WHERE time >= parseDateTimeBestEffortOrNull('${clickhouseSince}')
      AND type = 'Favorite' OR type = 'Delete'
    `,
    format: 'JSONEachRow',
  });

  const affectedModels = (await affectedModelsResponse?.json()) as [
    {
      modelId: number;
    }
  ];

  const affectedModelsJson = JSON.stringify(affectedModels.map((x) => x.modelId));

  const sqlAnd = [Prisma.sql`f.type = 'Favorite'`];
  // Conditionally pass the affected models to the query if there are less than 1000 of them
  if (affectedModels.length < 1000)
    sqlAnd.push(
      Prisma.sql`f."modelId" = ANY (SELECT json_array_elements(${affectedModelsJson}::json)::text::integer)`
    );

  await db.$executeRaw`
    INSERT INTO "ModelVersionMetric" ("modelVersionId", timeframe, "favoriteCount")
    SELECT
        mv."id",
        tf.timeframe,
        COALESCE(SUM(
            CASE
                WHEN tf.timeframe = 'AllTime' THEN 1
                WHEN tf.timeframe = 'Year' THEN IIF(f."createdAt" >= NOW() - interval '1 year', 1, 0)
                WHEN tf.timeframe = 'Month' THEN IIF(f."createdAt" >= NOW() - interval '1 month', 1, 0)
                WHEN tf.timeframe = 'Week' THEN IIF(f."createdAt" >= NOW() - interval '1 week', 1, 0)
                WHEN tf.timeframe = 'Day' THEN IIF(f."createdAt" >= NOW() - interval '1 day', 1, 0)
            END
        ), 0)
    FROM (
        SELECT
            f."modelId",
            f."createdAt"
        FROM "ModelEngagement" f
        WHERE ${Prisma.join(sqlAnd, ` AND `)}
    ) f
    JOIN "ModelVersion" mv ON f."modelId" = mv."modelId"
    CROSS JOIN (
      SELECT unnest(enum_range(NULL::"MetricTimeframe")) AS timeframe
    ) tf
    GROUP BY mv.id, tf.timeframe
    ON CONFLICT ("modelVersionId", timeframe) DO UPDATE SET "favoriteCount" = EXCLUDED."favoriteCount";
  `;

  return affectedModels.map(({ modelId }) => modelId);
}

async function updateVersionCommentMetrics({ ch, db, lastUpdate }: MetricProcessorRunContext) {
  const clickhouseSince = dayjs(lastUpdate).toISOString();
  const affectedModelsResponse = await ch.query({
    query: `
      SELECT DISTINCT entityId AS modelId
      FROM comments
      WHERE time >= parseDateTimeBestEffortOrNull('${clickhouseSince}')
      AND type = 'Model'
    `,
    format: 'JSONEachRow',
  });

  const affectedModels = (await affectedModelsResponse?.json()) as [
    {
      modelId: number;
    }
  ];

  const modelIds = affectedModels.map((x) => x.modelId);
  const batches = chunk(modelIds, 500);
  for (const batch of batches) {
    const batchJson = JSON.stringify(batch);

    await db.$executeRaw`
      INSERT INTO "ModelVersionMetric" ("modelVersionId", timeframe, "commentCount")
      SELECT
          mv."id",
          tf.timeframe,
          COALESCE(SUM(
              CASE
                  WHEN tf.timeframe = 'AllTime' THEN 1
                  WHEN tf.timeframe = 'Year' THEN IIF(c."createdAt" >= NOW() - interval '1 year', 1, 0)
                  WHEN tf.timeframe = 'Month' THEN IIF(c."createdAt" >= NOW() - interval '1 month', 1, 0)
                  WHEN tf.timeframe = 'Week' THEN IIF(c."createdAt" >= NOW() - interval '1 week', 1, 0)
                  WHEN tf.timeframe = 'Day' THEN IIF(c."createdAt" >= NOW() - interval '1 day', 1, 0)
              END
          ), 0)
      FROM (
          SELECT
              c."modelId",
              c."createdAt"
          FROM "Comment" c
          WHERE c."tosViolation" = false
          AND c."modelId" = ANY (SELECT json_array_elements(${batchJson}::json)::text::integer)
      ) c
      JOIN "ModelVersion" mv ON c."modelId" = mv."modelId"
      CROSS JOIN (
        SELECT unnest(enum_range(NULL::"MetricTimeframe")) AS timeframe
      ) tf
      GROUP BY mv.id, tf.timeframe
      ON CONFLICT ("modelVersionId", timeframe) DO UPDATE SET "commentCount" = EXCLUDED."commentCount";
    `;
  }

  return modelIds;
}

async function updateModelMetrics({ db }: MetricProcessorRunContext) {
  await db.$executeRaw`
    INSERT INTO "ModelMetric" ("modelId", timeframe, "downloadCount", rating, "ratingCount", "favoriteCount", "commentCount")
    SELECT
      mv."modelId",
      mvm.timeframe,
      SUM(mvm."downloadCount") "downloadCount",
      COALESCE(SUM(mvm.rating * mvm."ratingCount") / NULLIF(SUM(mvm."ratingCount"), 0), 0) "rating",
      SUM(mvm."ratingCount") "ratingCount",
      MAX(mvm."favoriteCount") "favoriteCount",
      MAX(mvm."commentCount") "commentCount"
    FROM "ModelVersionMetric" mvm
    JOIN "ModelVersion" mv ON mvm."modelVersionId" = mv.id
    GROUP BY mv."modelId", mvm.timeframe
    ON CONFLICT ("modelId", timeframe) DO UPDATE
        SET  "downloadCount" = EXCLUDED."downloadCount", rating = EXCLUDED.rating, "ratingCount" = EXCLUDED."ratingCount", "favoriteCount" = EXCLUDED."favoriteCount", "commentCount" = EXCLUDED."commentCount";
  `;

  return [];
}
// #endregion

// #region [ranks]
async function refreshModelRank({ db }: MetricProcessorRunContext) {
  await db.$executeRaw`DROP TABLE IF EXISTS "ModelRank_New"`;
  await db.$executeRaw`CREATE TABLE "ModelRank_New" AS SELECT * FROM "ModelRank_Live"`;
  await db.$executeRaw`ALTER TABLE "ModelRank_New" ADD CONSTRAINT "pk_ModelRank_New" PRIMARY KEY ("modelId")`;

  await db.$transaction([
    db.$executeRaw`TRUNCATE TABLE "ModelRank"`,
    db.$executeRaw`INSERT INTO "ModelRank" SELECT * FROM "ModelRank_New"`,
  ]);
  db.$executeRaw`VACUUM "ModelRank"`;
}

async function refreshModelVersionRank({ db }: MetricProcessorRunContext) {
  await db.$executeRaw`DROP TABLE IF EXISTS "ModelVersionRank_New"`;
  await db.$executeRaw`CREATE TABLE "ModelVersionRank_New" AS SELECT * FROM "ModelVersionRank_Live"`;
  await db.$executeRaw`ALTER TABLE "ModelVersionRank_New" ADD CONSTRAINT "pk_ModelVersionRank_New" PRIMARY KEY ("modelVersionId")`;
  await db.$executeRaw`CREATE INDEX "ModelVersionRank_New_idx" ON "ModelVersionRank_New"("modelVersionId")`;

  await db.$transaction([
    db.$executeRaw`DROP TABLE IF EXISTS "ModelVersionRank"`,
    db.$executeRaw`ALTER TABLE "ModelVersionRank_New" RENAME TO "ModelVersionRank"`,
    db.$executeRaw`ALTER TABLE "ModelVersionRank" RENAME CONSTRAINT "pk_ModelVersionRank_New" TO "pk_ModelVersionRank";`,
    db.$executeRaw`ALTER INDEX "ModelVersionRank_New_idx" RENAME TO "ModelVersionRank_idx"`,
  ]);
}
// #endregion
