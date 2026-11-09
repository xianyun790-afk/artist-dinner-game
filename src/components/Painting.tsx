import { useState } from 'react';
import { ArrowUpRight, Expand, X } from 'lucide-react';
import type { Painting } from '@/lib/paintings';

export function PaintingPeek({ painting, onOpen, onDismiss }: { painting: Painting; onOpen: () => void; onDismiss: () => void }) {
  const [failed, setFailed] = useState(false);
  return <aside className="painting-peek" aria-label="聊天中提到的画作">
    <button className="painting-open" onClick={onOpen} aria-label={`查看《${painting.title}》真实画作`}>
      {failed ? <span className="painting-image-failed">点击查看画作</span> : <img src={painting.image} alt={`${painting.artist}《${painting.title}》，${painting.year}年`} decoding="async" onError={() => setFailed(true)}/>}
      <span className="painting-peek-caption"><strong>《{painting.title}》</strong><span>{painting.year}<Expand size={12} aria-hidden="true"/></span></span>
    </button>
    <button className="painting-dismiss" onClick={onDismiss} aria-label="收起画作"><X size={13}/></button>
  </aside>;
}

export function PaintingView({ painting }: { painting: Painting }) {
  const [failed, setFailed] = useState(false);
  return <figure className="painting-view">
    {failed ? <div className="painting-unavailable" role="status"><p>画作暂时未能显示。</p><a href={painting.sourceUrl} target="_blank" rel="noreferrer">前往馆藏页面查看 <ArrowUpRight size={14}/></a></div> : <img src={painting.image} alt={`${painting.artist}《${painting.title}》，${painting.year}年，油画，${painting.museum}馆藏`} decoding="async" onError={() => setFailed(true)}/>}
    <figcaption><div><strong>{painting.artist}</strong><span>{painting.englishTitle} · {painting.year}</span></div><a href={painting.sourceUrl} target="_blank" rel="noreferrer">MoMA 馆藏资料 <ArrowUpRight size={13}/></a><small>真实作品数字图像 · 公版图像来源：<a href={painting.imageSourceUrl} target="_blank" rel="noreferrer">Wikimedia Commons / Google Arts & Culture</a></small></figcaption>
  </figure>;
}
