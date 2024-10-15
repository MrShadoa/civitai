import { Anchor, Button, ButtonProps, Code, Group, Stack, Text } from '@mantine/core';
import { NextLink } from '@mantine/next';
import { useEffect, useRef, useState } from 'react';
import { useContainerSmallerThan } from '~/components/ContainerProvider/useContainerSmallerThan';
import { RoutedDialogLink } from '~/components/Dialog/RoutedDialogProvider';
import { SocialLinks } from '~/components/SocialLinks/SocialLinks';
import { env } from '~/env/client.mjs';
import { useFeatureFlags } from '~/providers/FeatureFlagsProvider';
import clsx from 'clsx';
import { useScrollAreaRef } from '~/components/ScrollArea/ScrollAreaContext';
import { IconArrowUp } from '@tabler/icons-react';
import { AssistantButton } from '~/components/Assistant/AssistantButton';
import { ChatPortal } from '~/components/Chat/ChatProvider';

const buttonProps: ButtonProps = {
  size: 'xs',
  variant: 'subtle',
  color: 'gray',
  px: 'xs',
};

const hash = env.NEXT_PUBLIC_GIT_HASH;

export function AppFooter() {
  // const { classes, cx } = useStyles({ fixed });
  const [showHash, setShowHash] = useState(false);
  const mobile = useContainerSmallerThan('sm');
  const features = useFeatureFlags();
  const footerRef = useRef<HTMLElement | null>(null);

  const [showFooter, setShowFooter] = useState(true);
  const scrollRef = useScrollAreaRef({
    onScroll: (node) => {
      setShowFooter(node.scrollTop <= 100);
    },
  });

  return (
    <footer
      ref={footerRef}
      className="sticky inset-x-0 bottom-0 z-50 mt-3 transition-transform"
      style={!showFooter ? { transform: 'translateY(var(--footer-height))' } : undefined}
    >
      <ChatPortal showFooter={showFooter} />
      <div className="absolute bottom-[var(--footer-height)] right-0">
        <div className="relative mb-2  mr-2 flex gap-2">
          <Button
            px="xs"
            onClick={() => scrollRef?.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className={'transition-transform'}
            style={showFooter ? { transform: 'translateY(140%)' } : undefined}
          >
            <IconArrowUp size={20} stroke={2.5} />
          </Button>
          <AssistantButton />
        </div>
      </div>
      <div
        className={clsx(
          ' relative flex h-[var(--footer-height)] w-full items-center gap-2  overflow-x-auto bg-gray-0 p-1 px-2 @sm:gap-3 dark:bg-dark-7',
          {
            ['border-t border-gray-3 dark:border-dark-4']: !features.isGreen,
            ['border-green-8 border-t-[3px]']: features.isGreen,
          }
        )}
        style={{ scrollbarWidth: 'thin' }}
      >
        <Text
          weight={700}
          sx={{ whiteSpace: 'nowrap', userSelect: 'none' }}
          onDoubleClick={() => {
            if (hash) setShowHash((x) => !x);
          }}
        >
          &copy; Civitai {new Date().getFullYear()}
        </Text>
        {showHash && hash && (
          <Stack spacing={2}>
            <Text weight={500} size="xs" sx={{ lineHeight: 1.1 }}>
              Site Version
            </Text>
            <Anchor
              target="_blank"
              href={`/github/commit/${hash}`}
              w="100%"
              sx={{ '&:hover': { textDecoration: 'none' } }}
            >
              <Code sx={{ textAlign: 'center', lineHeight: 1.1, display: 'block' }}>
                {hash.substring(0, 7)}
              </Code>
            </Anchor>
          </Stack>
        )}
        <Group spacing={0} sx={{ flexWrap: 'nowrap' }}>
          {/* <Button
            component={NextLink}
            prefetch={false}
            href="/content/careers"
            {...buttonProps}
            variant="subtle"
            color="green"
            px={mobile ? 5 : 'xs'}
          >
            Join Us 💼
          </Button> */}
          {/* <Button
            component={NextLink}
            prefetch={false}
            href="/advertise-with-us"
            {...buttonProps}
            variant="subtle"
            color="yellow"
            target="_blank"
            rel="nofollow noreferrer"
            px={mobile ? 5 : 'xs'}
          >
            Advertise 📰
          </Button> */}
          <Button
            component={NextLink}
            prefetch={false}
            href="/creators-program"
            {...buttonProps}
            color="blue"
            px={mobile ? 5 : 'xs'}
          >
            Creators
          </Button>
          <Button
            component={NextLink}
            prefetch={false}
            href="/content/tos"
            {...buttonProps}
            px={mobile ? 5 : 'xs'}
          >
            Terms of Service
          </Button>
          <Button
            component={NextLink}
            prefetch={false}
            href="/content/privacy"
            {...buttonProps}
            px={mobile ? 5 : 'xs'}
          >
            Privacy
          </Button>
          {features.safety && (
            <Button component={NextLink} href="/safety" prefetch={false} {...buttonProps}>
              Safety
            </Button>
          )}
          {features.newsroom && (
            <Button component={NextLink} href="/newsroom" {...buttonProps}>
              Newsroom
            </Button>
          )}
          <Button
            component="a"
            href="/github/wiki/REST-API-Reference"
            {...buttonProps}
            target="_blank"
            rel="nofollow noreferrer"
          >
            API
          </Button>
          <Button
            component="a"
            href="https://status.civitai.com"
            {...buttonProps}
            target="_blank"
            rel="nofollow noreferrer"
          >
            Status
          </Button>
          <Button
            component="a"
            href="/wiki"
            {...buttonProps}
            target="_blank"
            rel="nofollow noreferrer"
          >
            Wiki
          </Button>
          <Button
            component="a"
            href="/education"
            {...buttonProps}
            target="_blank"
            rel="nofollow noreferrer"
          >
            Education
          </Button>
          <Button
            component="a"
            href="https://air.civitai.com"
            {...buttonProps}
            target="_blank"
            rel="nofollow noreferrer"
          >
            Residency
          </Button>

          <SocialLinks />
        </Group>
        <Group ml="auto" spacing={4} sx={{ flexWrap: 'nowrap' }}>
          <RoutedDialogLink name="support" state={{}} passHref>
            <Button component="a" pl={4} pr="xs" color="yellow" variant="light" size="xs">
              🛟 Support
            </Button>
          </RoutedDialogLink>
        </Group>
      </div>
    </footer>
  );
}
