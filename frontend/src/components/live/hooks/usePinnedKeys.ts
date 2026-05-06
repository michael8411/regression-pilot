import { useCallback, useEffect, useState } from "react";

const KEY = "live.pinned-keys";

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

function write(keys: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

export function usePinnedKeys() {
  const [keys, setKeys] = useState<string[]>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setKeys(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const pin = useCallback((key: string) => {
    setKeys((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      write(next);
      return next;
    });
  }, []);

  const unpin = useCallback((key: string) => {
    setKeys((prev) => {
      const next = prev.filter((k) => k !== key);
      write(next);
      return next;
    });
  }, []);

  const toggle = useCallback((key: string) => {
    setKeys((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      write(next);
      return next;
    });
  }, []);

  return {
    keys,
    pin,
    unpin,
    toggle,
    isPinned: (k: string) => keys.includes(k),
  };
}
