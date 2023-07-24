import { dbWrite, dbRead } from '~/server/db/client';
import {
  BulkSaveCollectionItemsInput,
  AddCollectionItemInput,
  GetAllCollectionItemsSchema,
  GetAllUserCollectionsInputSchema,
  GetUserCollectionItemsByItemSchema,
  UpdateCollectionItemsStatusInput,
  UpsertCollectionInput,
} from '~/server/schema/collection.schema';
import { SessionUser } from 'next-auth';
import {
  CollectionContributorPermission,
  CollectionItemStatus,
  CollectionReadConfiguration,
  CollectionType,
  CollectionWriteConfiguration,
  MetricTimeframe,
  Prisma,
} from '@prisma/client';
import {
  throwAuthorizationError,
  throwBadRequestError,
  throwNotFoundError,
} from '~/server/utils/errorHandling';
import { isDefined } from '~/utils/type-guards';
import { UserPreferencesInput, userPreferencesSchema } from '~/server/middleware.trpc';
import { ArticleGetAll } from '~/types/router';
import { getArticles } from '~/server/services/article.service';
import {
  getModelsWithImagesAndModelVersions,
  GetModelsWithImagesAndModelVersions,
} from '~/server/services/model.service';
import { Context } from '~/server/createContext';
import { ArticleSort, BrowsingMode, ImageSort, ModelSort, PostSort } from '~/server/common/enums';
import { getAllImages, ImagesInfiniteModel } from '~/server/services/image.service';
import { getPostsInfinite, PostsInfiniteModel } from '~/server/services/post.service';
import { GetByIdInput } from '~/server/schema/base.schema';

export type CollectionContributorPermissionFlags = {
  read: boolean;
  write: boolean;
  writeReview: boolean;
  manage: boolean;
  follow: boolean;
  isContributor: boolean;
  isOwner: boolean;
  followPermissions: CollectionContributorPermission[];
};

export const getUserCollectionPermissionsById = async ({
  user,
  id,
}: GetByIdInput & {
  user?: SessionUser;
}) => {
  const permissions: CollectionContributorPermissionFlags = {
    read: false,
    write: false,
    writeReview: false,
    manage: false,
    follow: false,
    isContributor: false,
    isOwner: false,
    followPermissions: [],
  };

  const collection = await dbRead.collection.findFirst({
    select: {
      id: true,
      read: true,
      write: true,
      userId: true,
      contributors: user
        ? {
            select: {
              permissions: true,
            },
            where: {
              user: {
                id: user.id,
              },
            },
          }
        : false,
    },
    where: {
      id,
    },
  });

  if (!collection) {
    return permissions;
  }

  if (
    collection.read === CollectionReadConfiguration.Public ||
    collection.read === CollectionReadConfiguration.Unlisted
  ) {
    permissions.read = true;
    permissions.follow = true;
    permissions.followPermissions.push(CollectionContributorPermission.VIEW);
  }

  if (collection.write === CollectionWriteConfiguration.Public) {
    // Follow will grant write permissions
    permissions.follow = true;
    permissions.followPermissions.push(CollectionContributorPermission.ADD);
  }
  if (collection.write === CollectionWriteConfiguration.Review) {
    // Follow will grant write permissions
    permissions.follow = true;
    permissions.followPermissions.push(CollectionContributorPermission.ADD_REVIEW);
  }

  if (!user) {
    return permissions;
  }

  if (user.id === collection.userId) {
    permissions.isOwner = user.id === collection.userId;
    permissions.manage = true;
    permissions.read = true;
    permissions.write = true;
  }

  const [contributorItem] = collection.contributors;

  if (!contributorItem) {
    return permissions;
  }

  permissions.isContributor = true;

  if (contributorItem.permissions.includes(CollectionContributorPermission.VIEW)) {
    permissions.read = true;
  }

  if (contributorItem.permissions.includes(CollectionContributorPermission.ADD)) {
    permissions.write = true;
  }

  if (contributorItem.permissions.includes(CollectionContributorPermission.ADD_REVIEW)) {
    permissions.writeReview = true;
  }

  if (contributorItem.permissions.includes(CollectionContributorPermission.MANAGE)) {
    permissions.manage = true;
  }

  return permissions;
};

export const getUserCollectionsWithPermissions = async <
  TSelect extends Prisma.CollectionSelect = Prisma.CollectionSelect
