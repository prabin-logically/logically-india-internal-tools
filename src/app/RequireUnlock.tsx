import type { ReactNode } from "react";
import { useAuth } from "./auth/useAuth";
import { Gate } from "./auth/Gate";

interface RequireUnlockProps {
  children: ReactNode;
}

export function RequireUnlock({ children }: RequireUnlockProps) {
  const { unlocked, unlock } = useAuth();
  if (!unlocked) return <Gate onUnlock={unlock} />;
  return <>{children}</>;
}
