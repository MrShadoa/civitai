import { ModalProps, Modal } from '@mantine/core';
import { useEffect } from 'react';
import { useStackingContext } from '~/components/Dialog/dialogStore';
import { ScrollArea } from '~/components/ScrollArea/ScrollArea';

export function PageModal({ children, ...props }: ModalProps) {
  const { opened } = props;
  const { increase, decrease } = useStackingContext();
  useEffect(() => {
    increase();

    return () => {
      decrease();
    };
  }, [opened]);

  return (
    <Modal
      target="main"
      {...props}
      zIndex={499}
      transitionDuration={0}
      styles={{
        root: { position: 'absolute' },
        body: { height: '100%', width: '100%', display: 'flex', flexDirection: 'column' },
      }}
    >
      <ScrollArea>{children}</ScrollArea>
    </Modal>
  );
}