>({
  user,
  input,
  select,
}: {
  user: SessionUser;
  input: GetAllUserCollectionsInputSchema;
  select: TSelect;
}) => {
  const { permissions, permission, contributingOnly } = input;
  // By default, owned collections will be always returned
  const OR: Prisma.Enumerable<Prisma.CollectionWhereInput> = [{ userId: user.id }];

  if (
    permissions &&
    permissions.includes(CollectionContributorPermission.ADD) &&
    !contributingOnly
  ) {
    OR.push({
      write: CollectionWriteConfiguration.Public,
    });
  }

  if (
    permissions &&
    permissions.includes(CollectionContributorPermission.VIEW) &&
    !contributingOnly
  ) {
    // Even with view permission we don't really
    // want to return unlisted unless the user is a contributor
    // with that permission
    OR.push({
      read: CollectionWriteConfiguration.Public,
    });
  }

  if (permissions || permission) {
    OR.push({
      contributors: {
        some: {
          userId: user.id,
          permissions: {
            hasSome: permission ? [permission] : permissions,
          },
        },
      },
    });
  }

  const AND: Prisma.Enumerable<Prisma.CollectionWhereInput> = [{ OR }];

  if (input.type) {
    // TODO.collections: Support exclusive type
    AND.push({
      OR: [
        {
          type: input.type,
        },
        {
          type: null,
        },
      ],
    });
  }

  const collections = await dbRead.collection.findMany({
    where: {
      AND,
    },
    select,
  });

  // Return user collections first && add isOwner  property
  return collections
    .map((collection) => ({
      ...collection,
      isOwner: collection.userId === user?.id,
    }))
    .sort(({ userId }) => (userId === user.id ? -1 : 1));
};

export const getCollectionById = ({ input }: { input: GetByIdInput }) => {
  const { id } = input;
  return dbRead.collection.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      coverImage: true,
      read: true,
      write: true,
      type: true,
      userId: true,
    },
  });
};

const inputToCollectionType = {
  modelId: CollectionType.Model,
  articleId: CollectionType.Article,
  imageId: CollectionType.Image,
  postId: CollectionType.Post,
} as const;

export const saveItemInCollections = async ({
  user,
  input: { collectionIds, type, ...input },
}: {
  user: SessionUser;
  input: AddCollectionItemInput;
}) => {
  const itemKey = Object.keys(inputToCollectionType).find((key) => input.hasOwnProperty(key));

  if (itemKey && inputToCollectionType.hasOwnProperty(itemKey)) {
    const type = inputToCollectionType[itemKey as keyof typeof inputToCollectionType];
    // check if all collections match the Model type
    const collections = await dbRead.collection.findMany({
      where: {
        id: { in: collectionIds },
        OR: [
          {
            type: null,
          },
          {
            type,
          },
        ],
      },
    });

    if (collections.length !== collectionIds.length) {
      throw throwBadRequestError('Collection type mismatch');
    }
  }

  const data: Prisma.CollectionItemCreateManyInput[] = (
    await Promise.all(
      collectionIds.map(async (collectionId) => {
        const permission = await getUserCollectionPermissionsById({ user, id: collectionId });
        if (!permission.isContributor && !permission.isOwner) {
          // Person adding content to stuff they don't follow.
          return null;
        }

        if (!permission.writeReview && !permission.write) {
          return null;
        }

        return {
          ...input,
          addedById: user.id,
          collectionId,
          status: permission.writeReview
            ? CollectionItemStatus.REVIEW
            : CollectionItemStatus.ACCEPTED,
        };
      })
    )
  ).filter(isDefined);

  const transactions = [dbWrite.collectionItem.createMany({ data })];

  // Determine which items need to be removed
  const itemsToRemove = await dbRead.collectionItem.findMany({
    where: {
      ...input,
      addedById: user.id,
      collectionId: { notIn: collectionIds },
    },
    select: { id: true },
  });
  // if we have items to remove, add a deleteMany mutation to the transaction
  if (itemsToRemove.length)
    transactions.push(
      dbWrite.collectionItem.deleteMany({
        where: { id: { in: itemsToRemove.map((i) => i.id) } },
      })
    );

  return dbWrite.$transaction(transactions);
};

