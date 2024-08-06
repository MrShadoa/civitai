import { RefObject, createContext, useContext, useEffect, useRef, useState } from 'react';
import { useScrollAreaRef } from '~/components/ScrollArea/ScrollAreaContext';

type SizeMapping = { height: number; width: number };
const sizeMappings = new Map<string, SizeMapping>();
function getSizeMappingKey(ids: string[]) {
  return ids.join('_');
}

type ObserverCallback = (inView: boolean, entry: IntersectionObserverEntry) => void;
const IntersectionObserverCtx = createContext<{
  ready: boolean;
  providerId?: string;
  observe: (element: HTMLElement, callback: ObserverCallback) => void;
  unobserve: (element: HTMLElement) => void;
} | null>(null);

function useProviderContext() {
  const context = useContext(IntersectionObserverCtx);
  if (!context) throw new Error('missing IntersectionObserverCtx in tree');
  return context;
}

type InViewResponse<T extends HTMLElement> = [RefObject<T>, boolean];
export function useInView<T extends HTMLElement = HTMLDivElement>({
  initialInView = false,
  callback,
}: {
  initialInView?: boolean;
  callback?: ObserverCallback;
} = {}): InViewResponse<T> {
  const ref = useRef<T>(null);
  const { ready, observe, unobserve } = useProviderContext();
  const [inView, setInView] = useState(initialInView);
  const cbRef = useRef<ObserverCallback | null>();
  cbRef.current = callback;

  useEffect(() => {
    if (!ready) return;

    const target = ref.current;

    function callback(inView: boolean, entry: IntersectionObserverEntry) {
      cbRef.current?.(inView, entry);
      setInView(inView);
    }

    if (target) {
      observe(target, callback);
    }

    return () => {
      if (target) {
        unobserve(target);
      }
    };
  }, [ready]);

  return [ref, inView];
}

export function useInViewDynamic<T extends HTMLElement = HTMLDivElement>({
  initialInView,
  id,
}: {
  initialInView?: boolean;
  id: string;
}): InViewResponse<T> {
  const { providerId } = useProviderContext();
  if (!providerId)
    throw new Error(
      'missing providerId. providerId must be present to use IntersectionObserver for content with dynamic bounds'
    );
  const keyRef = useRef<string>();
  if (!keyRef.current) keyRef.current = getSizeMappingKey([providerId ?? '', id]);
  const sizeMappingRef = useRef<SizeMapping>();
  if (!sizeMappingRef.current) sizeMappingRef.current = sizeMappings.get(keyRef.current);

  const [ref, inView] = useInView<T>({
    initialInView: initialInView ?? !sizeMappingRef.current ? true : false,
    callback: (inView, entry) => {
      const target = entry.target as HTMLElement;
      const key = keyRef.current;

      if (!inView && key) {
        const { width, height } = target.getBoundingClientRect();
        if (height > 0) {
          sizeMappings.set(key, { width, height });
          target.style.height = `${height}px`;
        }
      }
    },
  });

  useEffect(() => {
    const target = ref.current;
    if (target && inView) {
      target.style.removeProperty('height');
    }
  }, [inView]);

  return [ref, !sizeMappingRef.current ? true : inView];
}

export function IntersectionObserverProvider({
  id,
  options,
  children,
}: {
  id?: string;
  options?: IntersectionObserverInit;
  children: React.ReactNode;
}) {
  const node = useScrollAreaRef();
  const observerRef = useRef<IntersectionObserver>();
  const mappingRef = useRef<Map<Element, ObserverCallback>>();
  const [ready, setReady] = useState(false);
  if (!mappingRef.current) mappingRef.current = new Map<Element, ObserverCallback>();

  useEffect(() => {
    // assigne the observer in the effect so that we react has time to assign refs before we initialize
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const callback = mappingRef.current?.get(entry.target);
            callback?.(entry.isIntersecting, entry);
          }
        },
        {
          root: node?.current,
          rootMargin: '200% 0px',
          ...options,
        }
      );
      setReady(true);
    }

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = undefined;
    };
  }, []);

  function observe(element: HTMLElement, callback: ObserverCallback) {
    observerRef.current?.observe(element);
    mappingRef.current?.set(element, callback);
  }

  function unobserve(element: HTMLElement) {
    observerRef.current?.unobserve(element);
    mappingRef.current?.delete(element);
  }

  return (
    <IntersectionObserverCtx.Provider value={{ ready, providerId: id, observe, unobserve }}>
      {children}
    </IntersectionObserverCtx.Provider>
  );
}
