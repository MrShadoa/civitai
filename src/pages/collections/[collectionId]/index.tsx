import { CollectionContributorPermission } from '@prisma/client';
import { Collection } from '~/components/Collections/Collection';
import { useCollectionQueryParams } from '~/components/Collections/collection.utils';
import { createServerSideProps } from '~/server/utils/server-side-helpers';
import { CollectionsLayout } from '~/components/Collections/CollectionsLayout';

export const getServerSideProps = createServerSideProps({
  useSSG: true,
  useSession: true,
  resolver: async ({ ssg, session = null, features }) => {
    if (ssg) {
      if (session) {
        ssg.collection.getAllUser.prefetch({ permission: CollectionContributorPermission.VIEW });
      }
      // TODO - prefetch top user collections and popular collections
    }

    if (!features?.collections) return { notFound: true };
  },
});

export default function Collections() {
  const { collectionId } = useCollectionQueryParams();

  return (
    <CollectionsLayout>
      {collectionId && <Collection collectionId={collectionId} fluid />}
    </CollectionsLayout>
  );
}