export const upsertCollection = async ({
  input,
  user,
}: {
  input: UpsertCollectionInput;
  user: SessionUser;
}) => {
  const { id, name, description, coverImage, read, write, type, ...collectionItem } = input;

  if (id) {
    const updated = await dbWrite.collection.update({
      where: { id },
      data: {
        name,
        description,
        coverImage,
        read,
        write,
      },
    });
    if (!updated) throw throwNotFoundError(`No collection with id ${id}`);

    if (input.read === CollectionReadConfiguration.Public) {
      // Set publishedAt for all post belonging to this collection if changing privacy to public
      await dbWrite.post.updateMany({
        where: { collectionId: updated.id },
        data: { publishedAt: new Date() },
      });
    } else {
      // otherwise set publishedAt to null
      await dbWrite.post.updateMany({
        where: { collectionId: updated.id },
        data: { publishedAt: null },
      });
    }

    return updated;
  }

  return dbWrite.collection.create({
    data: {
      name,
      description,
      coverImage,
      read,
      write,
      userId: user.id,
      type,
      contributors: {
        create: {
          userId: user.id,
          permissions: [
            CollectionContributorPermission.MANAGE,
            CollectionContributorPermission.ADD,
            CollectionContributorPermission.VIEW,
          ],
        },
      },
      items: { create: { ...collectionItem, addedById: user.id } },
    },
  });
};

interface ModelCollectionItem {
  type: 'model';
  data: GetModelsWithImagesAndModelVersions;
}

interface PostCollectionItem {
  type: 'post';
  data: PostsInfiniteModel;
}

interface ImageCollectionItem {
  type: 'image';
  data: ImagesInfiniteModel;
}

interface ArticleCollectionItem {
  type: 'article';
  data: ArticleGetAll['items'][0];
}

export type CollectionItemExpanded = { id: number; status?: CollectionItemStatus } & (
  | ModelCollectionItem
  | PostCollectionItem
  | ImageCollectionItem
  | ArticleCollectionItem
);

export const getCollectionItemsByCollectionId = async ({
  ctx,
  input,
}: {
  ctx: Context;
  input: UserPreferencesInput & GetAllCollectionItemsSchema;
}) => {
  const { statuses = [CollectionItemStatus.ACCEPTED], limit, collectionId, page, cursor } = input;

  const skip = page && limit ? (page - 1) * limit : undefined;

  const userPreferencesInput = userPreferencesSchema.parse(input);

  const permission = await getUserCollectionPermissionsById({
    id: input.collectionId,
    user: ctx.user,
  });

  if (
    (statuses.includes(CollectionItemStatus.REVIEW) ||
      statuses.includes(CollectionItemStatus.REJECTED)) &&
    !permission.isOwner &&
    !permission.manage
  ) {
    throw throwAuthorizationError('You do not have permission to view review items');
  }

  const where: Prisma.CollectionItemWhereInput = {
    collectionId,
    status: { in: statuses },
  };

  const collectionItems = await dbRead.collectionItem.findMany({
    take: limit,
    skip,
    cursor: cursor ? { id: cursor } : undefined,
    select: {
      id: true,
      modelId: true,
      postId: true,
      imageId: true,
      articleId: true,
      status: input.forReview,
    },
    where,
  });

  if (collectionItems.length === 0) {
    return [];
  }

  const modelIds = collectionItems.map((item) => item.modelId).filter(isDefined);

  const models =
    modelIds.length > 0
      ? await getModelsWithImagesAndModelVersions({
          input: {
            limit: modelIds.length,
            sort: ModelSort.Newest,
            period: MetricTimeframe.AllTime,
            periodMode: 'stats',
            hidden: false,
            favorites: false,
            ...userPreferencesInput,
            ids: modelIds,
          },
          ctx,
        })
      : { items: [] };

  const articleIds = collectionItems.map((item) => item.articleId).filter(isDefined);

  const articles =
    articleIds.length > 0
      ? await getArticles({
          limit: articleIds.length,
          period: MetricTimeframe.AllTime,
          periodMode: 'stats',
          sort: ArticleSort.Newest,
          ...userPreferencesInput,
          browsingMode: userPreferencesInput.browsingMode || BrowsingMode.SFW,
          sessionUser: ctx.user,
          ids: articleIds,
        })
      : { items: [] };

  const imageIds = collectionItems.map((item) => item.imageId).filter(isDefined);

  const images =
    imageIds.length > 0
      ? await getAllImages({
          include: [],
          limit: imageIds.length,
          period: MetricTimeframe.AllTime,
          periodMode: 'stats',
          sort: ImageSort.Newest,
          ...userPreferencesInput,
          userId: ctx.user?.id,
          isModerator: ctx.user?.isModerator,
          ids: imageIds,
        })
      : { items: [] };

  const postIds = collectionItems.map((item) => item.postId).filter(isDefined);

  const posts =
    postIds.length > 0
      ? await getPostsInfinite({
          limit: postIds.length,
          period: MetricTimeframe.AllTime,
          periodMode: 'published',
          sort: PostSort.Newest,
          ...userPreferencesInput,
          user: ctx.user,
          browsingMode: userPreferencesInput.browsingMode || BrowsingMode.SFW,
          ids: postIds,
        })
      : { items: [] };

  const collectionItemsExpanded: CollectionItemExpanded[] = collectionItems
    .map(({ imageId, postId, articleId, modelId, ...collectionItemRemainder }) => {
      if (modelId) {
        // Get all model info:
        const model = models.items.find((m) => m.id === modelId);
        if (!model) {
          return null;
        }

        return {
          ...collectionItemRemainder,
          type: 'model' as const,
          data: model,
        };
      }

      if (postId) {
        const post = posts.items.find((p) => p.id === postId);

        if (!post) {
          return null;
        }

        return {
          ...collectionItemRemainder,
          type: 'post' as const,
          data: post,
        };
      }

      if (imageId) {
        const image = images.items.find((i) => i.id === imageId);

        if (!image) {
          return null;
        }

        return {
          ...collectionItemRemainder,
          type: 'image' as const,
          data: image,
        };
      }

      if (articleId) {
        const article = articles.items.find((a) => a.id === articleId);

        if (!article) {
          return null;
        }

        return {
          ...collectionItemRemainder,
          type: 'article' as const,
          data: article,
        };
      }

      return null;
    })
    .filter(isDefined)
    .filter((collectionItem) => !!collectionItem.data);

  return collectionItemsExpanded;
};

