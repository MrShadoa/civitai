import { forwardRef } from 'react';
import { SubNav } from '~/components/AppLayout/SubNav';
import { ScrollArea, ScrollAreaProps } from '~/components/ScrollArea/ScrollArea';

export function ScrollAreaMain({ children, ...props }: ScrollAreaProps) {
  return (
    <ScrollArea pt={0} {...props}>
      <SubNav />
      {children}
    </ScrollArea>
  );
}
