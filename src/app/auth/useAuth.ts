import { useCallback, useState } from "react";

const STORAGE_KEY = "lit-unlocked";

function readUnlocked(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useAuth() {
  const [unlocked, setUnlocked] = useState<boolean>(() => readUnlocked());

  const unlock = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch (err) {
      console.warn("sessionStorage unavailable; unlock will not persist", err);
    }
    setUnlocked(true);
  }, []);

  const lock = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setUnlocked(false);
  }, []);

  return { unlocked, unlock, lock };
}
