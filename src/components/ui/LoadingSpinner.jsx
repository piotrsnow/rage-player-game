export default function LoadingSpinner({ size = 'md', text }) {
  const edge = { sm: 20, md: 32, lg: 120 }[size];
  const half = edge / 2;
  const dot = Math.round(edge * 0.14);

  const faces = [
    { rotate: 'rotateY(0deg)', dots: 1 },
    { rotate: 'rotateY(180deg)', dots: 6 },
    { rotate: 'rotateY(90deg)', dots: 2 },
    { rotate: 'rotateY(-90deg)', dots: 5 },
    { rotate: 'rotateX(90deg)', dots: 3 },
    { rotate: 'rotateX(-90deg)', dots: 4 },
  ];

  const dotPositions = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
  };

  return (
    <div className="flex flex-col items-center gap-16 select-none" aria-busy="true">
      <div
        className="dice-scene"
        style={{ width: edge, height: edge }}
      >
        <div className="dice-cube" style={{ width: edge, height: edge }}>
          {faces.map(({ rotate, dots }, i) => (
            <div
              key={i}
              className="dice-face"
              style={{ transform: `${rotate} translateZ(${half}px)`, width: edge, height: edge }}
            >
              {dotPositions[dots].map(([x, y], j) => (
                <span
                  key={j}
                  className="dice-dot"
                  style={{
                    width: dot,
                    height: dot,
                    left: `${x}%`,
                    top: `${y}%`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {text && (
        <p className="text-on-surface-variant text-xs uppercase tracking-widest font-label animate-shimmer pointer-events-none">
          {text}
        </p>
      )}
    </div>
  );
}
