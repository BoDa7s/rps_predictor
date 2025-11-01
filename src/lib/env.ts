const DEFAULT_POST_AUTH_PATH = "/boot";

function normalizePath(input: unknown): string {
  if (typeof input !== "string") {
    return DEFAULT_POST_AUTH_PATH;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return DEFAULT_POST_AUTH_PATH;
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash =
    withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;

  if (
    withoutTrailingSlash === "/" ||
    withoutTrailingSlash === "" ||
    withoutTrailingSlash === DEFAULT_POST_AUTH_PATH
  ) {
    return DEFAULT_POST_AUTH_PATH;
  }

  return withoutTrailingSlash;
}

const rawPostAuthPath = import.meta.env.VITE_POST_AUTH_PATH;
export const POST_AUTH_PATH = normalizePath(rawPostAuthPath);

export function getPostAuthPath(): string {
  return POST_AUTH_PATH;
}

export const DEPLOY_ENV = import.meta.env.VITE_DEPLOY_ENV ?? "local";
