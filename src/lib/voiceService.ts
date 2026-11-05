export const providerNames = { minimax: 'MiniMax', volcengine: '火山引擎', aliyun: '阿里云', sensetime: '商汤 V4', sensetimev5: '商汤 V5' };
export type ProviderId = keyof typeof providerNames;
export interface ServiceVoice { provider: ProviderId; model: string; voice: string }
export interface VoiceEntry { id: string; name: string; model?: string; library?: boolean }
export interface VoiceModel { id: string; name: string; voices?: VoiceEntry[] }
export interface VoiceProvider { id: ProviderId; name: string; defaultModel: string; defaultVoice: string; models: VoiceModel[]; voices: VoiceEntry[]; library: VoiceEntry[] }
export interface VoiceCatalog { providers: VoiceProvider[]; libraryUnavailable: boolean }
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === 'string' ? v.trim().slice(0, 250) : '';
const entries = (v: unknown): VoiceEntry[] => Array.isArray(v) ? v.flatMap(item => {
  const row = record(item), id = text(row.id);
  return id ? [{ id, name: text(row.name) || id }] : [];
}) : [];

// Keep displayable voice metadata only. Credentials and collaboration history
// are never copied into the game or its save files.
export function parseVoiceCatalog(config: unknown, library: unknown, libraryUnavailable = false): VoiceCatalog {
  const source = record(record(config).providers), rows = record(library).voices;
  const providers: VoiceProvider[] = [];
  for (const id of Object.keys(providerNames) as ProviderId[]) {
    const p = record(source[id]);
    if (p.ready !== true) continue;
    const models: VoiceModel[] = Array.isArray(p.models) ? p.models.flatMap(item => {
      const row = record(item), modelId = typeof item === 'string' ? item : text(row.id);
      return modelId ? [{ id: modelId, name: text(row.name) || modelId, ...(Array.isArray(row.voices) ? { voices: entries(row.voices) } : {}) }] : [];
    }) : [];
    const defaultModel = text(p.defaultModel);
    if (defaultModel && !models.some(m => m.id === defaultModel)) models.unshift({ id: defaultModel, name: defaultModel });
    if (!models.length) continue;
    const saved: VoiceEntry[] = Array.isArray(rows) ? rows.flatMap(item => {
      const row = record(item), voice = text(row.voice), model = text(row.model);
      return row.provider === id && voice && (!model || models.some(m => m.id === model))
        ? [{ id: voice, name: text(row.label) || voice, model, library: true }] : [];
    }) : [];
    providers.push({ id, name: providerNames[id], models, defaultModel: defaultModel || models[0].id, defaultVoice: text(p.defaultVoice), voices: entries(p.voices), library: saved });
  }
  return { providers, libraryUnavailable };
}

export function voicesForModel(p: VoiceProvider, model: string): VoiceEntry[] {
  const configured = p.models.find(m => m.id === model);
  if (!configured) return [];
  const voices = new Map((configured.voices ?? p.voices).map(v => [v.id, v]));
  for (const v of p.library) if (!v.model || v.model === model) voices.set(v.id, v);
  return [...voices.values()];
}

export function validateServiceVoice(choice: ServiceVoice, catalog: VoiceCatalog): boolean {
  const provider = catalog.providers.find(p => p.id === choice.provider);
  return !!provider && voicesForModel(provider, choice.model).some(v => v.id === choice.voice);
}

