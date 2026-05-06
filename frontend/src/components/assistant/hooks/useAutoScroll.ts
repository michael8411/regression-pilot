import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export function useAutoScroll(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const stickRef = useRef<boolean>(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickRef.current = distanceFromBottom < 80;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  useLayoutEffect(() => {
    if (!stickRef.current) return;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    stickRef.current = true;
  }, []);

  return { ref, scrollToBottom, isStuck: () => stickRef.current };
}
