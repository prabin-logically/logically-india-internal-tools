import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { cn } from "@/shared/lib/cn";
import { isValidCode } from "./timeCode";

type GateState = "idle" | "typing" | "submitting" | "invalid";

interface GateProps {
  onUnlock: () => void;
}

export function Gate({ onUnlock }: GateProps) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<GateState>("idle");
  const [fading, setFading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  function submit(code: string) {
    setState("submitting");
    if (isValidCode(code)) {
      setFading(true);
      window.setTimeout(() => {
        onUnlock();
      }, 150);
      return;
    }
    setState("invalid");
    clearTimerRef.current = window.setTimeout(() => {
      setValue("");
      setState("idle");
      inputRef.current?.focus();
    }, 600);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
    setValue(digits);
    if (state === "invalid") setState("typing");
    else if (digits.length > 0) setState("typing");
    else setState("idle");
    if (digits.length === 4) submit(digits);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.length === 4) {
      e.preventDefault();
      submit(value);
    }
  }

  const helperText =
    state === "invalid"
      ? "Incorrect code"
      : state === "submitting"
        ? "Checking..."
        : "";

  const borderClass =
    state === "invalid"
      ? "border-error"
      : state === "typing"
        ? "border-border-strong"
        : "border-border";

  const helperClass =
    state === "invalid" ? "text-error" : "text-text-muted";

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-bg transition-opacity duration-150",
        "motion-reduce:transition-none",
        fading ? "opacity-0" : "opacity-100",
      )}
    >
      <div className="w-full max-w-[360px] rounded-lg bg-surface p-8 shadow-sm">
        <p className="text-sm text-text-muted">Logically India Internal Tools</p>
        <label
          htmlFor="gate-code"
          className="mt-6 block text-sm font-medium text-text"
        >
          Access code
        </label>
        <input
          id="gate-code"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          pattern="\d{4}"
          aria-label="Access code"
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          className={cn(
            "mt-2 block w-full rounded-md border bg-surface px-3 py-2",
            "text-center font-mono text-2xl tracking-widest text-text",
            "transition-colors duration-150 focus:outline-none",
            borderClass,
          )}
        />
        <p
          aria-live="polite"
          className={cn("mt-2 h-4 text-xs", helperClass)}
        >
          {helperText}
        </p>
      </div>
    </div>
  );
}
