import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Painting } from '@/lib/paintings';
import { FramedPainting } from './FramedPainting';

export function PaintingScene({ painting, onLeave, subtitle, phase = 'viewing', onLoad, onError }: {
  painting: Painting; onLeave: () => void; subtitle: string | null;
  phase?: 'viewing' | 'framing' | 'filing' | 'replay'; onLoad?: () => void; onError?: () => void;
}) {
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
  return <section className={`painting-scene ${phase === 'framing' || phase === 'filing' ? 'is-framing' : ''} ${phase === 'filing' ? 'is-filing' : ''}`} data-painting-phase={phase} aria-label={`进入《${painting.title}》画中场景`}>
    <FramedPainting className="painting-object" painting={painting} onLoad={onLoad} onError={() => { setFailed(true); onError?.(); }}/>
    <button ref={leave} className="painting-leave" onClick={onLeave} aria-label="返回餐桌" title="返回餐桌（Esc）"><X size={21} strokeWidth={1.4}/></button>
    {subtitle&&!failed&&<><div className="painting-subtitle-shade" aria-hidden="true"/><div className="painting-subtitle" role="status" aria-label="艺术家字幕"><p>{subtitle}</p></div></>}
    {(phase === 'framing' || phase === 'filing') && <p className="painting-keepsake" role="status">{phase === 'filing' ? '已收入回忆' : '把这一刻，留在回忆里。'}</p>}
    {failed&&<p className="painting-scene-error" role="status">画作暂时未能加载，可以返回餐桌后再试。</p>}
  </section>;
}
