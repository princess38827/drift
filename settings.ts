import { getPalette } from "@/lib/flow/palettes";

export type Settings = {
  speed: number;
  trail: number;
  scale: number;
  paletteId: string;
  seed: number;
  paused: boolean;
};

export const STORAGE_KEY = "drift-settings-v1";

export const DEFAULT_SETTINGS: Settings = {
  speed: 0.46,
  trail: 0.68,
  scale: 0.36,
  paletteId: "ember",
  seed: 0xc0ffee,
  paused: false,
};

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

export function formatSeed(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase();
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? (Math.random() * 0xffffffff) >>> 0;
}

export function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const paletteId =
      typeof parsed.paletteId === "string" && getPalette(parsed.paletteId).id === parsed.paletteId
        ? parsed.paletteId
        : DEFAULT_SETTINGS.paletteId;
    const seed =
      typeof parsed.seed === "number" && Number.isFinite(parsed.seed)
        ? parsed.seed >>> 0
        : DEFAULT_SETTINGS.seed;
    return {
      speed: clamp01(parsed.speed, DEFAULT_SETTINGS.speed),
      trail: clamp01(parsed.trail, DEFAULT_SETTINGS.trail),
      scale: clamp01(parsed.scale, DEFAULT_SETTINGS.scale),
      paletteId,
      seed,
      paused: false,
    };
  } catch {
    return null;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    const { paused: _paused, ...rest } = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // Private mode / quota — the field still runs.
  }
}

export function speedWord(speed: number): string {
  if (speed < 0.2) return "Drift";
  if (speed < 0.4) return "Glide";
  if (speed < 0.62) return "Flow";
  if (speed < 0.82) return "Rush";
  return "Surge";
}

export function trailWord(trail: number): string {
  if (trail < 0.2) return "Short";
  if (trail < 0.4) return "Soft";
  if (trail < 0.62) return "Long";
  if (trail < 0.82) return "Silk";
  return "Exposure";
}

export function fieldWord(scale: number): string {
  if (scale < 0.2) return "Broad";
  if (scale < 0.4) return "Open";
  if (scale < 0.62) return "Medium";
  if (scale < 0.82) return "Tight";
  return "Fine";
}
