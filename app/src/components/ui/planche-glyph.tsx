// Planche — status / priority / progress glyphs. Reference implementation (port as-is).
// Colours come from app/src/styles/tokens.css; never hardcode them.
import type * as React from "react";

export type Status = "draft" | "todo" | "progress" | "review" | "done" | "cancelled" | "deleted";
export type Priority = "none" | "urgent" | "high" | "medium" | "low";

const v = (name: string) => `var(--pl-${name})`;

export function StatusGlyph({
  status,
  size = 14,
  title,
}: {
  status: Status;
  size?: number;
  title?: string;
}) {
  const ring = (c: string, dashed = false) => (
    <circle
      cx={7}
      cy={7}
      r={5.75}
      strokeWidth={1.5}
      stroke={c}
      strokeDasharray={dashed ? "2.26 2.26" : undefined}
    />
  );
  const body: Record<Status, React.ReactNode> = {
    draft: ring(v("fg-3"), true),
    todo: ring(v("fg-3")),
    progress: (
      <>
        {ring(v("s-doing"))}
        <path
          d="M7 7V4.25A2.75 2.75 0 0 1 7 9.75Z"
          fill={v("s-doing")}
        />
      </>
    ),
    review: (
      <>
        {ring(v("s-review"))}
        <path
          d="M7 7V4.25A2.75 2.75 0 1 1 4.25 7Z"
          fill={v("s-review")}
        />
      </>
    ),
    done: (
      <>
        <circle
          cx={7}
          cy={7}
          r={6.5}
          fill={v("s-done")}
        />
        <path
          d="M4.4 7.15l1.75 1.75 3.45-3.6"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          stroke={v("bg")}
        />
      </>
    ),
    cancelled: (
      <>
        <circle
          cx={7}
          cy={7}
          r={6.5}
          fill={v("fg-3")}
        />
        <path
          d="M5 5l4 4M9 5l-4 4"
          strokeWidth={1.5}
          strokeLinecap="round"
          stroke={v("bg")}
        />
      </>
    ),
    deleted: (
      <>
        <circle
          cx={7}
          cy={7}
          r={6.5}
          fill={v("danger")}
        />
        <path
          d="M4.6 7h4.8"
          strokeWidth={1.5}
          strokeLinecap="round"
          stroke={v("bg")}
        />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      role="img"
      aria-label={title ?? status}
      style={{ flex: "none" }}
    >
      {body[status]}
    </svg>
  );
}

export function PriorityGlyph({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const lvl = { none: 0, low: 1, medium: 2, high: 3, urgent: 0 }[priority];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      role="img"
      aria-label={`Priority: ${priority}`}
      style={{ flex: "none" }}
    >
      {priority === "none" &&
        [1.5, 5.75, 10].map((x) => (
          <rect
            key={x}
            x={x}
            y={6.25}
            width={2.5}
            height={1.5}
            rx={0.75}
            fill={v("fg-3")}
          />
        ))}
      {priority === "urgent" && (
        <>
          <rect
            x={1}
            y={1}
            width={12}
            height={12}
            rx={3}
            fill={v("accent")}
          />
          <path
            d="M7 4v3.6"
            strokeWidth={1.6}
            strokeLinecap="round"
            stroke={v("bg")}
          />
          <circle
            cx={7}
            cy={10}
            r={0.95}
            fill={v("bg")}
          />
        </>
      )}
      {lvl > 0 &&
        (
          [
            [1.5, 8.5, 4],
            [5.75, 5.5, 7],
            [10, 2.5, 10],
          ] as const
        ).map(([x, y, h], i) => (
          <rect
            key={x}
            x={x}
            y={y}
            width={2.5}
            height={h}
            rx={1}
            fill={i < lvl ? v("fg-2") : v("border-strong")}
          />
        ))}
    </svg>
  );
}

/** Sub-issue progress ring. value: 0..1 (completed / total, Cancelled excluded). */
export function ProgressRing({ value, size = 12 }: { value: number; size?: number }) {
  const C = 2 * Math.PI * 5;
  const p = Math.max(0, Math.min(1, value));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      role="img"
      aria-label={`${Math.round(p * 100)}% done`}
      style={{ flex: "none" }}
    >
      <circle
        cx={7}
        cy={7}
        r={5}
        strokeWidth={2}
        stroke={v("border-strong")}
      />
      <circle
        cx={7}
        cy={7}
        r={5}
        strokeWidth={2}
        strokeDasharray={`${p * C} ${C}`}
        transform="rotate(-90 7 7)"
        stroke={p === 1 ? v("s-done") : v("fg-2")}
      />
    </svg>
  );
}

export const STATUS_ORDER: Status[] = ["draft", "todo", "progress", "review", "done", "cancelled"];
export const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft",
  todo: "Todo",
  progress: "In progress",
  review: "In review",
  done: "Done",
  cancelled: "Cancelled",
  deleted: "Deleted",
};
