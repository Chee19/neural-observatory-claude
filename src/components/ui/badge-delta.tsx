import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  RiArrowDownLine,
  RiArrowDownSFill,
  RiArrowRightLine,
  RiArrowRightSFill,
  RiArrowUpLine,
  RiArrowUpSFill,
} from "@remixicon/react";

// Tremor utility replacements for this dark-only project:
//   text-tremor-label        → text-xs  (0.75rem)
//   rounded-tremor-small     → rounded  (0.375rem)
//   rounded-tremor-default   → rounded-md (0.5rem)
//   ring-border              → ring-gray-700
//   bg-tremor-background     → bg-gray-900
//   All dark: variants used as defaults since UI is always dark.

const badgeDeltaVariants = cva(
  "inline-flex items-center whitespace-nowrap text-xs font-semibold",
  {
    variants: {
      variant: {
        outline: "gap-x-1 rounded px-2 py-1 ring-1 ring-inset ring-gray-700",
        solid: "gap-x-1 rounded px-2 py-1",
        solidOutline: "gap-x-1 rounded px-2 py-1 ring-1 ring-inset",
        complex:
          "space-x-2.5 rounded-md bg-gray-900 py-1 pl-2.5 pr-1 ring-1 ring-inset ring-gray-700",
      },
      deltaType: {
        increase: "",
        decrease: "",
        neutral: "",
      },
      iconStyle: {
        filled: "",
        line: "",
      },
    },
    compoundVariants: [
      // ── outline ─────────────────────────────────────────────────────────────
      {
        deltaType: "increase",
        variant: "outline",
        className: "text-emerald-400",
      },
      { deltaType: "decrease", variant: "outline", className: "text-white" },
      { deltaType: "neutral", variant: "outline", className: "text-gray-400" },
      // ── solid ────────────────────────────────────────────────────────────────
      {
        deltaType: "increase",
        variant: "solid",
        className: "bg-emerald-400/15 text-white",
      },
      {
        deltaType: "decrease",
        variant: "solid",
        className: "bg-red-400/15 text-white",
      },
      {
        deltaType: "neutral",
        variant: "solid",
        className: "bg-gray-500/20 text-gray-300",
      },
      // ── solidOutline ─────────────────────────────────────────────────────────
      {
        deltaType: "increase",
        variant: "solidOutline",
        className: "bg-emerald-400/15 text-white ring-emerald-400/25",
      },
      {
        deltaType: "decrease",
        variant: "solidOutline",
        className: "bg-red-400/15 text-white ring-red-400/25",
      },
      {
        deltaType: "neutral",
        variant: "solidOutline",
        className: "bg-gray-500/20 text-gray-300 ring-gray-400/25",
      },
    ],
  },
);

interface BadgeDeltaProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeDeltaVariants> {
  value: string | number;
}

const VALID_ICON_STYLES = new Set(["filled", "line"]);

const DeltaIcon = ({
  deltaType,
  iconStyle,
}: {
  deltaType: "increase" | "decrease" | "neutral";
  iconStyle: "filled" | "line" | null | undefined;
}) => {
  if (!iconStyle || !VALID_ICON_STYLES.has(iconStyle)) return null;
  const icons = {
    increase: { filled: RiArrowUpSFill, line: RiArrowUpLine },
    decrease: { filled: RiArrowDownSFill, line: RiArrowDownLine },
    neutral: { filled: RiArrowRightSFill, line: RiArrowRightLine },
  };
  const row = icons[deltaType] ?? icons.neutral;
  const Icon = row[iconStyle] ?? row.filled;
  return <Icon className="-ml-0.5 size-3" aria-hidden />;
};

const VALID_DELTA_TYPES = new Set(["increase", "decrease", "neutral"]);

export function BadgeDelta({
  className,
  variant = "solidOutline",
  deltaType = "neutral",
  iconStyle = "line",
  value,
  ...props
}: BadgeDeltaProps) {
  if (!deltaType || !VALID_DELTA_TYPES.has(deltaType)) return null;
  if (variant === "complex") {
    return (
      <span
        className={cn(badgeDeltaVariants({ variant, className }))}
        {...props}
      >
        <span
          className={cn(
            "text-xs font-semibold",
            deltaType === "increase" && "text-emerald-400",
            deltaType === "decrease" && "text-red-400",
            deltaType === "neutral" && "text-gray-300",
          )}
        >
          {value}
        </span>
        <span
          className={cn(
            "rounded px-2 py-1 text-xs font-medium",
            deltaType === "increase" && "bg-emerald-400/15",
            deltaType === "decrease" && "bg-red-400/15",
            deltaType === "neutral" && "bg-gray-700/50",
          )}
        >
          <DeltaIcon deltaType={deltaType} iconStyle="line" />
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(badgeDeltaVariants({ variant, deltaType, className }))}
      {...props}
    >
      <DeltaIcon deltaType={deltaType} iconStyle={iconStyle} />
      {value}
    </span>
  );
}
