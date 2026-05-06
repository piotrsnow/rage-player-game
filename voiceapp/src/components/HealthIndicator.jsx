import { useEffect, useState } from 'react';
import { api } from '../api';

export default function HealthIndicator() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const h = await api.getHealth();
        if (mounted) setHealth(h);
      } catch {
        if (mounted) setHealth(null);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (!health) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
        <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
        Server offline
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-[10px] font-label uppercase tracking-widest">
      <span className="flex items-center gap-1.5 text-on-surface-variant">
        <span className={`w-2 h-2 rounded-full ${health.modelLoaded ? 'bg-green-400' : 'bg-tertiary animate-pulse'}`} />
        {health.modelLoaded ? 'Model ready' : 'Loading model...'}
      </span>
      <span className={`${health.gpu ? 'text-green-400' : 'text-on-surface-variant'}`}>
        {health.gpu ? 'GPU' : 'CPU'}
      </span>
    </div>
  );
}
