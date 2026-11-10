export interface VoiceInputTiming {
  source: 'browser-asr';
  inputStartedAt: number;
  // Browser event estimates, not a measurement of microphone audio frames.
  inputEndedAt?: number;
  finalResultAt: number;
  submittedAt: number;
  endpointDelayMs: number;
}
export interface VoiceResult { isFinal: boolean; 0: { transcript: string } }
export interface VoiceResults { length: number; [index: number]: VoiceResult }

// Browser final results can be several pieces of a single user turn. Keep the
// full result snapshot (interim entries are revisions, not append-only tokens).
// A small grace period permits a continuation or self-correction before send.
export function createVoiceTurn(options: {
  onDraft: (text: string) => void;
  onSubmit: (text: string, timing: VoiceInputTiming) => void;
  now?: () => number;
  settleMs?: number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  unschedule?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? setTimeout;
  const unschedule = options.unschedule ?? clearTimeout;
  const settleMs = options.settleMs ?? 360;
  let prior = '', final = '', partial = '', startedAt: number | undefined;
  let endedAt: number | undefined, finalAt = 0, deadline = 0, closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) unschedule(timer); timer = undefined; };
  const submit = () => {
    clear();
    if (closed) return;
    const text = (prior + final).trim();
    if (!text) return;
    closed = true;
    const submittedAt = now();
    options.onDraft('');
    options.onSubmit(text.slice(0, 400), {
      source: 'browser-asr', inputStartedAt: startedAt ?? finalAt,
      ...(endedAt === undefined ? {} : { inputEndedAt: endedAt }),
      finalResultAt: finalAt, submittedAt,
      endpointDelayMs: Math.max(0, submittedAt - finalAt),
    });
  };
  const wait = () => {
    clear();
    if (closed || partial || !(prior + final).trim()) return;
    timer = schedule(submit, Math.max(0, deadline - now()));
  };
  return {
    speechStart(at = now()) {
      if (closed) return;
      startedAt ??= at; endedAt = undefined; clear();
    },
    speechEnd(at = now()) { if (!closed) endedAt = at; },
    results(results: VoiceResults, at = now()) {
      if (closed) return;
      startedAt ??= at;
      let nextFinal = '', nextPartial = '';
      for (let index = 0; index < results.length; index++) {
        const item = results[index];
        if (item.isFinal) nextFinal += item[0].transcript;
        else nextPartial += item[0].transcript;
      }
      if (nextFinal !== final) { finalAt = at; deadline = at + settleMs; }
      final = nextFinal; partial = nextPartial;
      options.onDraft((prior + final + partial).trim().slice(0, 400));
      wait();
    },
    sessionEnded() {
      if (closed) return;
      prior += final; final = ''; partial = '';
      options.onDraft(prior.trim().slice(0, 400));
      // Retain the remaining grace period across a browser's auto-end/restart.
      wait();
    },
    cancel() { closed = true; clear(); options.onDraft(''); },
    get hasText() { return !!(prior + final + partial).trim(); },
  };
}
