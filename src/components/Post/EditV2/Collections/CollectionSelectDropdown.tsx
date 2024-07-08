import { Divider, Group, Select, Stack, Text, Alert, Anchor } from '@mantine/core';
import { CollectionMode } from '@prisma/client';
import { useEffect, useMemo, useState } from 'react';
import { useCollectionsForPostCreation } from '~/components/Collections/collection.utils';
import { usePostEditParams, usePostEditStore } from '~/components/Post/EditV2/PostEditProvider';
import { getDisplayName, toPascalCase } from '~/utils/string-helpers';
import { isDefined } from '~/utils/type-guards';

export const useCollectionsForPostEditor = () => {
  const { collections: queryCollectionIds, collectionId: queryCollectionId } = usePostEditParams();
  const { post, updateCollection, collectionId, collectionTagId } = usePostEditStore((state) => ({
    post: state.post,
    updateCollection: state.updateCollection,
    collectionId: state.collectionId,
    collectionTagId: state.collectionTagId,
  }));

  const collectionIds = useMemo(() => {
    return [
      ...((queryCollectionIds as number[]) ?? []),
      queryCollectionId,
      collectionId,
      post?.collectionId,
    ].filter(isDefined);
  }, [queryCollectionIds, collectionId, post]);

  useEffect(() => {
    if (queryCollectionId && !collectionId) {
      updateCollection(queryCollectionId);
    }
  }, [queryCollectionId]);

  useEffect(() => {
    if (!collectionId && post?.collectionId) {
      updateCollection(post.collectionId);
    }
  }, [post?.collectionId, collectionId]);

  const { collections = [] } = useCollectionsForPostCreation({ collectionIds });

  return {
    post,
    collections,
    updateCollection,
    collectionId,
    collectionTagId,
    collectionIds,
    activeCollection: collections.find((c) => c.id === collectionId),
  };
};

export const CollectionSelectDropdown = () => {
  const { post, collections, updateCollection, collectionId, collectionTagId, collectionIds } =
    useCollectionsForPostEditor();
  const writeableCollections = useMemo(() => {
    return collections.filter(
      (collection) => collection.permissions?.write || collection.permissions?.writeReview
    );
  }, [collections]);

  const isContestCollectionsOnly = writeableCollections.every(
    (collection) => collection.mode === CollectionMode.Contest
  );

  const selectedCollection = collectionId
    ? writeableCollections.find((c) => c.id === collectionId)
    : null;

  const selectOpts = writeableCollections.map((collection) => ({
    value: collection.id.toString(),
    label: getDisplayName(collection.name),
  }));

  if (!writeableCollections.length || !collectionIds.length) {
    return null;
  }

  return (
    <Stack spacing="xs">
      <Divider label="Collection details for this post" />
      {!post?.publishedAt ? (
        <Group>
          <Select
            label={isContestCollectionsOnly ? 'Contest Selection' : 'Select collection'}
            data={selectOpts}
            value={collectionId ? collectionId.toString() : null}
            onChange={(value: string) =>
              value ? updateCollection(parseInt(value, 10), null) : updateCollection(null, null)
            }
            disabled={!!post?.publishedAt}
            placeholder={`Add to ${isContestCollectionsOnly ? 'contest' : 'collection'}`}
            radius="xl"
            clearable
            size="xs"
            styles={{
              input: {
                height: 32,
              },
            }}
            tt="capitalize"
          />
          {selectedCollection && selectedCollection.tags.length > 0 && !post?.publishedAt && (
            <Select
              label="Select Entry Category"
              data={selectedCollection.tags.map((tag) => ({
                value: tag.id.toString(),
                label: toPascalCase(tag.name),
              }))}
              value={collectionTagId ? collectionTagId.toString() : null}
              onChange={(value: string) =>
                value
                  ? updateCollection(collectionId as number, parseInt(value, 10))
                  : updateCollection(collectionId as number, null)
              }
              placeholder="Select category"
              radius="xl"
              clearable
              size="xs"
              styles={{
                input: {
                  height: 32,
                },
              }}
            />
          )}
        </Group>
      ) : selectedCollection ? (
        <Alert color="gray">
          <Stack spacing={0}>
            <Text size="sm">
              This post has been created for the{' '}
              <Text component="span" weight="bold">
                {selectedCollection.name}
              </Text>{' '}
              collection.
            </Text>
            <Anchor
              href={`/collections/${selectedCollection.id}`}
              target="_blank"
              rel="noopener noreferrer"
              size="xs"
            >
              View collection
            </Anchor>
          </Stack>
        </Alert>
      ) : null}

      <Divider />
    </Stack>
  );
};
