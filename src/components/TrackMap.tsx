import { createProjector, type Outline } from "@/lib/track";

export interface TrackCar {
  number: number;
  code: string;
  colour: string;
  x: number;
  y: number;
  /** Leader or selected car: drawn larger with a label box. */
  highlight?: boolean;
}

// Glowing circuit outline, optionally with cars on it. Pure SVG, so it renders
// on the server for static maps and on the client for the live one.
export function TrackMap({
  outline,
  cars = [],
  showCorners = true,
  className = "",
}: {
  outline: Outline;
  cars?: TrackCar[];
  showCorners?: boolean;
  className?: string;
}) {
  const { width, height, path, project } = createProjector(outline);
  const [startX, startY] = project(outline.x[0], outline.y[0]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} fill="none" className={className} role="img" aria-label="Circuit map">
      <path d={path} stroke="#1c2029" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={path}
        stroke="#2ee66b"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 8px rgba(41,227,105,0.55))" }}
      />

      {showCorners &&
        outline.corners.map((corner) => {
          const [x, y] = project(corner.x, corner.y);
          return (
            <text
              key={corner.number}
              x={x}
              y={y - 16}
              textAnchor="middle"
              fill="#bbcbb8"
              className="font-mono text-[11px] font-bold"
            >
              {corner.number}
            </text>
          );
        })}

      <circle cx={startX} cy={startY} r="7" fill="#ffffff" stroke="#0d0e11" strokeWidth="2" />
      <text x={startX} y={startY + 26} textAnchor="middle" fill="#ffffff" className="font-mono text-[11px] font-bold">
        S/F
      </text>

      {cars.map((car) => {
        const [x, y] = project(car.x, car.y);
        return (
          <g key={car.number} style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 500ms linear" }}>
            {car.highlight && <circle r="14" fill={car.colour} fillOpacity="0.3" className="animate-ping" />}
            <circle r={car.highlight ? 8 : 6} fill={car.colour} stroke="#ffffff" strokeWidth={car.highlight ? 2 : 1} />
            {car.highlight && (
              <rect x="11" y="-10" width="38" height="19" rx="2" fill="#121316" stroke={car.colour} strokeWidth="1" />
            )}
            <text x="15" y="4" fill="#ffffff" className="font-mono text-[11px] font-bold">
              {car.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
