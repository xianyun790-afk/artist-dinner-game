// Prepare up to two sentences ahead, but keep one interruptible audio channel.
export function createSpeechQueue<T>(options: {
  signal: AbortSignal;
  prepare: (text: string, signal: AbortSignal) => Promise<T>;
  play: (audio: T, text: string, signal: AbortSignal) => Promise<void>;
  waiting?: () => void;
}) {
  const { signal } = options;
  type Job = { text: string; ready: Promise<{ value: T } | { error: unknown }> };
  const jobs: Job[] = [];
  let ended = false, active = 0, wake: (() => void) | undefined;
  const slots: (() => void)[] = [];
  const cancelled = new Promise<null>(resolve => {
    if (signal.aborted) resolve(null);
    else signal.addEventListener('abort', () => { resolve(null); wake?.(); }, { once: true });
  });
  async function prepare(text: string) {
    if (active >= 2) await Promise.race([new Promise<void>(resolve => slots.push(resolve)), cancelled]);
    if (signal.aborted) throw new DOMException('已停止', 'AbortError');
    active++;
    try { return await options.prepare(text, signal); }
    finally { active--; slots.shift()?.(); }
  }
  const done = (async () => {
    while (!signal.aborted) {
      const job = jobs.shift();
      if (!job) {
        if (ended) break;
        await Promise.race([new Promise<void>(resolve => { wake = resolve; }), cancelled]);
        wake = undefined; continue;
      }
      options.waiting?.();
      const result = await Promise.race([job.ready, cancelled]);
      if (!result || signal.aborted) break;
      if ('error' in result) throw result.error;
      await Promise.race([options.play(result.value, job.text, signal), cancelled]);
    }
  })();
  return {
    push(text: string) {
      if (ended || signal.aborted || !text.trim()) return;
      jobs.push({ text: text.trim(), ready: prepare(text.trim()).then(value => ({ value }), error => ({ error })) });
      wake?.();
    },
    end() { ended = true; wake?.(); },
    done,
  };
}

// Prefer a natural clause of 12–48 characters, rather than synthesizing tokens.
// Short replies still flush immediately when the model finishes.
export function speechParts(text: string, final = false): { parts: string[]; rest: string } {
  const parts: string[] = [];
  let rest = text;
  while (rest.length) {
    const boundary = /[。！？!?；;\n]/g;
    let cut = 0, match: RegExpExecArray | null;
    while ((match = boundary.exec(rest))) {
      const end = match.index + match[0].length;
      if (end > 48) break;
      if (end >= 12 || final && end === rest.length) { cut = end; break; }
    }
    if (!cut && rest.length >= 48) {
      const window = rest.slice(12, 48);
      const comma = Math.max(window.lastIndexOf('，'), window.lastIndexOf(','), window.lastIndexOf('、'));
      cut = comma >= 0 ? 13 + comma : 48;
    }
    if (!cut) { if (final) { parts.push(rest); rest = ''; } break; }
    // Keep closing quotes attached when they are already available.
    while (/[”’」』）)]/.test(rest[cut] ?? '') && cut < rest.length) cut++;
    parts.push(rest.slice(0, cut)); rest = rest.slice(cut);
  }
  return { parts, rest };
}