export const getUserCollectionItemsByItem = async ({
  input,
  user,
}: {
  input: GetUserCollectionItemsByItemSchema;
  user: SessionUser;
}) => {
  const { modelId, imageId, articleId, postId } = input;

  const userCollections = await getUserCollectionsWithPermissions({
    user,
    input: {
      permissions: [
        CollectionContributorPermission.ADD,
        CollectionContributorPermission.ADD_REVIEW,
        CollectionContributorPermission.MANAGE,
      ],
    },
    select: { id: true },
  });

  if (userCollections.length === 0) return [];

  const collectionItems = await dbRead.collectionItem.findMany({
    select: {
      collectionId: true,
      addedById: true,
      collection: {
        select: {
          userId: true,
        },
      },
    },
    where: {
      collectionId: {
        in: userCollections.map((c) => c.id),
      },
      OR: [{ modelId }, { imageId }, { postId }, { articleId }],
    },
  });

  return Promise.all(
    collectionItems.map(async (collectionItem) => {
      const permission = await getUserCollectionPermissionsById({
        user,
        id: collectionItem.collectionId,
      });
      return {
        ...collectionItem,
        canRemoveItem: collectionItem.addedById === user.id || permission.manage,
      };
    })
  );
};

export const deleteCollectionById = async ({ id, user }: GetByIdInput & { user: SessionUser }) => {
  try {
    const collection = await dbRead.collection.findFirst({
      // Confirm the collection belongs to the user:
      where: { id, userId: user.id },
      select: { id: true },
    });

    if (!collection) {
      return null;
    }

    return await dbWrite.collection.delete({ where: { id } });
  } catch {
    // Ignore errors
  }
};

export const addContributorToCollection = async ({
  collectionId,
  userId,
  user,
  permissions,
}: {
  user: SessionUser;
  userId: number;
  collectionId: number;
  permissions?: CollectionContributorPermission[];
}) => {
  // check if user can add contributors:
  const { followPermissions, manage, follow } = await getUserCollectionPermissionsById({
    id: collectionId,
    user,
  });

  if (!manage && !follow) {
    throw throwAuthorizationError(
      'You do not have permission to add contributors to this collection.'
    );
  }

  const contributorPermissions =
    permissions && permissions.length > 0 ? permissions : followPermissions;

  if (!contributorPermissions.length) {
    return; // Can't add this user as contributor due to lacking permissions.
  }

  return dbWrite.collectionContributor.upsert({
    where: { userId_collectionId: { userId, collectionId } },
    create: { userId, collectionId, permissions: contributorPermissions },
    update: { permissions: contributorPermissions },
  });
};

