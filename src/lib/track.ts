// Circuit outline geometry, shared by server and client. Coordinates are in the
// same space as OpenF1's `location` endpoint, so live car positions can be
// projected onto the outline with the same projector.

export interface Outline {
  x: number[];
  y: number[];
  corners: { number: number; x: number; y: number }[];
  /** Degrees to rotate the raw coordinates for the conventional map orientation. */
  rotation: number;
}

export interface Projector {
  width: number;
  height: number;
  /** SVG path for the closed circuit outline. */
  path: string;
  project: (x: number, y: number) => [number, number];
}

export function createProjector(outline: Outline, width = 800, height = 620, pad = 48): Projector {
  const rad = (outline.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotate = (x: number, y: number): [number, number] => [x * cos - y * sin, x * sin + y * cos];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const rotated = outline.x.map((x, i) => {
    const p = rotate(x, outline.y[i]);
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
    return p;
  });

  const scale = Math.min((width - 2 * pad) / (maxX - minX || 1), (height - 2 * pad) / (maxY - minY || 1));
  const offX = (width - (maxX - minX) * scale) / 2;
  const offY = (height - (maxY - minY) * scale) / 2;
  // SVG's y axis points down; the track's points up.
  const place = ([rx, ry]: [number, number]): [number, number] => [
    offX + (rx - minX) * scale,
    height - (offY + (ry - minY) * scale),
  ];

  const path =
    rotated
      .map((p, i) => {
        const [sx, sy] = place(p);
        return `${i ? "L" : "M"}${sx.toFixed(1)} ${sy.toFixed(1)}`;
      })
      .join(" ") + " Z";

  return { width, height, path, project: (x, y) => place(rotate(x, y)) };
}
