import {
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  createStyles,
} from '@mantine/core';
import { CollectionReadConfiguration, CollectionWriteConfiguration } from '@prisma/client';
import { IconArrowLeft, IconEyeOff, IconLock, IconPlus, IconWorld } from '@tabler/icons-react';
import { forwardRef, useEffect, useState } from 'react';
import { z } from 'zod';
import { createContextModal } from '~/components/Modals/utils/createContextModal';
import {
  Form,
  InputCheckboxGroup,
  InputSelect,
  InputText,
  InputTextArea,
  useForm,
} from '~/libs/form';
import {
  AddCollectionItemInput,
  saveCollectionItemInputSchema,
  upsertCollectionInput,
} from '~/server/schema/collection.schema';
import { showErrorNotification } from '~/utils/notifications';
import { trpc } from '~/utils/trpc';

type PrivacyData = { icon: React.ReactNode; value: string; label: string; description: string };
const privacyData: Record<CollectionReadConfiguration, PrivacyData> = {
  [CollectionReadConfiguration.Private]: {
    icon: <IconLock size={18} />,
    label: 'Private',
    value: CollectionReadConfiguration.Private,
    description: 'Only you and contributors for this collection can see this',
  },
  [CollectionReadConfiguration.Public]: {
    icon: <IconWorld size={18} />,
    label: 'Public',
    value: CollectionReadConfiguration.Public,
    description: 'Anyone can see this collection',
  },
  [CollectionReadConfiguration.Unlisted]: {
    icon: <IconEyeOff size={18} />,
    label: 'Unlisted',
    value: CollectionReadConfiguration.Unlisted,
    description: 'Only people with the link can see this collection',
  },
};

type Props = Partial<AddCollectionItemInput>;

const { openModal: openAddToCollectionModal, Modal } = createContextModal<Props>({
  name: 'addToCollection',
  title: 'Add to Collection',
  size: 'sm',
  Element: ({ context, props }) => {
    const [creating, setCreating] = useState(false);

    return creating ? (
      <NewCollectionForm
        {...props}
        onBack={() => setCreating(false)}
        onSubmit={() => context.close()}
      />
    ) : (
      <CollectionListForm
        {...props}
        onNewClick={() => setCreating(true)}
        onSubmit={() => context.close()}
      />
    );
  },
});

export { openAddToCollectionModal };
export default Modal;

const useCollectionListStyles = createStyles((theme) => ({
  body: { alignItems: 'center', paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.xs },
  labelWrapper: { flex: 1 },
}));

