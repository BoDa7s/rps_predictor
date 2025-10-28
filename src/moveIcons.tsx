import React from "react";
import type { Move } from "./gameTypes";

export interface MoveIconProps {
  move: Move;
  className?: string;
  size?: number | string;
  title?: string;
}

function resolveSize(size: number | string | undefined): string | undefined {
  if (size == null) return undefined;
  if (typeof size === "number") {
    return `${size}px`;
  }
  return size;
}

const RockShape = (
  <>
    <path
      d="M18 12.5L29.5 6l13 5 8.5 13.5-3.2 18-15 9-15-5.5L12 32.5 18 12.5Z"
      fill="#475569"
      stroke="#0f172a"
      strokeWidth={3}
      strokeLinejoin="round"
    />
    <path
      d="M26 12l7.8 2.4 6.7 7.8-1.6 13-9.9 6.4-10.4-3.8-2.6-11.7 3.5-10.4 6.5-3.7Z"
      fill="#64748b"
      stroke="#0f172a"
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <path
      d="M23.2 21.5c1.8-2.3 4.7-3.6 7.7-3.2 3 .4 5.6 2.5 6.5 5.4"
      stroke="#cbd5f5"
      strokeWidth={2.2}
      strokeLinecap="round"
    />
  </>
);

const PaperShape = (
  <>
    <path
      d="M19 7h21l9 9v34H19V7Z"
      fill="#f8fafc"
      stroke="#0f172a"
      strokeWidth={3}
      strokeLinejoin="round"
    />
    <path d="M40 7v9h9" fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinejoin="round" />
    <path
      d="M24 23.5h19M24 31.5h19M24 39.5h12"
      stroke="#cbd5f5"
      strokeWidth={3}
      strokeLinecap="round"
    />
  </>
);

const ScissorsShape = (
  <>
    <path
      d="M18.5 19.5 34 29.5l11.5-7.5"
      stroke="#0f172a"
      strokeWidth={3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M18 34c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8Zm32-6c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8Z"
      fill="#fbbf24"
      stroke="#0f172a"
      strokeWidth={3}
    />
    <path
      d="M26 42c0 4.4-3.6 8-8 8"
      stroke="#f59e0b"
      strokeWidth={2}
      strokeLinecap="round"
    />
    <path
      d="M50 36c0 4.4-3.6 8-8 8"
      stroke="#f59e0b"
      strokeWidth={2}
      strokeLinecap="round"
    />
    <path
      d="M33 31.5 42 37"
      stroke="#38bdf8"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

const MOVE_SHAPES: Record<Move, JSX.Element> = {
  rock: RockShape,
  paper: PaperShape,
  scissors: ScissorsShape,
};

export const MoveIcon: React.FC<MoveIconProps> = ({ move, className, size, title }) => {
  const dimension = resolveSize(size);
  return (
    <svg
      className={className}
      style={dimension ? { width: dimension, height: dimension } : undefined}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {MOVE_SHAPES[move]}
    </svg>
  );
};

interface MoveLabelProps {
  move: Move;
  className?: string;
  iconSize?: number | string;
  textClassName?: string;
}

function formatMove(move: Move): string {
  return move.charAt(0).toUpperCase() + move.slice(1);
}

export const MoveLabel: React.FC<MoveLabelProps> = ({
  move,
  className,
  iconSize = 18,
  textClassName,
}) => {
  const textClasses = ["capitalize", textClassName].filter(Boolean).join(" ").trim();
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className ?? ""}`.trim()}>
      <MoveIcon move={move} size={iconSize} />
      <span className={textClasses}>{formatMove(move)}</span>
    </span>
  );
};

export const MoveVs: React.FC<{
  from: Move;
  to: Move;
  className?: string;
  iconSize?: number | string;
  separatorClassName?: string;
}> = ({ from, to, className, iconSize = 20, separatorClassName }) => {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`.trim()}>
      <MoveLabel move={from} iconSize={iconSize} />
      <span className={separatorClassName}>→</span>
      <MoveLabel move={to} iconSize={iconSize} />
    </span>
  );
};

export type MoveGlyph = React.ReactElement<MoveIconProps>;

export function renderMoveGlyph(move: Move, size?: number | string, className?: string) {
  return <MoveIcon move={move} size={size} className={className} />;
}
