import type { CSSProperties } from 'react';
import type { Painting } from '@/lib/paintings';

export function FramedPainting({ painting, className = '', onLoad, onError }: {
  painting: Painting; className?: string; onLoad?: () => void; onError?: () => void;
}) {
  return <div className={`framed-art ${className}`} style={{ '--art-ratio': painting.width / painting.height } as CSSProperties}>
    <img src={painting.image} alt={`${painting.artist}《${painting.title}》，${painting.year}年`} onLoad={onLoad} onError={onError}/>
  </div>;
}
