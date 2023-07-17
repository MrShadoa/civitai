import { Button, Group, Text, Tooltip } from '@mantine/core';
import { IconBrush } from '@tabler/icons-react';
import { generationPanel } from '~/store/generation.store';

export function GenerateButton({ iconOnly, modelVersionId }: Props) {
  const button = (
    <Button
      variant="filled"
      sx={iconOnly ? { paddingRight: 0, paddingLeft: 0, width: 36 } : { flex: 1 }}
      onClick={() => generationPanel.open({ type: 'model', id: modelVersionId })}
    >
      {iconOnly ? (
        <IconBrush size={24} />
      ) : (
        <Group spacing={8} noWrap>
          <IconBrush size={20} />
          <Text inherit inline>
            Create
          </Text>
        </Group>
      )}
    </Button>
  );

  return iconOnly ? (
    <Tooltip label="Start Generating" withArrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
type Props = { iconOnly?: boolean; modelVersionId: number };
