import { paintingFromPlayer, paintingFromReply, type Painting } from './paintings.ts';
import type { PaintingMemory } from './types';

export type PaintingJourneyPhase = 'viewing' | 'framing' | 'filing' | 'replay';
export interface PaintingJourneyState {
  painting: Painting | null;
  suppressed: boolean;
  phase: PaintingJourneyPhase;
  token: string | null;
  finishing: boolean;
}
export interface PaintingExplanation {
  speakerId: string;
  question: string;
  explanation: string;
  night: number;
}
export const initialPaintingJourney = (): PaintingJourneyState => ({ painting: null, suppressed: false, phase: 'viewing', token: null, finishing: false });
export const PAINTING_JOURNEY_TIMING = { hold: 500, frame: 1800, file: 700 } as const;
interface JourneyTimers {
  set: (callback: () => void, delay: number) => unknown;
  clear: (timer: unknown) => void;
}
const defaultTimers: JourneyTimers = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** A single encounter owns every delayed transition, including image loading. */
export function createPaintingJourney(options: {
  onState?: (state: PaintingJourneyState) => void;
  onArchive: (memory: PaintingMemory) => void;
  timers?: JourneyTimers;
  now?: () => Date;
}) {
  let state = initialPaintingJourney();
  let revision = 0;
  let pending: PaintingMemory | null = null;
  let disposed = false;
  const loaded = new Set<string>(), failed = new Set<string>();
  const timers = options.timers ?? defaultTimers, scheduled = new Set<unknown>();
  const publish = () => options.onState?.(state);
  const clear = () => { revision++; for (const timer of scheduled) timers.clear(timer); scheduled.clear(); pending = null; };
  const current = (token: string, version: number) => !disposed && state.token === token && revision === version;
  const later = (callback: () => void, delay: number, token: string, version: number) => {
    const timer = timers.set(() => { scheduled.delete(timer); if (current(token, version)) callback(); }, delay);
    scheduled.add(timer);
  };
  const close = () => {
    clear(); state = { painting: null, suppressed: true, phase: 'viewing', token: null, finishing: false }; publish();
  };
  const startFinish = () => {
    if (!pending || !state.painting || !state.token || state.phase !== 'viewing' || !loaded.has(state.painting.id) || failed.has(state.painting.id)) return;
    // Only one hold can be scheduled even if a cached image emits another load.
    if (scheduled.size) return;
    const token = state.token, version = revision, memory = pending;
    later(() => {
      state = { ...state, phase: 'framing' }; publish();
      later(() => {
        // Consume before notifying the caller, so a reentrant callback cannot
        // archive this encounter for a second time.
        pending = null;
        state = { ...state, phase: 'filing' };
        options.onArchive(memory);
        if (!current(token, version)) return;
        publish();
        later(close, PAINTING_JOURNEY_TIMING.file, token, version);
      }, PAINTING_JOURNEY_TIMING.frame, token, version);
    }, PAINTING_JOURNEY_TIMING.hold, token, version);
  };
  return {
    get state() { return state; },
    begin(token: string, text: string) {
      if (disposed) return;
      clear(); const next = paintingFromPlayer(state, text);
      state = { painting: next.painting, suppressed: next.suppressed, phase: 'viewing', token, finishing: false }; publish();
    },
    notice(token: string, text: string) {
      if (disposed || !token || token !== state.token || state.phase !== 'viewing') return;
      const next = paintingFromReply(state, text);
      if (next.painting === state.painting && next.suppressed === state.suppressed) return;
      state = { ...state, painting: next.painting, suppressed: next.suppressed }; publish();
    },
    finish(token: string, explanation: PaintingExplanation, completed: boolean) {
      if (disposed || !token || token !== state.token || state.phase !== 'viewing' || pending || !completed || !state.painting || state.suppressed || failed.has(state.painting.id)) return;
      if (!explanation.speakerId.trim() || !explanation.question.trim() || !explanation.explanation.trim() || !Number.isSafeInteger(explanation.night) || explanation.night < 1) return;
      pending = { id: token, paintingId: state.painting.id, ...explanation, createdAt: (options.now?.() ?? new Date()).toISOString() };
      state = { ...state, finishing: true }; publish();
      startFinish();
    },
    cancel() {
      if (disposed) return;
      clear(); state = { ...state, token: null, finishing: false, phase: state.phase === 'replay' ? 'replay' : 'viewing' }; publish();
    },
    leave() { if (!disposed) close(); },
    loaded(paintingId: string) {
      if (disposed || state.painting?.id !== paintingId) return;
      failed.delete(paintingId); loaded.add(paintingId); startFinish();
    },
    failed(paintingId: string) {
      if (disposed || state.painting?.id !== paintingId) return;
      failed.add(paintingId); loaded.delete(paintingId); clear();
      state = { ...state, finishing: false, phase: state.phase === 'replay' ? 'replay' : 'viewing' }; publish();
    },
    replay(painting: Painting) {
      if (disposed) return;
      clear(); state = { painting, suppressed: false, phase: 'replay', token: null, finishing: false }; publish();
    },
    dispose() { clear(); disposed = true; },
  };
}
