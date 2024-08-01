import { chunk, isEmpty } from 'lodash-es';
import { clickhouse } from '~/server/clickhouse/client';
import { dbRead } from '~/server/db/client';
import { createJob, getJobDate } from './job';
import { Prisma } from '@prisma/client';
import { withRetries } from '~/server/utils/errorHandling';
import dayjs from 'dayjs';
import { TransactionType } from '~/server/schema/buzz.schema';
import { formatDate } from '~/utils/date-helpers';
import { createBuzzTransactionMany } from '~/server/services/buzz.service';

const CREATOR_COMP = 0.25;
const BASE_MODEL_COMP = 0.25;
export const updateCreatorResourceCompensation = createJob(
  'update-creator-resource-compensation',
  '0 * * * *',
  async () => {
    if (!clickhouse) return;

    await clickhouse.$query(`
      INSERT INTO buzz_resource_compensation (date, modelVersionId, comp, tip, total)
      SELECT
        toStartOfDay(createdAt) as date,
        modelVersionId,
        FLOOR(SUM(comp)) as comp,
        FLOOR(SUM(tip)) AS tip,
        comp + tip as total
      FROM (
        SELECT
        modelVersionId,
        createdAt,
        max(jobCost) * ${CREATOR_COMP} as creator_comp,
        max(creatorsTip) as full_tip,
        max(resource_count) as resource_count,
        creator_comp * if(max(isBaseModel) = 1, ${BASE_MODEL_COMP}, 0) as base_model_comp,
        creator_comp * ${1 - BASE_MODEL_COMP} / resource_count as resource_comp,
        base_model_comp + resource_comp as comp,
        full_tip / resource_count as tip,
        comp + tip as total
        FROM (
          SELECT
            rj.modelVersionId as modelVersionId,
            rj.resource_count as resource_count,
            rj.createdAt as createdAt,
            rj.jobCost as jobCost,
            rj.jobId as jobId,
            rj.creatorsTip as creatorsTip,
            m.type = 'Checkpoint' as isBaseModel
          FROM (
            SELECT
              arrayJoin(resourcesUsed) AS modelVersionId,
              length(arrayFilter(x -> NOT x IN (250708, 250712, 106916), resourcesUsed)) as resource_count,
              createdAt,
              jobCost,
              jobId,
              creatorsTip
            FROM orchestration.textToImageJobs
            WHERE createdAt BETWEEN toStartOfDay(subtractDays(now(), 1)) AND toStartOfDay(now())
              AND modelVersionId NOT IN (250708, 250712, 106916)
          ) rj
          JOIN civitai_pg.ModelVersion mv ON mv.id = rj.modelVersionId
          JOIN civitai_pg.Model m ON m.id = mv.modelId
        ) resource_job_details
        GROUP BY modelVersionId, jobId, createdAt
      ) resource_job_values
      GROUP BY date, modelVersionId
      HAVING total >= 1
      ORDER BY total DESC;
    `);

    await clickhouse.$query('OPTIMIZE TABLE buzz_resource_compensation;');

    const [lastPayout, setLastPayout] = await getJobDate(
      'run-daily-compensation-payout',
      new Date()
    );
    // If it's a new day, we need to run the compensation payout job
    if (dayjs(lastPayout).isBefore(dayjs().startOf('day'))) {
      await runPayout(lastPayout);
      await setLastPayout();
    }
  }
);

type UserVersions = { userId: number; modelVersionIds: number[] };
type Compensation = { modelVersionId: number; comp: number; tip: number };

const BATCH_SIZE = 1000;
const COMP_START_DATE = new Date('2024-08-01');
async function runPayout(lastUpdate: Date) {
  if (!clickhouse) return;
  if (lastUpdate < COMP_START_DATE) return;

  const date = dayjs(lastUpdate).utc().subtract(1, 'day').startOf('day');
  const compensations = await clickhouse.$query<Compensation>(`
    SELECT
      modelVersionId,
      comp,
      tip
    FROM buzz_resource_compensation
    WHERE date = parseDateTimeBestEffortOrNull('${date.toISOString()}');
  `);

  if (!compensations.length) return;

  const creatorsToPay: Record<number, Compensation[]> = {};
  const batches = chunk(compensations, BATCH_SIZE);
  for (const batch of batches) {
    const versionIds = batch.map((c) => c.modelVersionId);
    if (!versionIds.length) continue;

    const userVersions = await dbRead.$queryRaw<UserVersions[]>`
        SELECT
          m."userId" as "userId",
          array_agg(mv.id::int) as "modelVersionIds"
        FROM "ModelVersion" mv
        JOIN "Model" m ON m.id = mv."modelId"
        WHERE mv.id IN (${Prisma.join(versionIds)})
        GROUP BY m."userId";
      `;

    for (const { userId, modelVersionIds } of userVersions) {
      if (!modelVersionIds.length) continue;

      if (!creatorsToPay[userId]) creatorsToPay[userId] = [];

      creatorsToPay[userId].push(
        ...batch.filter((c) => modelVersionIds.includes(c.modelVersionId))
      );
    }
  }

  if (isEmpty(creatorsToPay)) return;

  const compensationTransactions = Object.entries(creatorsToPay)
    .map(([userId, compensations]) => ({
      fromAccountId: 0,
      toAccountId: Number(userId),
      amount: compensations.reduce((acc, c) => acc + c.comp, 0),
      description: `Generation creator compensation (${formatDate(date)})`,
      type: TransactionType.Compensation,
      externalTransactionId: `creator-comp-${formatDate(date, 'YYYY-MM-DD')}`,
    }))
    .filter((comp) => comp.amount > 0);

  const tipTransactions = Object.entries(creatorsToPay)
    .map(([userId, compensations]) => ({
      fromAccountId: 0,
      toAccountId: Number(userId),
      amount: compensations.reduce((acc, c) => acc + c.tip, 0),
      description: `Generation tips (${formatDate(date)})`,
      type: TransactionType.Tip,
      externalTransactionId: `creator-tip-${formatDate(date, 'YYYY-MM-DD')}`,
    }))
    .filter((tip) => tip.amount > 0);

  const compensationBatches = chunk(compensationTransactions, BATCH_SIZE);
  for (const batch of compensationBatches) {
    await withRetries(() => createBuzzTransactionMany(batch), 1);
  }

  const tipBatches = chunk(tipTransactions, BATCH_SIZE);
  for (const batch of tipBatches) {
    await withRetries(() => createBuzzTransactionMany(batch), 1);
  }
}
