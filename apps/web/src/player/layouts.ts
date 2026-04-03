import type { LayoutType } from "@tv-dash/shared";

export interface LayoutDefinition {
  type: LayoutType;
  label: string;
  description: string;
  tileCount: number;
  containerClassName: string;
  tileClassNames: string[];
}

export const layoutDefinitions: LayoutDefinition[] = [
  {
    type: "LAYOUT_1X1",
    label: "1x1",
    description: "Single-channel focus",
    tileCount: 1,
    containerClassName: "grid-cols-1",
    tileClassNames: ["min-h-[300px] sm:min-h-[360px] xl:min-h-[58vh] 2xl:min-h-[64vh]"],
  },
  {
    type: "LAYOUT_2X2",
    label: "2x2",
    description: "Quad wall",
    tileCount: 4,
    containerClassName: "grid-cols-1 sm:grid-cols-2",
    tileClassNames: Array.from({ length: 4 }, () => "min-h-[220px] sm:min-h-[260px] 2xl:min-h-[320px]"),
  },
  {
    type: "LAYOUT_3X3",
    label: "3x3",
    description: "Nine-up monitor wall",
    tileCount: 9,
    containerClassName: "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3",
    tileClassNames: Array.from({ length: 9 }, () => "min-h-[180px] sm:min-h-[210px] 2xl:min-h-[240px]"),
  },
  {
    type: "LAYOUT_FOCUS_1_2",
    label: "1+2",
    description: "One large with two small",
    tileCount: 3,
    containerClassName: "grid-cols-1 md:grid-cols-2 xl:auto-rows-[220px] xl:grid-cols-3",
    tileClassNames: [
      "md:col-span-2 xl:col-span-2 min-h-[280px] sm:min-h-[340px] xl:min-h-[460px]",
      "min-h-[180px] sm:min-h-[220px]",
      "min-h-[180px] sm:min-h-[220px]",
    ],
  },
  {
    type: "LAYOUT_FOCUS_1_4",
    label: "1+4",
    description: "One large with four small",
    tileCount: 5,
    containerClassName: "grid-cols-1 sm:grid-cols-2 2xl:auto-rows-[200px] 2xl:grid-cols-4",
    tileClassNames: [
      "sm:col-span-2 2xl:col-span-2 2xl:row-span-2 min-h-[300px] sm:min-h-[380px] 2xl:min-h-[420px]",
      "min-h-[180px] sm:min-h-[200px]",
      "min-h-[180px] sm:min-h-[200px]",
      "min-h-[180px] sm:min-h-[200px]",
      "min-h-[180px] sm:min-h-[200px]",
    ],
  },
];

export function getLayoutDefinition(type: LayoutType) {
  return layoutDefinitions.find((layout) => layout.type === type) ?? layoutDefinitions[1];
}
