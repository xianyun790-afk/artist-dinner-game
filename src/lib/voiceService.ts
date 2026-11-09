export const providerNames = { minimax: 'MiniMax', volcengine: '豆包语音 · 火山引擎', aliyun: '阿里云', sensetime: '商汤 V4', sensetimev5: '商汤 V5' };
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

const artistVoices: Record<string, { title: string; description: string; voices: string[]; rate: number; pitch: number }> = {
  monet: { title: '莫奈 · 沉静叙事', description: '柔和、有阅历，留一点思索的停顿。', voices: ['Chinese (Mandarin)_Lyrical_Voice', 'Chinese (Mandarin)_Gentleman'], rate: .94, pitch: .97 },
  vincent: { title: '梵高 · 热切坦诚', description: '有劲、有温度，像想到什么就认真说出来。', voices: ['Chinese (Mandarin)_Unrestrained_Young_Man', 'Chinese (Mandarin)_Sincere_Adult'], rate: 1, pitch: .98 },
  dali: { title: '达利 · 机敏戏剧感', description: '咬字鲜明、节奏轻快，让一个小意外自然出现。', voices: ['Chinese (Mandarin)_Radio_Host'], rate: 1.04, pitch: 1.04 },
  georgia: { title: '欧姬芙 · 成熟克制', description: '清楚、从容，短句也有自己的分量。', voices: ['Chinese (Mandarin)_Wise_Women', 'female-chengshu'], rate: .95, pitch: 1 },
  lin: { title: '林照 · 细腻亲近', description: '轻柔、耐心，像坐在旁边听完一个故事。', voices: ['Chinese (Mandarin)_Gentle_Senior'], rate: .98, pitch: 1.02 },
};
export function artistVoicePreset(artistId: string, catalog: VoiceCatalog) {
  const preset = artistVoices[artistId];
  if (!preset) return undefined;
  const doubaoVoices: Record<string, string[]> = {
    monet: ['zh_male_m191_uranus_bigtts'],
    vincent: ['zh_male_wennuanahu_uranus_bigtts', 'zh_male_taocheng_uranus_bigtts'],
    dali: ['zh_male_sophie_uranus_bigtts', 'zh_male_liufei_uranus_bigtts'],
    georgia: ['zh_female_cancan_uranus_bigtts'],
    lin: ['zh_female_qingxinnvsheng_uranus_bigtts', 'zh_female_xiaohe_uranus_bigtts'],
  };
  for (const id of ['volcengine', 'minimax'] as const) {
    const provider = catalog.providers.find(p => p.id === id);
    if (!provider) continue;
    const preferredModel = id === 'volcengine' ? 'seed-tts-2.0-standard' : 'speech-2.8-turbo';
    const model = provider.models.some(m => m.id === preferredModel) ? preferredModel : provider.defaultModel;
    const voice = (id === 'volcengine' ? doubaoVoices[artistId] : preset.voices).find(v => validateServiceVoice({ provider: id, model, voice: v }, catalog));
    if (voice) return { title: preset.title, description: preset.description, rate: preset.rate, pitch: preset.pitch, choice: { provider: id, model, voice } };
  }
}
export function artistSpeechStyle(artistId: string) {
  const styles: Record<string, string> = {
    monet: '像和朋友坐在一起聊天，语气沉静温和，有一点思索的停顿，不用播音腔，不要刻意压低声音。',
    vincent: '像和朋友认真聊一件在意的事，热切坦诚，有活力但不喊，不用销售或播报腔。',
    dali: '自然聊天，机敏有趣，带一点戏剧感但不夸张表演，不用播报腔。',
    georgia: '自然聊天，成熟从容、简洁清楚，有温度但不撒娇，不用播报腔。',
    lin: '像在朋友旁边耐心听故事，语气轻柔亲切，不撒娇，不用播报腔。',
  };
  return styles[artistId] ?? '像和朋友自然聊天，轻松清楚，不用播报腔。';
}
export function defaultServiceVoice(artistId: string, catalog: VoiceCatalog): ServiceVoice | undefined {
  const preset = artistVoicePreset(artistId, catalog);
  if (preset) return preset.choice;
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
interface CatalogTimeouts { configMs?: number; libraryMs?: number }
async function timedJson(url: string, signal: AbortSignal, timeoutMs: number, fetcher: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await jsonResponse(await fetcher(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' }));
  } catch (error) {
    if (timedOut && !signal.aborted) throw new Error('音色服务连接超时。');
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
export async function loadVoiceCatalog(base: string, signal: AbortSignal, fetcher: typeof fetch = fetch, timeouts: CatalogTimeouts = {}): Promise<VoiceCatalog> {
  const root = serviceUrl(base);
  const config = await timedJson(`${root}/api/config`, signal, timeouts.configMs ?? 8000, fetcher);
  let library: unknown = {}, libraryUnavailable = false;
  // An optional library timeout must not abort the successful system catalog.
  try { library = await timedJson(`${root}/api/library`, signal, timeouts.libraryMs ?? 2500, fetcher); }
  catch (e) { if (signal.aborted) throw e; libraryUnavailable = true; }
  const catalog = parseVoiceCatalog(config, library, libraryUnavailable);
  if (!catalog.providers.length) throw new Error('音色服务尚无可用平台。');
  return catalog;
}
export async function connectVoiceCatalog(base: string, signal: AbortSignal, fetcher: typeof fetch = fetch, timeouts: CatalogTimeouts = {}): Promise<VoiceCatalog> {
  try { return await loadVoiceCatalog(base, signal, fetcher, timeouts); }
  catch (error) {
    if (signal.aborted) throw error;
    // Retry connection metadata once. Never retry /api/tts automatically.
    return loadVoiceCatalog(base, signal, fetcher, timeouts);
  }
}

const bounded = (v: number, low: number, high: number, fallback = 1) => Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : fallback;
export function synthesisBody(choice: ServiceVoice, line: string, rate: number, pitch: number, style = '') {
  const content = line.trim();
  if (!content || content.length > 1000) throw new Error('这段朗读需要 1～1000 字。');
  const speed = bounded(rate, .65, 1.25), tune = Math.round((bounded(pitch, .7, 1.3) - 1) * 10);
  let options: Record<string, unknown>;
  switch (choice.provider) {
    case 'minimax': options = { speed, vol: 1, pitch: tune, format: 'mp3', sampleRate: 32000, bitrate: 128000, languageBoost: 'Chinese', outputFormat: 'hex' }; break;
    case 'volcengine': options = { apiVersion: 'v3', v3Model: choice.model, speed: Math.round((speed - 1) * 100), vol: 0, pitch: tune, format: 'mp3', sampleRate: 24000,
      ...(choice.model === 'seed-tts-2.0-expressive' && style ? { contextTexts: style.slice(0, 200) } : {}) }; break;
    case 'aliyun': options = /^cosyvoice/i.test(choice.model) ? { rate: speed, pitch: bounded(pitch, .7, 1.3), volume: 50, format: 'mp3', sampleRate: 22050 } : { languageType: 'Chinese' }; break;
    case 'sensetime': case 'sensetimev5': options = { speed, volume: 0, pitch: tune, format: 'mp3', sampleRate: 24000, language: 'zh' }; break;
    default: throw new Error('不支持这个语音平台。');
  }
  return { provider: choice.provider, model: choice.model, voice: choice.voice, text: content, options };
}
export async function synthesizeVoice(base: string, choice: ServiceVoice, line: string, rate: number, pitch: number, signal: AbortSignal, fetcher: typeof fetch = fetch, style = ''): Promise<ArrayBuffer> {
  const response = await jsonResponse(await fetcher(`${serviceUrl(base)}/api/tts`, {
    method: 'POST', signal, credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Client-Name': 'Afterglow' },
    body: JSON.stringify(synthesisBody(choice, line, rate, pitch, style)),
  }));
  const audio = record(record(response).audio), encoded = audio.base64;
  if (!['mp3', 'wav', 'flac', 'ogg'].includes(text(audio.format)) || typeof encoded !== 'string' || !encoded.length || encoded.length > 12_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('音色服务没有返回可播放的音频。');
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
