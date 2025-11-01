import { BOOT_ROUTE, MODES_ROUTE } from "./routes";

const DEFAULT_POST_AUTH_PATH = MODES_ROUTE;

function normalizePath(input: unknown): string {
  if (typeof input !== "string") {
    return DEFAULT_POST_AUTH_PATH;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return DEFAULT_POST_AUTH_PATH;
  }
  if (trimmed.startsWith("/")) {
    return trimmed === BOOT_ROUTE ? MODES_ROUTE : trimmed;
  }
  const normalized = `/${trimmed}`;
  return normalized === BOOT_ROUTE ? MODES_ROUTE : normalized;
}

const rawPostAuthPath = import.meta.env.VITE_POST_AUTH_PATH;
export const POST_AUTH_PATH = normalizePath(rawPostAuthPath);

export function getPostAuthPath(): string {
  return POST_AUTH_PATH;
}

export const DEPLOY_ENV = import.meta.env.VITE_DEPLOY_ENV ?? "local";
