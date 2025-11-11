export function isValidHexColor(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim();
  return /^#([0-9a-fA-F]{6})$/.test(normalized);
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (isValidHexColor(value)) {
    return value.toUpperCase();
  }
  return fallback.toUpperCase();
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const normalized = hex.replace("#", "");
  const int = parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (value: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function mixComponent(a: number, b: number, weight: number): number {
  return a + (b - a) * weight;
}

export function mixHexColors(colorA: string, colorB: string, weight: number): string {
  const clampedWeight = Math.max(0, Math.min(1, weight));
  const rgbA = hexToRgb(colorA);
  const rgbB = hexToRgb(colorB);
  return rgbToHex({
    r: mixComponent(rgbA.r, rgbB.r, clampedWeight),
    g: mixComponent(rgbA.g, rgbB.g, clampedWeight),
    b: mixComponent(rgbA.b, rgbB.b, clampedWeight),
  });
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  const rLum = transform(r);
  const gLum = transform(g);
  const bLum = transform(b);
  return 0.2126 * rLum + 0.7152 * gLum + 0.0722 * bLum;
}

export function getReadableTextColor(hex: string, light = "#FFFFFF", dark = "#0F172A"): string {
  const luminance = relativeLuminance(hex);
  // WCAG recommended threshold ~0.179
  return luminance > 0.179 ? dark.toUpperCase() : light.toUpperCase();
}

export function lighten(color: string, amount: number): string {
  return mixHexColors(color, "#FFFFFF", amount);
}

export function darken(color: string, amount: number): string {
  return mixHexColors(color, "#000000", amount);
}
