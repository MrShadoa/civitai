import { NotificationCategory, Prisma } from '@prisma/client';

import { dbWrite, dbRead } from '~/server/db/client';
import { populateNotificationDetails } from '~/server/notifications/detail-fetchers';
import {
  NotificationAddedRow,
  notificationCache,
  NotificationCategoryArray,
} from '~/server/notifications/notification-cache';
import {
  GetUserNotificationsSchema,
  MarkReadNotificationInput,
  ToggleNotificationSettingInput,
} from '~/server/schema/notification.schema';
import { DEFAULT_PAGE_SIZE } from '~/server/utils/pagination-helpers';
import { v4 as uuid } from 'uuid';
import { redis, REDIS_KEYS } from '~/server/redis/client';
import { BlockedByUsers, BlockedUsers } from '~/server/services/user-preferences.service';

type NotificationsRaw = {
  id: string;
  type: string;
  details: MixedObject;
  createdAt: Date;
  read: boolean;
  category: NotificationCategory;
};
export async function getUserNotifications({
  limit = DEFAULT_PAGE_SIZE,
  cursor,
  userId,
  category,
  count = false,
  unread = false,
}: Partial<GetUserNotificationsSchema> & {
  userId: number;
  count?: boolean;
}) {
  const AND = [Prisma.sql`n."userId" = ${userId}`];
  if (unread) AND.push(Prisma.sql`nv.id IS NULL`);
  if (cursor) AND.push(Prisma.sql`n."createdAt" < ${cursor}`);
  else AND.push(Prisma.sql`n."createdAt" > NOW() - interval '1 month'`);

  if (category) AND.push(Prisma.sql`n.category = ${category}::"NotificationCategory"`);

  const items = await dbRead.$queryRaw<NotificationsRaw[]>`
    SELECT n."id", "type", "category", "details", "createdAt", nv."id" IS NOT NULL as read
    FROM "Notification" n
    LEFT JOIN "NotificationViewed" nv ON n."id" = nv."id" AND nv."userId" = ${userId}
    WHERE ${Prisma.join(AND, ' AND ')}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;

  await populateNotificationDetails(items);

  if (count) return { items, count: await getUserNotificationCount({ userId, unread }) };

  return { items };
}

export async function getUserNotificationCount({
  userId,
  unread,
  category,
}: {
  userId: number;
  unread: boolean;
  category?: NotificationCategory;
}) {
  const cachedCount = await notificationCache.getUser(userId);
  if (cachedCount) return cachedCount;

  const AND = [Prisma.sql`"userId" = ${userId}`];
  if (unread)
    AND.push(
      Prisma.sql`"id" NOT IN (SELECT id FROM "NotificationViewed" WHERE "userId" = ${userId})`
    );
  else AND.push(Prisma.sql`"createdAt" > NOW() - interval '1 month'`);

  if (category) AND.push(Prisma.sql`category = ${category}::"NotificationCategory"`);

  const result = await dbRead.$queryRaw<NotificationCategoryArray>`
    SELECT
      category,
      COUNT(*) as count
    FROM "Notification"
    WHERE ${Prisma.join(AND, ' AND ')}
    GROUP BY category
  `;
  await notificationCache.setUser(userId, result);
  return result;
}

export const createUserNotificationSetting = async ({
  type,
  userId,
}: ToggleNotificationSettingInput & { userId: number }) => {
  const values = type.map((t) => Prisma.sql`(${t}, ${userId})`);
  return dbWrite.$executeRaw`
    INSERT INTO "UserNotificationSettings" ("type", "userId") VALUES
    ${Prisma.join(values)}
    ON CONFLICT DO NOTHING
  `;
};

export const markNotificationsRead = async ({
  id,
  userId,
  all = false,
  category,
}: MarkReadNotificationInput & { userId: number }) => {
  if (all) {
    const AND = [
      Prisma.sql`"userId" = ${userId}`,
      Prisma.sql`"id" NOT IN (SELECT "id" FROM "NotificationViewed" WHERE "userId" = ${userId})`,
    ];
    if (category) AND.push(Prisma.sql`"category" = ${category}::"NotificationCategory"`);
    await dbWrite.$executeRaw`
      INSERT INTO "NotificationViewed" ("id", "userId")
      SELECT "id", ${userId}
      FROM "Notification"
      WHERE ${Prisma.join(AND, ' AND ')}
      ON CONFLICT ("id") DO NOTHING
    `;

    // Update cache
    if (category) await notificationCache.clearCategory(userId, category);
    else await notificationCache.bustUser(userId);
  } else {
    const [change] = await dbWrite.$queryRaw<{ id: string }[]>`
      INSERT INTO "NotificationViewed" ("id", "userId")
      VALUES (${id}, ${userId})
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id"
    `;

    // Update cache if the notification was marked read
    if (change) {
      const notification = await dbRead.notification.findFirst({
        where: { id },
        select: { category: true },
      });
      if (notification?.category)
        await notificationCache.decrementUser(userId, notification.category);
    }
  }
};

export const deleteUserNotificationSetting = async ({
  type,
  userId,
}: ToggleNotificationSettingInput & { userId: number }) => {
  return dbWrite.userNotificationSettings.deleteMany({ where: { type: { in: type }, userId } });
};

export const createNotification = async (
  data: Omit<Prisma.NotificationCreateArgs['data'], 'userId'> & {
    userId?: number;
    userIds?: number[];
  }
) => {
  if (!data.userIds) data.userIds = [];
  if (data.userId) data.userIds.push(data.userId);
  if (data.userIds.length === 0) return;

  const userNotificationSettings = await dbWrite.userNotificationSettings.findMany({
    where: { userId: { in: data.userIds }, type: data.type },
  });
  const blockedUsers = await Promise.all([
    BlockedUsers.getCached({ userId: data.userId }),
    BlockedByUsers.getCached({ userId: data.userId }),
  ]);
  const blocked = [...new Set([...blockedUsers].flatMap((x) => x.map((u) => u.id)))];
  const targets = data.userIds.filter(
    (x) => !userNotificationSettings.some((y) => y.userId === x) && !blocked.includes(x)
  );
  // If the user has this notification type disabled, don't create a notification.
  if (targets.length === 0) return;

  const notificationTable =
    (await redis.hGet(REDIS_KEYS.SYSTEM.FEATURES, 'notificationTable')) ?? 'Notification';

  if (!data.id) data.id = uuid();
  const [change] = await dbWrite.$queryRaw<NotificationAddedRow[]>`
    INSERT INTO ${Prisma.raw(
      `"${notificationTable}"`
    )} ("id", "userId", "type", "details", "category")
    SELECT
      CONCAT(u.id, ':', ${data.id}),
      u.id,
      ${data.type},
      ${JSON.stringify(data.details)}::jsonb,
      ${data.category}::"NotificationCategory"
    FROM "User" u
    WHERE u.id IN (${Prisma.join(targets)})
    AND NOT EXISTS (
      SELECT 1 FROM "UserNotificationSettings" uns
      WHERE uns."userId" = u.id AND uns."type" = ${data.type}
    )
    ON CONFLICT ("id") DO NOTHING
    RETURNING "userId", category
  `;

  if (change) await notificationCache.incrementUser(change.userId, change.category);
};
