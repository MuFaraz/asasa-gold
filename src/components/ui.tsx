"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-2xl border border-ink/10 bg-white p-5 shadow-[0_1px_2px_rgba(26,31,27,0.04)]", className)}>{children}</section>;
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-ink hover:bg-[#7dbb42] active:bg-[#72ad3a]",
    secondary: "bg-brand text-white hover:bg-[#0a3a37]",
    ghost: "bg-transparent text-brand ring-1 ring-inset ring-brand/25 hover:bg-brand/5",
    danger: "bg-transparent text-[#8a2b1f] ring-1 ring-inset ring-[#8a2b1f]/30 hover:bg-[#8a2b1f]/5",
  }[variant];
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
    />
  );
}

export function Notice({ tone, title, children }: { tone: "info" | "warn" | "error" | "success"; title?: string; children?: ReactNode }) {
  const styles = {
    info: "border-brand/15 bg-brand/5 text-ink",
    warn: "border-[#c98a12]/30 bg-[#fdf6e3] text-ink",
    error: "border-[#8a2b1f]/25 bg-[#fbeeec] text-ink",
    success: "border-accent/40 bg-accent/10 text-ink",
  }[tone];
  return (
    <div role={tone === "error" || tone === "warn" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm leading-relaxed", styles)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5 text-ink/80" : ""}>{children}</div>}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wider text-ink/55">{children}</p>;
}

/** Ticks so relative times ("2 min ago") and countdowns stay current. `null` before hydration. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function timeAgo(from: number, now: number | null): string {
  if (now == null) return "";
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const SOURCE_LABEL = { pakgold: "PakGold", goldprice: "GoldPrice.org" } as const;