export const removeContributorFromCollection = async ({
  user,
  userId,
  collectionId,
}: {
  user: SessionUser;
  userId: number;
  collectionId: number;
}) => {
  const { manage } = await getUserCollectionPermissionsById({
    id: collectionId,
    user,
  });

  if (!manage && user.id !== userId) {
    throw throwAuthorizationError(
      'You do not have permission to remove contributors from this collection.'
    );
  }
  try {
    return await dbWrite.collectionContributor.delete({
      where: {
        userId_collectionId: {
          userId,
          collectionId,
        },
      },
    });
  } catch {
    // Ignore errors
  }
};

export const getAvailableCollectionItemsFilterForUser = ({
  statuses,
  permissions,
  user,
}: {
  statuses?: CollectionItemStatus[];
  permissions: CollectionContributorPermissionFlags;
  user?: SessionUser;
}) => {
  // A user with relevant permissions can filter & manage these permissions
  if ((permissions.manage || permissions.isOwner) && statuses) {
    return [{ status: { in: statuses } }];
  }

  const AND: Prisma.Enumerable<Prisma.CollectionItemWhereInput> = user
    ? [
        {
          OR: [
            { status: CollectionItemStatus.ACCEPTED },
            { AND: [{ status: CollectionItemStatus.REVIEW }, { addedById: user.id }] },
          ],
        },
      ]
    : [{ status: CollectionItemStatus.ACCEPTED }];

  return AND;
};

export const updateCollectionItemsStatus = async ({
  user,
  input,
}: {
  user: SessionUser;
  input: UpdateCollectionItemsStatusInput;
}) => {
  const { collectionId, collectionItemIds, status } = input;
  const { manage, isOwner } = await getUserCollectionPermissionsById({
    id: collectionId,
    user,
  });

  if (!manage && !isOwner) {
    throw throwAuthorizationError('You do not have permission manage contributor item status.');
  }
  try {
    return await dbWrite.collectionItem.updateMany({
      where: {
        id: { in: collectionItemIds },
      },
      data: { status },
    });
  } catch {
    // Ignore errors
  }
};

export const bulkSaveItems = async ({
  input: { collectionId, articleIds = [], modelIds = [], imageIds = [], postIds = [] },
  user,
  permissions,
}: {
  input: BulkSaveCollectionItemsInput;
  user: SessionUser;
  permissions: CollectionContributorPermissionFlags;
}) => {
  const collection = await dbRead.collection.findUnique({
    where: { id: collectionId },
    select: { type: true },
  });
  if (!collection) throw throwNotFoundError('No collection with id ' + collectionId);

  let data: Prisma.CollectionItemCreateManyInput[] = [];
  if (
    articleIds.length > 0 &&
    (collection.type === CollectionType.Article || collection.type === null)
  ) {
    data = articleIds.map((articleId) => ({
      articleId,
      collectionId,
      addedById: user.id,
      status: permissions.writeReview ? CollectionItemStatus.REVIEW : CollectionItemStatus.ACCEPTED,
    }));
  }
  if (
    modelIds.length > 0 &&
    (collection.type === CollectionType.Model || collection.type === null)
  ) {
    data = modelIds.map((modelId) => ({
      modelId,
      collectionId,
      addedById: user.id,
      status: permissions.writeReview ? CollectionItemStatus.REVIEW : CollectionItemStatus.ACCEPTED,
    }));
  }
  if (
    imageIds.length > 0 &&
    (collection.type === CollectionType.Image || collection.type === null)
  ) {
    data = imageIds.map((imageId) => ({
      imageId,
      collectionId,
      addedById: user.id,
      status: permissions.writeReview ? CollectionItemStatus.REVIEW : CollectionItemStatus.ACCEPTED,
    }));
  }
  if (postIds.length > 0 && (collection.type === CollectionType.Post || collection.type === null)) {
    data = postIds.map((postId) => ({
      postId,
      collectionId,
      addedById: user.id,
      status: permissions.writeReview ? CollectionItemStatus.REVIEW : CollectionItemStatus.ACCEPTED,
    }));
  }

  return dbWrite.collectionItem.createMany({ data });
};
