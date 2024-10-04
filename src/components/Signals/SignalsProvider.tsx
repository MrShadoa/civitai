import { MantineColor, Notification, NotificationProps } from '@mantine/core';
import { useSession } from 'next-auth/react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { SignalNotifications } from '~/components/Signals/SignalsNotifications';
import { SignalsRegistrar } from '~/components/Signals/SignalsRegistrar';
import { SignalMessages } from '~/server/common/enums';
// import { createSignalWorker, SignalWorker } from '~/utils/signals';
import { useSignalsWorker, SignalWorker, SignalStatus } from '~/utils/signals/useSignalsWorker';
import { trpc } from '~/utils/trpc';

type SignalState = {
  connected: boolean;
  status?: SignalStatus;
  worker: SignalWorker | null;
};

const signalStatusDictionary: Record<SignalStatus, MantineColor> = {
  connected: 'green',
  reconnected: 'green',
  reconnecting: 'yellow',
  error: 'red',
  closed: 'red',
};

const SignalContext = createContext<SignalState | null>(null);
export const useSignalContext = () => {
  const context = useContext(SignalContext);
  if (!context) throw new Error('SignalContext not in tree');
  return context;
};

// Add possible types to this data structure. Leave any for safeguarding.
type SignalCallback = (data: any) => void;

export const useSignalConnection = (message: SignalMessages, cb: SignalCallback) => {
  const { worker } = useSignalContext();
  const cbRef = useRef(cb);
  // any updates to cb will be assigned to cbRef.current
  cbRef.current = cb;

  useEffect(() => {
    const callback = (args: any) => cbRef.current(args);

    worker?.on(message, callback);
    return () => {
      worker?.off(message, callback);
    };
  }, [worker, message]);
};

export function SignalProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const queryUtils = trpc.useUtils();
  const [status, setStatus] = useState<SignalStatus>();

  const { data } = trpc.signals.getToken.useQuery(undefined, {
    enabled: !!session.data?.user,
  });

  const accessToken = data?.accessToken;
  const userId = session.data?.user?.id;

  const worker = useSignalsWorker(
    { accessToken },
    {
      onReconnected: () => {
        if (userId) {
          queryUtils.buzz.getBuzzAccount.invalidate();
          queryUtils.orchestrator.queryGeneratedImages.invalidate();
        }
      },
      onError: () => {
        queryUtils.signals.getToken.invalidate();
      },
      onStatusChange: ({ status }) => setStatus(status),
    }
  );

  const connected = status === 'connected' || status === 'reconnected';

  return (
    <SignalContext.Provider
      value={{
        connected,
        status,
        worker,
      }}
    >
      <SignalNotifications />
      <SignalsRegistrar />
      {children}
    </SignalContext.Provider>
  );
}

export function SignalStatusNotification({
  title,
  children,
  ...notificationProps
}: Omit<NotificationProps, 'children' | 'color' | 'title'> & {
  children: (status: SignalStatus) => React.ReactNode;
  title?: (status: SignalStatus) => React.ReactNode;
}) {
  const { connected, status } = useSignalContext();
  if (!status || connected) return null;

  return (
    <Notification
      {...notificationProps}
      // onClose={dismiss}
      color={signalStatusDictionary[status]}
      title={title?.(status)}
      disallowClose
    >
      {children(status)}
    </Notification>
  );
}
