import { Affix, Button, ButtonProps, Transition, TransitionProps } from '@mantine/core';
import { useScrollAreaRef } from '~/components/ScrollArea/ScrollArea';
type Props = Omit<ButtonProps, 'style' | 'onClick'> &
  Pick<TransitionProps, 'transition' | 'mounted' | 'duration'> & {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  };

export function FloatingActionButton({
  transition,
  mounted,
  children,
  duration,
  ...buttonProps
}: Props) {
  const node = useScrollAreaRef();

  return (
    <Affix
      // @ts-ignore: ignoring cause target prop accepts string. See: https://v5.mantine.dev/core/portal#specify-target-dom-node
      target={node?.current}
      position={{ bottom: 12, right: 12 }}
      zIndex={199}
      style={{ transition: 'bottom 300ms linear' }}
    >
      <Transition transition={transition} mounted={mounted} duration={duration}>
        {(transitionStyles) => (
          <Button {...buttonProps} style={transitionStyles}>
            {children}
          </Button>
        )}
      </Transition>
    </Affix>
  );
}
