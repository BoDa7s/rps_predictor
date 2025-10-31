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
      d="M22 14.5 31.8 8.6 40.7 9l4.5 3.6-2.9 4.9 4.2 2.8 3.5 4.6-4.1 2.2 6.1 5.7 2 6-3.8 11-7.6 7.3-10.8 4-10-3.3-6.5-9.6-1.1-8.7 3.6-7.9 5.2-3.7 2.8-6.4Z"
      fill="#475569"
      stroke="#0f172a"
      strokeWidth={3}
      strokeLinejoin="round"
    />
    <path
      d="M28.8 18.3 36.6 16l6.5 5.7 1.7 8.4-3.7 8.6-8.7 6.1-9.2-2.5-4.6-7.6.8-7.3 8.4-8.1Z"
      fill="#5c6676"
      stroke="#0f172a"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <path
      d="M27.5 25.8c2-2.4 5.2-3.5 8.4-2.6 3.2.9 5.6 3.5 6.3 6.6"
      stroke="#e2e8f0"
      strokeWidth={2.2}
      strokeLinecap="round"
    />
  </>
);

const PaperShape = (
  <>
    <path
      d="M18.5 8.5h22.5l9 9v35H18.5V8.5Z"
      fill="#f8fafc"
      stroke="#0f172a"
      strokeWidth={3}
      strokeLinejoin="round"
    />
    <path
      d="M41 8.5v9h9"
      fill="none"
      stroke="#94a3b8"
      strokeWidth={2.2}
      strokeLinejoin="round"
    />
    <path
      d="M24 26h19M24 33.5h19M24 41h15"
      stroke="#cbd5f5"
      strokeWidth={2.2}
      strokeLinecap="round"
    />
  </>
);

const ScissorsShape = (
  <>
    <path
      d="M32 28 18.2 12.8l7.2-5.7 16.4 13Z"
      fill="#bae6fd"
      stroke="#0f172a"
      strokeWidth={3}
      strokeLinejoin="round"
    />
    <path
      d="M32 28 50.8 13.8 55.5 20l-19 12Z"
      fill="#38bdf8"
      stroke="#0f172a"
      strokeWidth={3}
      strokeLinejoin="round"
    />
    <path
      d="M32 32 24 39.5"
      stroke="#0f172a"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M32 32l8 7.5"
      stroke="#0f172a"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx={22} cy={44} r={8.5} fill="#fbbf24" stroke="#0f172a" strokeWidth={3} />
    <circle cx={42} cy={44} r={8.5} fill="#fbbf24" stroke="#0f172a" strokeWidth={3} />
    <circle cx={32} cy={28} r={2.6} fill="#0f172a" />
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
