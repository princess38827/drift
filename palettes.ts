export type Ink = readonly [number, number, number];

export type Palette = {
  id: string;
  name: string;
  background: string;
  backgroundRgb: Ink;
  inks: readonly Ink[];
  blend: GlobalCompositeOperation;
  alpha: number;
  glow: boolean;
  lineWidth: number;
};

export const PALETTES: readonly Palette[] = [
  {
    id: "ember",
    name: "Ember",
    background: "#07060a",
    backgroundRgb: [7, 6, 10],
    inks: [
      [255, 186, 96],
      [255, 96, 64],
      [255, 228, 196],
      [214, 112, 150],
    ],
    blend: "lighter",
    alpha: 0.1,
    glow: true,
    lineWidth: 1.15,
  },
  {
    id: "tide",
    name: "Tide",
    background: "#04141a",
    backgroundRgb: [4, 20, 26],
    inks: [
      [126, 230, 214],
      [64, 168, 220],
      [236, 248, 242],
      [92, 124, 214],
    ],
    blend: "lighter",
    alpha: 0.1,
    glow: true,
    lineWidth: 1.15,
  },
  {
    id: "ink",
    name: "Ink",
    background: "#f4efe6",
    backgroundRgb: [244, 239, 230],
    inks: [
      [28, 32, 44],
      [36, 74, 96],
      [122, 42, 38],
      [72, 62, 48],
    ],
    blend: "source-over",
    alpha: 0.42,
    glow: false,
    lineWidth: 1.2,
  },
  {
    id: "nocturne",
    name: "Nocturne",
    background: "#060710",
    backgroundRgb: [6, 7, 16],
    inks: [
      [186, 204, 255],
      [124, 146, 230],
      [255, 252, 246],
      [150, 176, 214],
    ],
    blend: "lighter",
    alpha: 0.1,
    glow: true,
    lineWidth: 1.1,
  },
  {
    id: "vesper",
    name: "Vesper",
    background: "#10080c",
    backgroundRgb: [16, 8, 12],
    inks: [
      [236, 176, 96],
      [186, 64, 86],
      [240, 224, 206],
      [164, 112, 132],
    ],
    blend: "lighter",
    alpha: 0.1,
    glow: true,
    lineWidth: 1.15,
  },
  {
    id: "moss",
    name: "Moss",
    background: "#0b100c",
    backgroundRgb: [11, 16, 12],
    inks: [
      [176, 214, 120],
      [78, 168, 122],
      [232, 220, 164],
      [64, 150, 140],
    ],
    blend: "lighter",
    alpha: 0.1,
    glow: true,
    lineWidth: 1.15,
  },
];

export function getPalette(id: string): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}

export function inkCss(ink: Ink, alpha: number): string {
  return `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, ${alpha})`;
}
