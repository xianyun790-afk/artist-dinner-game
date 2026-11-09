import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Painting } from '@/lib/paintings';

export function PaintingScene({ painting, onLeave }: { painting: Painting; onLeave: () => void }) {
  const leave = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    leave.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onLeave(); }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      const target = previous?.isConnected && previous.closest('main') ? previous : document.querySelector<HTMLElement>('.room-type input, .speak-button');
      target?.focus({ preventScroll: true });
    };
  }, [onLeave]);
  return <section className="painting-scene" aria-label={`进入《${painting.title}》画中场景`}>
    <img className="painting-world" src={painting.image} alt={`${painting.artist}《${painting.title}》，${painting.year}年，${painting.museum}馆藏`} onError={() => setFailed(true)}/>
    <button ref={leave} className="painting-leave" onClick={onLeave} aria-label="返回餐桌" title="返回餐桌（Esc）"><X size={21} strokeWidth={1.4}/></button>
    {failed&&<p className="painting-scene-error" role="status">画作暂时未能加载，可以返回餐桌后再试。</p>}
  </section>;
}