const suggested: Record<string, string> = {
  monet: 'Chinese (Mandarin)_Gentleman', vincent: 'Chinese (Mandarin)_Sincere_Adult',
  dali: 'Chinese (Mandarin)_Radio_Host', georgia: 'Chinese (Mandarin)_Wise_Women', lin: 'Chinese (Mandarin)_Gentle_Senior',
};
export function defaultServiceVoice(artistId: string, catalog: VoiceCatalog): ServiceVoice | undefined {
  const preferred = catalog.providers.find(p => p.id === 'minimax');
  if (preferred && suggested[artistId]) {
    const model = preferred.models.some(m => m.id === 'speech-2.8-turbo') ? 'speech-2.8-turbo' : preferred.defaultModel;
    const choice = { provider: preferred.id, model, voice: suggested[artistId] };
    if (validateServiceVoice(choice, catalog)) return choice;
  }
  // Custom artists start from the service's declared default, never the
  // voice assigned to the visual template they selected.
  for (const p of catalog.providers) {
    const model = p.defaultModel, options = voicesForModel(p, model);
    const voice = options.find(v => v.id === p.defaultVoice) ?? options[0];
    if (voice) return { provider: p.id, model, voice: voice.id };
  }
}

export function serviceUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('音色服务地址需为 HTTP(S) 地址。');
  return url.href.replace(/\/+$/, '');
}
async function jsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`音色服务请求失败（${response.status}）。`);
  const data = await response.json();
  if (record(data).ok === false) throw new Error('音色服务未能完成这次请求。');
  return data;
}
export async function loadVoiceCatalog(base: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<VoiceCatalog> {
  const root = serviceUrl(base);
  const config = await jsonResponse(await fetcher(`${root}/api/config`, { signal, cache: 'no-store', credentials: 'omit' }));
  let library: unknown = {}, libraryUnavailable = false;
  try { library = await jsonResponse(await fetcher(`${root}/api/library`, { signal, cache: 'no-store', credentials: 'omit' })); }
  catch (e) { if (signal.aborted) throw e; libraryUnavailable = true; }
  const catalog = parseVoiceCatalog(config, library, libraryUnavailable);
  if (!catalog.providers.length) throw new Error('音色服务尚无可用平台。');
  return catalog;
}

const bounded = (v: number, low: number, high: number, fallback = 1) => Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : fallback;
export function synthesisBody(choice: ServiceVoice, line: string, rate: number, pitch: number) {
  const content = line.trim();
  if (!content || content.length > 1000) throw new Error('这段朗读需要 1～1000 字。');
  const speed = bounded(rate, .65, 1.25), tune = Math.round((bounded(pitch, .7, 1.3) - 1) * 10);
  let options: Record<string, unknown>;
  switch (choice.provider) {
    case 'minimax': options = { speed, vol: 1, pitch: tune, format: 'mp3', sampleRate: 32000, bitrate: 128000, languageBoost: 'Chinese', outputFormat: 'hex' }; break;
    case 'volcengine': options = { apiVersion: 'v3', v3Model: choice.model, speed: Math.round((speed - 1) * 100), vol: 0, pitch: tune, format: 'mp3', sampleRate: 24000 }; break;
    case 'aliyun': options = /^cosyvoice/i.test(choice.model) ? { rate: speed, pitch: bounded(pitch, .7, 1.3), volume: 50, format: 'mp3', sampleRate: 22050 } : { languageType: 'Chinese' }; break;
    case 'sensetime': case 'sensetimev5': options = { speed, volume: 0, pitch: tune, format: 'mp3', sampleRate: 24000, language: 'zh' }; break;
    default: throw new Error('不支持这个语音平台。');
  }
  return { provider: choice.provider, model: choice.model, voice: choice.voice, text: content, options };
}
export async function synthesizeVoice(base: string, choice: ServiceVoice, line: string, rate: number, pitch: number, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  const response = await jsonResponse(await fetcher(`${serviceUrl(base)}/api/tts`, {
    method: 'POST', signal, credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Client-Name': 'Afterglow' },
    body: JSON.stringify(synthesisBody(choice, line, rate, pitch)),
  }));
  const audio = record(record(response).audio), encoded = audio.base64;
  if (!['mp3', 'wav', 'flac', 'ogg'].includes(text(audio.format)) || typeof encoded !== 'string' || !encoded.length || encoded.length > 12_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('音色服务没有返回可播放的音频。');
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
