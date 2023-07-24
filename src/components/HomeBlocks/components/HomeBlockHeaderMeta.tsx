import React from 'react';

import { Button, Group, Text, Title } from '@mantine/core';
import Link from 'next/link';
import { IconArrowRight } from '@tabler/icons-react';
import { HomeBlockMetaSchema } from '~/server/schema/home-block.schema';
import { useIsMobile } from '~/hooks/useIsMobile';

const HomeBlockHeaderMeta = ({ metadata }: Props) => {
  const isMobile = useIsMobile();

  return (
    <>
      {metadata?.title && (
        <Group position="apart" align="center" pb="md" pr={isMobile ? 'md' : undefined} noWrap>
          <Title
            sx={(theme) => ({
              fontSize: theme.headings.sizes.h1.fontSize,
              [theme.fn.smallerThan('md')]: {
                fontSize: theme.headings.sizes.h3.fontSize,
              },
            })}
          >
            {metadata?.title}
          </Title>
          {metadata.link && (
            <Link href={metadata.link} passHref>
              <Button
                style={{ height: 34 }}
                component="a"
                variant="subtle"
                rightIcon={<IconArrowRight size={16} />}
              >
                {metadata.linkText ?? 'View All'}
              </Button>
            </Link>
          )}
        </Group>
      )}
      {metadata?.description && <Text mb="md">{metadata?.description}</Text>}
    </>
  );
};

type Props = { metadata: HomeBlockMetaSchema };
export { HomeBlockHeaderMeta };
