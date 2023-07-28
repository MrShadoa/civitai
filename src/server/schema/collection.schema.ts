import { z } from 'zod';
import { isDefined } from '~/utils/type-guards';
import {
  CollectionContributorPermission,
  CollectionItemStatus,
  CollectionReadConfiguration,
  CollectionType,
  CollectionWriteConfiguration,
} from '@prisma/client';
import { imageSchema } from '~/server/schema/image.schema';
import { infiniteQuerySchema, userPreferencesSchema } from '~/server/schema/base.schema';
import { BrowsingMode, CollectionSort } from '~/server/common/enums';
import { constants } from '~/server/common/constants';
import { commaDelimitedNumberArray } from '~/utils/zod-helpers';

const collectionItemSchema = z.object({
  type: z.nativeEnum(CollectionType).optional(),
  articleId: z.number().optional(),
  postId: z.number().optional(),
  modelId: z.number().optional(),
  imageId: z.number().optional(),
  note: z.string().optional(),
});

export type AddCollectionItemInput = z.infer<typeof saveCollectionItemInputSchema>;
export const saveCollectionItemInputSchema = collectionItemSchema
  .extend({
    collectionIds: z.coerce.number().array(),
  })
  .refine(
    ({ articleId, imageId, postId, modelId }) =>
      [articleId, imageId, postId, modelId].filter(isDefined).length === 1,
    { message: 'Only one item can be added at a time.' }
  )
  .refine(
    ({ type, articleId, imageId, postId, modelId }) => {
      if (!type) {
        // Allows any type to be passed if type is not defined
        return true;
      }

      if (type === CollectionType.Article) {
        return articleId !== undefined;
      }
      if (type === CollectionType.Post) {
        return postId !== undefined;
      }
      if (type === CollectionType.Model) {
        return modelId !== undefined;
      }
      if (type === CollectionType.Image) {
        return imageId !== undefined;
      }
      return false;
    },
    { message: 'Please pass a valid item type.' }
  );

export type BulkSaveCollectionItemsInput = z.infer<typeof bulkSaveCollectionItemsInput>;
export const bulkSaveCollectionItemsInput = z
  .object({
    collectionId: z.coerce.number(),
    imageIds: z.coerce.number().array().optional(),
    articleIds: z.coerce.number().array().optional(),
    postIds: z.coerce.number().array().optional(),
    modelIds: z.coerce.number().array().optional(),
  })
  .refine(
    ({ articleIds, imageIds, postIds, modelIds }) =>
      [articleIds, imageIds, postIds, modelIds].filter(isDefined).length === 1,
    { message: 'Only one item can be added at a time.' }
  );

export type GetAllUserCollectionsInputSchema = z.infer<typeof getAllUserCollectionsInputSchema>;
export const getAllUserCollectionsInputSchema = z
  .object({
    contributingOnly: z.boolean().default(true),
    permission: z.nativeEnum(CollectionContributorPermission),
    permissions: z.array(z.nativeEnum(CollectionContributorPermission)),
    type: z.nativeEnum(CollectionType).optional(),
  })
  .partial();

export type UpsertCollectionInput = z.infer<typeof upsertCollectionInput>;
export const upsertCollectionInput = z
  .object({
    id: z.number().optional(),
    name: z.string().max(30).nonempty(),
    description: z.string().max(300).nullish(),
    image: imageSchema.nullish(),
    read: z.nativeEnum(CollectionReadConfiguration).optional(),
    write: z.nativeEnum(CollectionWriteConfiguration).optional(),
    type: z.nativeEnum(CollectionType).default(CollectionType.Model),
  })
  .merge(collectionItemSchema);

export type GetUserCollectionItemsByItemSchema = z.infer<typeof getUserCollectionItemsByItemSchema>;
export const getUserCollectionItemsByItemSchema = collectionItemSchema
  .extend({ note: z.never().optional() })
  .merge(getAllUserCollectionsInputSchema)
  .refine(
    ({ articleId, imageId, postId, modelId }) =>
      [articleId, imageId, postId, modelId].filter(isDefined).length === 1,
    { message: 'Please pass a single resource to match collections to.' }
  );

export type FollowCollectionInputSchema = z.infer<typeof followCollectionInputSchema>;

export const followCollectionInputSchema = z.object({
  collectionId: z.number(),
  userId: z.number().optional(),
});

export type GetAllCollectionItemsSchema = z.infer<typeof getAllCollectionItemsSchema>;
export const getAllCollectionItemsSchema = z
  .object({
    limit: z.number().min(0).max(100),
    page: z.number(),
    cursor: z.number(),
    collectionId: z.number(),
    statuses: z.array(z.nativeEnum(CollectionItemStatus)),
    forReview: z.boolean().optional(),
  })
  .partial()
  .required({ collectionId: true });

export type UpdateCollectionItemsStatusInput = z.infer<typeof updateCollectionItemsStatusInput>;
export const updateCollectionItemsStatusInput = z.object({
  collectionId: z.number(),
  collectionItemIds: z.array(z.number()),
  status: z.nativeEnum(CollectionItemStatus),
});

export type AddSimpleImagePostInput = z.infer<typeof addSimpleImagePostInput>;
export const addSimpleImagePostInput = z.object({
  collectionId: z.number(),
  images: z.array(imageSchema).min(1, 'At least one image must be uploaded'),
});

export type GetAllCollectionsInfiniteSchema = z.infer<typeof getAllCollectionsInfiniteSchema>;
export const getAllCollectionsInfiniteSchema = infiniteQuerySchema
  .extend({
    browsingMode: z
      .nativeEnum(BrowsingMode)
      .default(constants.collectionFilterDefaults.browsingMode),
    userId: z.number(),
    types: z.array(z.nativeEnum(CollectionType)),
    privacy: z.array(z.nativeEnum(CollectionReadConfiguration)),
    sort: z.nativeEnum(CollectionSort).default(constants.collectionFilterDefaults.sort),
    ids: commaDelimitedNumberArray({ message: 'ids should be a number array' }),
    withItems: z.boolean(),
  })
  .merge(userPreferencesSchema)
  .partial();
