import { Group, Switch, Text, Stack, createStyles, Card } from '@mantine/core';
import { BrowsingLevelsStacked } from '~/components/BrowsingLevel/BrowsingLevelsStacked';
import { useBrowsingSettings } from '~/providers/BrowserSettingsProvider';

export function MatureContentSettings() {
  const { classes, cx } = useStyles();

  const showNsfw = useBrowsingSettings((x) => x.showNsfw);
  const blurNsfw = useBrowsingSettings((x) => x.blurNsfw);
  const setState = useBrowsingSettings((x) => x.setState);

  const toggleBlurNsfw = () => setState((state) => ({ blurNsfw: !state.blurNsfw }));
  const toggleShowNsfw = () => setState((state) => ({ showNsfw: !state.showNsfw }));

  return (
    <Stack>
      <Card withBorder>
        <Card.Section withBorder className={classes.root}>
          <Group
            py="sm"
            px="md"
            position="apart"
            noWrap
            className={cx({ [classes.active]: showNsfw })}
            onClick={toggleShowNsfw}
          >
            <div>
              <Text weight={500}>Show mature content</Text>
              <Text size="sm">
                {`By enabling mature content, you confirm you are over the age of 18.`}
              </Text>
            </div>
            <Switch checked={showNsfw} onChange={toggleShowNsfw} />
          </Group>
        </Card.Section>
        <Card.Section withBorder className={classes.root}>
          <Group
            py="sm"
            px="md"
            position="apart"
            noWrap
            className={cx({ [classes.active]: showNsfw && blurNsfw })}
            onClick={toggleBlurNsfw}
          >
            <Text color={!showNsfw ? 'dimmed' : undefined}>
              <Text weight={500}>Blur mature content</Text>
              <Text size="sm">Blur images and videos that are marked as mature</Text>
            </Text>
            <Switch disabled={!showNsfw} checked={showNsfw && blurNsfw} onChange={toggleBlurNsfw} />
          </Group>
        </Card.Section>
      </Card>
      {showNsfw && (
        <Stack spacing={4}>
          <Stack spacing={0}>
            <Text weight={500}>Browsing Levels</Text>
            {/* <Text size="sm">Pick browsing levels for the type of content you want to see.</Text> */}
          </Stack>
          <BrowsingLevelsStacked />
        </Stack>
      )}
    </Stack>
  );
}

const useStyles = createStyles((theme) => ({
  root: {
    ['& > div']: {
      ['&:hover']: {
        background: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[2],
        cursor: 'pointer',
      },
      ['&:not(:last-child)']: {
        borderBottom: `1px ${
          theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3]
        } solid`,
      },
    },
  },
  active: {
    background: theme.colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[1],
  },
}));
