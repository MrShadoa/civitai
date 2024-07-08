import {
  Stack,
  Paper,
  createStyles,
  Button,
  Center,
  Loader,
  Alert,
  Group,
  Text,
  Badge,
  Tooltip,
} from '@mantine/core';
import { EdgeMedia } from '~/components/EdgeMedia/EdgeMedia';
import { Reactions } from '~/components/Reaction/Reactions';
import { useState, Fragment } from 'react';
import { ImagesInfiniteModel } from '~/server/services/image.service';
import { MediaHash } from '~/components/ImageHash/ImageHash';
import { RoutedDialogLink } from '~/components/Dialog/RoutedDialogProvider';
import { truncate } from 'lodash-es';
import { constants } from '~/server/common/constants';
import { ImageGuard2 } from '~/components/ImageGuard/ImageGuard2';
import { ImageContextMenu } from '~/components/Image/ContextMenu/ImageContextMenu';
import { PostContestCollectionInfoAlert } from '~/components/Post/Detail/PostContestCollectionInfoAlert';
import { PostContestCollectionItem } from '~/types/router';
import { shouldDisplayHtmlControls } from '~/components/EdgeMedia/EdgeMedia.util';
import { CollectionItemStatus } from '@prisma/client';

const maxWidth = 700;
const maxInitialImages = 20;
export function PostImages({
  postId,
  images,
  isLoading,
  collectionItems,
  isOwner,
  isModerator,
}: {
  postId: number;
  images: ImagesInfiniteModel[];
  isLoading?: boolean;
  collectionItems?: PostContestCollectionItem[];
  isOwner?: boolean;
  isModerator?: boolean;
}) {
  const { classes, cx } = useStyles();
  const [showMore, setShowMore] = useState(false);

  if (isLoading)
    return (
      <Paper component={Center} p="xl" mih={300} withBorder>
        <Group>
          <Loader />
          Loading Images
        </Group>
      </Paper>
    );

  const remainingImages = images.length - maxInitialImages;
  const _images = showMore ? images : images.slice(0, maxInitialImages);

  return (
    <Stack>
      {_images.map((image) => {
        const width = image.width ?? maxWidth;
        const imageCollectionItem = collectionItems?.find((item) => item.imageId === image.id);
        const showImageCollectionBadge =
          imageCollectionItem?.tag &&
          (isOwner || isModerator || imageCollectionItem.status === CollectionItemStatus.ACCEPTED);

        return (
          <Fragment key={image.id}>
            <PostContestCollectionInfoAlert
              isOwner={isOwner}
              collectionItem={imageCollectionItem}
              itemLabel="image"
              isModerator={isModerator}
            />
            <Paper
              key={image.id}
              radius="md"
              className="relative overflow-hidden"
              shadow="md"
              mx="auto"
              style={{
                maxWidth: '100%',
                width: width < maxWidth ? width : maxWidth,
                aspectRatio:
                  image.width && image.height ? `${image.width}/${image.height}` : undefined,
              }}
            >
              <ImageGuard2 image={image} connectType="post" connectId={postId}>
                {(safe) => (
                  <>
                    <Group spacing={4} className="absolute left-2 top-2 z-10">
                      <ImageGuard2.BlurToggle />
                      {showImageCollectionBadge && (
                        <Badge variant="filled" color="gray">
                          {imageCollectionItem?.tag?.name}
                        </Badge>
                      )}
                    </Group>
                    <ImageContextMenu image={image} className="absolute right-2 top-2 z-10" />
                    <RoutedDialogLink name="imageDetail" state={{ imageId: image.id, images }}>
                      {!safe ? (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            aspectRatio: (image.width ?? 1) / (image.height ?? 1),
                          }}
                        >
                          <MediaHash {...image} />
                        </div>
                      ) : (
                        <EdgeMedia
                          src={image.url}
                          name={image.name}
                          alt={
                            image.meta
                              ? truncate(image.meta.prompt, { length: constants.altTruncateLength })
                              : image.name ?? undefined
                          }
                          type={image.type}
                          width={width < maxWidth ? width : maxWidth}
                          // original={image.type === 'video'} -- Removed to fix site performance.
                          anim={safe}
                          html5Controls={shouldDisplayHtmlControls(image)}
                        />
                      )}
                    </RoutedDialogLink>
                    <Reactions
                      p={4}
                      className={cx(classes.reactions, {
                        [classes.reactionsWithControls]: shouldDisplayHtmlControls(image),
                      })}
                      entityId={image.id}
                      entityType="image"
                      reactions={image.reactions}
                      metrics={{
                        likeCount: image.stats?.likeCountAllTime,
                        dislikeCount: image.stats?.dislikeCountAllTime,
                        heartCount: image.stats?.heartCountAllTime,
                        laughCount: image.stats?.laughCountAllTime,
                        cryCount: image.stats?.cryCountAllTime,
                      }}
                      targetUserId={image.user.id}
                      readonly={!safe}
                    />
                  </>
                )}
              </ImageGuard2>
            </Paper>
          </Fragment>
        );
      })}
      {remainingImages > 0 && (
        <Button onClick={() => setShowMore(true)}>Load {remainingImages} more images</Button>
      )}
    </Stack>
  );
}

const useStyles = createStyles((theme) => ({
  reactions: {
    position: 'absolute',
    bottom: theme.spacing.sm,
    left: theme.spacing.sm,
    borderRadius: theme.radius.md,
    background:
      theme.colorScheme === 'dark'
        ? theme.fn.rgba(theme.colors.dark[6], 0.6)
        : theme.colors.gray[0],
    // backdropFilter: 'blur(13px) saturate(160%)',
    boxShadow: '0 -2px 6px 1px rgba(0,0,0,0.16)',
  },
  reactionsWithControls: {
    bottom: 'initial',
    top: '32px',
    left: '8px',
  },
}));
