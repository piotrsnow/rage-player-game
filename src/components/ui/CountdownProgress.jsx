import { useState, useEffect } from 'react';

const sizes = {
  sm: { svgSize: 64, strokeWidth: 4, fontSize: 'text-sm' },
  md: { svgSize: 96, strokeWidth: 5, fontSize: 'text-xl' },
  lg: { svgSize: 128, strokeWidth: 6, fontSize: 'text-3xl' },
};

export default function CountdownProgress({ durationSeconds = 120, label, size = 'lg' }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [durationSeconds]);

  const percent = Math.min(Math.floor((elapsed / durationSeconds) * 100), 99);
  const progress = Math.min(elapsed / durationSeconds, 0.99);
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  const { svgSize, strokeWidth, fontSize } = sizes[size] || sizes.lg;
  const radius = (svgSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="transform -rotate-90"
        >
          {/* Track */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-primary/15"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-primary"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 1s linear',
              filter: 'drop-shadow(0 0 6px rgba(197, 154, 255, 0.5))',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center tabular-nums">
          <span
            className={`${fontSize} font-bold text-on-surface leading-none`}
            style={{ textShadow: '0 0 8px rgba(197, 154, 255, 0.3)' }}
          >
            {percent}%
          </span>
          <span className="text-on-surface-variant/70 text-[10px] mt-1 font-label tracking-wider">
            {elapsedLabel}
          </span>
        </div>
      </div>
      {label && (
        <p className="text-on-surface-variant text-xs uppercase tracking-widest font-label animate-shimmer">
          {label}
        </p>
      )}
    </div>
  );
}