function CollectionListForm({
  onNewClick,
  onSubmit,
  ...props
}: Props & { onNewClick: VoidFunction; onSubmit: VoidFunction }) {
  const { note, ...target } = props;
  const { classes } = useCollectionListStyles();
  const form = useForm({
    schema: saveCollectionItemInputSchema,
    defaultValues: { ...props, collectionIds: [] },
    shouldUnregister: false,
  });
  const queryUtils = trpc.useContext();

  const { data: collections = [], isLoading } = trpc.collection.getAllUser.useQuery({});
  const { data: matchedCollections = [] } = trpc.collection.getUserCollectionsByItem.useQuery({
    ...target,
  });

  const addCollectionItemMutation = trpc.collection.saveItem.useMutation();
  const handleSubmit = (data: AddCollectionItemInput) => {
    addCollectionItemMutation.mutate(data, {
      async onSuccess() {
        await queryUtils.collection.getUserCollectionsByItem.invalidate();
        onSubmit();
      },
      onError(error) {
        showErrorNotification({
          title: 'Unable to add item',
          error: new Error(error.message),
        });
      },
    });
  };

  useEffect(() => {
    if (matchedCollections.length === 0) return;
    const collectionIds = matchedCollections.map((collection) => collection.id.toString());

    // Ignoring because CheckboxGroup only accepts string[] to
    // keep track of the selected values but actual schema should be number[]
    // @ts-ignore: See above
    form.reset({ ...props, collectionIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedCollections, props.articleId, props.imageId, props.modelId, props.postId]);

  return (
    <Form form={form} onSubmit={handleSubmit}>
      <Stack spacing="xl">
        <Stack spacing={4}>
          <Group spacing="xs" position="apart" noWrap>
            <Text size="sm" weight="bold">
              Your collections
            </Text>
            <Button
              variant="subtle"
              size="xs"
              leftIcon={<IconPlus size={16} />}
              onClick={onNewClick}
              compact
            >
              New collection
            </Button>
          </Group>
          {isLoading ? (
            <Center py="xl">
              <Loader variant="bars" />
            </Center>
          ) : (
            <ScrollArea.Autosize maxHeight={200}>
              {collections.length > 0 ? (
                <InputCheckboxGroup name="collectionIds" orientation="vertical" spacing={8}>
                  {collections.map((collection) => (
                    <Checkbox
                      key={collection.id}
                      classNames={classes}
                      value={collection.id.toString()}
                      label={
                        <Group spacing="xs" position="apart" w="100%" noWrap>
                          <Text lineClamp={1} inherit>
                            {collection.name}
                          </Text>
                          {privacyData[collection.read].icon}
                        </Group>
                      }
                    />
                  ))}
                </InputCheckboxGroup>
              ) : (
                <Center py="xl">
                  <Text color="dimmed">{`You don't have any collections yet.`}</Text>
                </Center>
              )}
            </ScrollArea.Autosize>
          )}
        </Stack>
        <Group position="right">
          <Button type="submit" loading={addCollectionItemMutation.isLoading}>
            Save
          </Button>
        </Group>
      </Stack>
    </Form>
  );
}

function NewCollectionForm({
  onSubmit,
  onBack,
  ...props
}: Props & { onSubmit: VoidFunction; onBack: VoidFunction }) {
  const form = useForm({
    schema: upsertCollectionInput,
    defaultValues: {
      ...props,
      name: '',
      description: '',
      read: CollectionReadConfiguration.Public,
      write: CollectionWriteConfiguration.Private,
    },
    shouldUnregister: false,
  });
  const queryUtils = trpc.useContext();

  const upsertCollectionMutation = trpc.collection.upsert.useMutation();
  const handleSubmit = (data: z.infer<typeof upsertCollectionInput>) => {
    upsertCollectionMutation.mutate(data, {
      async onSuccess() {
        await queryUtils.collection.getAllUser.invalidate();
        await queryUtils.collection.getUserCollectionsByItem.invalidate();
        onSubmit();
      },
      onError(error) {
        showErrorNotification({
          title: 'Unable to create collection',
          error: new Error(error.message),
        });
      },
    });
  };

  return (
    <Form form={form} onSubmit={handleSubmit}>
      <Stack spacing="xl">
        <Stack spacing={4}>
          <Group position="apart">
            <Text size="sm" weight="bold">
              New Collection
            </Text>
            <Button
              variant="subtle"
              size="xs"
              leftIcon={<IconArrowLeft size={16} />}
              onClick={onBack}
              compact
            >
              Back to selection
            </Button>
          </Group>
          <InputText
            name="name"
            label="Name"
            placeholder="e.g.: Video Game Charaters"
            withAsterisk
          />
          <InputTextArea
            name="description"
            label="Description"
            placeholder="e.g.: My favorite video game characters"
            rows={3}
            autosize
          />
          <InputSelect
            name="read"
            label="Privacy"
            data={Object.values(privacyData)}
            itemComponent={SelectItem}
          />
        </Stack>
        <Group position="right">
          <Button type="submit" loading={upsertCollectionMutation.isLoading}>
            Create
          </Button>
        </Group>
      </Stack>
    </Form>
  );
}

const SelectItem = forwardRef<HTMLDivElement, PrivacyData>(
  ({ label, description, icon, ...otherProps }, ref) => {
    return (
      <div ref={ref} {...otherProps}>
        <Group align="center" noWrap>
          {icon}
          <div>
            <Text size="sm">{label}</Text>
            <Text size="xs" color="dimmed">
              {description}
            </Text>
          </div>
        </Group>
      </div>
    );
  }
);
SelectItem.displayName = 'SelectItem';
