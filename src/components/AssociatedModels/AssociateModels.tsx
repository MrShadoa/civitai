import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  Stack,
  Text,
  Card,
  Group,
  Button,
  ActionIcon,
  Center,
  Loader,
  Alert,
  Badge,
  SelectItemProps,
  Box,
} from '@mantine/core';
import { AssociationType } from '@prisma/client';
import { IconGripVertical, IconSearch, IconTrash, IconUser } from '@tabler/icons-react';
import { isEqual } from 'lodash-es';
import { forwardRef, useMemo, useState } from 'react';
import { ClearableAutoComplete } from '~/components/ClearableAutoComplete/ClearableAutoComplete';
import { SortableItem } from '~/components/ImageUpload/SortableItem';
import { AssociatedResourceModel } from '~/server/selectors/model.selector';
import { ModelFindResourceToAssociate } from '~/types/router';
import { useDebouncer } from '~/utils/debouncer';
import { trpc } from '~/utils/trpc';

type State = Array<
  | { resourceType: 'models'; item: ModelFindResourceToAssociate['models'][number] }
  | { resourceType: 'articles'; item: ModelFindResourceToAssociate['articles'][number] }
>;

export function AssociateModels({
  fromId,
  type,
  onSave,
  limit = 10,
}: {
  fromId: number;
  type: AssociationType;
  onSave?: () => void;
  limit?: number;
}) {
  const queryUtils = trpc.useContext();
  const [changed, setChanged] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [query, setQuery] = useState('');

  const { data: { models, articles } = { models: [], articles: [] }, refetch } =
    trpc.model.findResourcesToAssociate.useQuery({ query }, { enabled: false });
  const { data = { articles: [], models: [] }, isLoading } =
    trpc.model.getAssociatedResourcesSimple.useQuery({ fromId, type });
  const [associatedResources, setAssociatedResources] = useState<State>(() => [
    ...data.models.map((item) => ({ resourceType: 'models' as const, item })),
    ...data.articles.map((item) => ({ resourceType: 'articles' as const, item })),
  ]);

  const { mutate, isLoading: isSaving } = trpc.model.setAssociatedModels.useMutation({
    onSuccess: () => {
      queryUtils.model.getAssociatedResourcesSimple.setData({ fromId, type }, () =>
        associatedResources.reduce(
          (acc, current) => {
            if (current.resourceType === 'articles') {
              return { ...acc, articles: [...acc.articles, current.item] };
            }
            return { ...acc, models: [...acc.models, current.item] };
          },
          { articles: [], models: [] } as ModelFindResourceToAssociate
        )
      );
      queryUtils.model.getAssociatedModelsCardData.invalidate({ fromId, type });
      setChanged(false);
      onSave?.();
    },
  });

  const debouncer = useDebouncer(500);
  const handleSearchChange = (value: string) => {
    setQuery(value);
    debouncer(() => {
      if (!value.length) return;
      refetch();
    });
  };

  const handleItemSubmit = ({
    item,
    group,
  }: {
    value: string;
    item: AssociatedResourceModel;
    group: 'Models' | 'Articles';
  }) => {
    setChanged(true);
    setAssociatedResources((resources) => [
      ...resources,
      ...(group === 'Models'
        ? [{ resourceType: 'models' as const, item }]
        : [{ resourceType: 'articles' as const, item: item as any }]), // TODO.manuel: type item correctyly
    ]);
    setQuery('');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      const resources = [...associatedResources];
      const ids = resources.map(({ item }): UniqueIdentifier => item.id);
      const oldIndex = ids.indexOf(active.id);
      const newIndex = ids.indexOf(over.id);
      const sorted = arrayMove(resources, oldIndex, newIndex);
      setAssociatedResources(sorted);
      setChanged(!isEqual(data, sorted));
    }
  };

  const handleRemove = (id: number) => {
    const models = [...associatedResources.filter(({ item }) => item.id !== id)];
    setAssociatedResources(models);
    setChanged(!isEqual(data, models));
  };

  const handleReset = () => {
    setChanged(false);
    setAssociatedResources([
      ...data.models.map((item) => ({ resourceType: 'models' as const, item })),
      ...data.articles.map((item) => ({ resourceType: 'articles' as const, item })),
    ]);
  };
  const handleSave = () => {
    // TODO.manuel: send ids correctly
    mutate({ fromId, type, associatedIds: associatedResources.map(({ item }) => item.id) });
  };

  const autocompleteData = useMemo(
    () => [
      ...models
        .filter(
          (x) => !associatedResources.map(({ item }) => item.id).includes(x.id) && x.id !== fromId
        )
        .map((model) => ({ value: model.name, nsfw: model.nsfw, item: model, group: 'Models' })),
      ...articles
        .filter(
          (x) => !associatedResources.map(({ item }) => item.id).includes(x.id) && x.id !== fromId
        )
        .map((article) => ({
          value: article.title,
          nsfw: article.nsfw,
          item: article,
          group: 'Articles',
        })),
    ],
    [articles, associatedResources, fromId, models]
  );

  return (
    <Stack>
      {associatedResources.length < limit && (
        <ClearableAutoComplete
          // label={`Add up to ${limit} models`}
          placeholder="Search..."
          icon={<IconSearch />}
          data={autocompleteData}
          value={query}
          onChange={handleSearchChange}
          onItemSubmit={handleItemSubmit}
          itemComponent={SearchItem}
          limit={20}
          clearable
        />
      )}

      {isLoading ? (
        <Center p="xl">
          <Loader />
        </Center>
      ) : (
        <Stack spacing={0}>
          <Text align="right">
            {associatedResources.length}/{limit}
          </Text>
          {!!associatedResources.length ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={associatedResources.map(({ item }) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <Stack spacing="xs">
                  {associatedResources.map(({ resourceType, item }) => (
                    <SortableItem key={item.id} id={item.id}>
                      <Card withBorder p="xs">
                        <Group position="apart">
                          <Group align="center">
                            <IconGripVertical />
                            <Stack spacing="xs">
                              <Text size="md" lineClamp={2}>
                                {resourceType === 'models' ? item.name : item.title}
                              </Text>
                              <Group spacing="xs">
                                <Badge>{resourceType === 'models' ? item.type : 'Article'}</Badge>
                                <Badge leftSection={<IconUser size={12} />}>
                                  {item.user.username}
                                </Badge>
                                {item.nsfw && <Badge color="red">NSFW</Badge>}
                              </Group>
                            </Stack>
                          </Group>
                          <ActionIcon
                            variant="filled"
                            color="red"
                            onClick={() => handleRemove(item.id)}
                          >
                            <IconTrash />
                          </ActionIcon>
                        </Group>
                      </Card>
                    </SortableItem>
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
          ) : (
            <Alert>There are no {type.toLowerCase()} models associated with this model</Alert>
          )}
        </Stack>
      )}
      {changed && (
        <Group position="right">
          <Button variant="default" onClick={handleReset}>
            Reset
          </Button>
          <Button onClick={handleSave} loading={isSaving}>
            Save Changes
          </Button>
        </Group>
      )}
    </Stack>
  );
}

type SearchItemProps = SelectItemProps & { item: AssociatedResourceModel; nsfw: boolean };
const SearchItem = forwardRef<HTMLDivElement, SearchItemProps>(({ value, nsfw, ...props }, ref) => {
  return (
    <Box ref={ref} {...props}>
      <Group noWrap spacing="xs">
        <Text lineClamp={1}>{value}</Text>
        {nsfw && <Badge color="red">NSFW</Badge>}
      </Group>
    </Box>
  );
});
SearchItem.displayName = 'SearchItem';
