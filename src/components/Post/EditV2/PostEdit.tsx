import { PostCollaboratorSelection } from '~/components/Post/EditV2/Collaborators/PostCollaborators';
import { EditPostReviews } from '~/components/Post/EditV2/EditPostReviews';
import { PostEditForm } from '~/components/Post/EditV2/PostEditForm';
import { usePostEditStore, usePostPreviewContext } from '~/components/Post/EditV2/PostEditProvider';
import { PostEditSidebar } from '~/components/Post/EditV2/PostEditSidebar';
import { PostImageCards } from '~/components/Post/EditV2/PostImageCards/PostImageCards';
import { PostImageDropzone } from '~/components/Post/EditV2/PostImageDropzone';
import { PostReorderImages } from '~/components/Post/EditV2/PostReorderImages';

export function PostEdit() {
  const [post, isReordering] = usePostEditStore((state) => [state.post, state.isReordering]);
  const { showPreview } = usePostPreviewContext();
  if (!post) return null;

  return (
    <div className="@container">
      <div className="flex flex-col gap-3 @sm:flex-row @sm:justify-center @sm:gap-6">
        <div
          className="flex min-w-0 flex-1 flex-col gap-3"
          style={showPreview ? { maxWidth: 700 } : undefined}
        >
          <PostEditForm />
          {!isReordering ? (
            <>
              <PostImageDropzone />
              <PostImageCards />
            </>
          ) : (
            <PostReorderImages />
          )}
        </div>
        <div className="flex flex-col gap-3 @sm:w-72">
          <PostEditSidebar post={post} />
          <EditPostReviews post={post} />
          <PostCollaboratorSelection post={post} />
        </div>
      </div>
    </div>
  );
}
