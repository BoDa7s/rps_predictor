const LEGACY_HOSTNAME = "rps-predictor.pages.dev";
const OFFICIAL_ORIGIN = "https://www.rps-predictor.com";
const PREVIEW_HOSTNAME_SUFFIX = ".rps-predictor.pages.dev";
const REDIRECT_TEST_PARAM = "testRedirect";
const REDIRECT_TEST_VALUE = "1";

type LocationLike = Pick<Location, "hostname" | "pathname" | "search" | "hash">;

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function isPreviewPagesHostname(hostname: string): boolean {
  return hostname.endsWith(PREVIEW_HOSTNAME_SUFFIX) && hostname !== LEGACY_HOSTNAME;
}

function hasPreviewRedirectFlag(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get(REDIRECT_TEST_PARAM) === REDIRECT_TEST_VALUE;
}

function getSanitizedSearch(search: string): string {
  const params = new URLSearchParams(search);
  const next = new URLSearchParams();

  params.forEach((value, key) => {
    if (key === REDIRECT_TEST_PARAM && value === REDIRECT_TEST_VALUE) {
      return;
    }
    next.append(key, value);
  });

  const serialized = next.toString();
  return serialized ? `?${serialized}` : "";
}

export function shouldRedirectToOfficialSite(locationLike: LocationLike): boolean {
  const hostname = locationLike.hostname.toLowerCase();
  if (hostname === LEGACY_HOSTNAME) {
    return true;
  }

  return isPreviewPagesHostname(hostname) && hasPreviewRedirectFlag(locationLike.search);
}

export function getOfficialSiteRedirectUrl(locationLike: LocationLike): string {
  const pathname = normalizePathname(locationLike.pathname);
  const search = getSanitizedSearch(locationLike.search);
  return `${OFFICIAL_ORIGIN}${pathname}${search}${locationLike.hash}`;
}

export const officialSiteRedirectConfig = {
  legacyHostname: LEGACY_HOSTNAME,
  previewHostnameSuffix: PREVIEW_HOSTNAME_SUFFIX,
  redirectTestParam: REDIRECT_TEST_PARAM,
  officialOrigin: OFFICIAL_ORIGIN,
  delayMs: 5000, // 5 seconds
};
