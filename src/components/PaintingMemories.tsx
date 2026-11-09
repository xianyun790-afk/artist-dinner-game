import { BookOpen } from 'lucide-react';
import { paintingCatalog, type Painting } from '@/lib/paintings';
import type { Artist, PaintingMemory } from '@/lib/types';
import { FramedPainting } from './FramedPainting';

export function PaintingMemories({ memories, artists, onReplay }: {
  memories: PaintingMemory[]; artists: Artist[]; onReplay: (painting: Painting) => void;
}) {
  return <div className="painting-memories">
    {memories.length ? <div className="painting-memory-grid">{[...memories].reverse().map(memory => {
      const painting = paintingCatalog.find(p => p.id === memory.paintingId);
      if (!painting) return null;
      const speaker = artists.find(a => a.id === memory.speakerId);
      return <article className="painting-memory" key={memory.id}>
        <button className="painting-memory-preview" onClick={() => onReplay(painting)} aria-label={`重新看《${painting.title}》`}>
          <FramedPainting painting={painting}/>
        </button>
        <div className="painting-memory-copy"><h3>{painting.title}</h3><p>{painting.artist} · {painting.year}</p>
          <small>{new Date(memory.createdAt).toLocaleDateString('zh-CN')} · 第{memory.night}夜{!memory.explanation ? ' · 先看了画' : speaker ? ` · 和${speaker.name}聊过` : ''}</small>
          <details><summary>当时的对话</summary><p className="memory-question">你：{memory.question}</p><p>{memory.explanation || '这次先看了画，还没有开始讲解。'}</p></details>
        </div>
      </article>;
    })}</div> : <div className="painting-memory-empty"><BookOpen size={25} strokeWidth={1.2}/><p>听完一幅画，它会带着那段对话留在这里。</p></div>}
  </div>;
}
