export interface Painting {
  id: string;
  title: string;
  englishTitle: string;
  artist: string;
  year: string;
  image: string;
  museum: string;
  sourceUrl: string;
  imageSourceUrl: string;
}

export const starryNight: Painting = {
  id: 'starry-night',
  title: '星月夜',
  englishTitle: 'The Starry Night',
  artist: '文森特·梵高',
  year: '1889',
  image: '/artworks/starry-night.jpg',
  museum: '纽约现代艺术博物馆（MoMA）',
  sourceUrl: 'https://www.moma.org/collection/works/79802',
  imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
};

export const waterLilies: Painting = {
  id: 'water-lilies',
  title: '睡莲',
  englishTitle: 'Water Lilies',
  artist: '克洛德·莫奈',
  year: '1906',
  image: '/artworks/water-lilies.jpg',
  museum: '芝加哥艺术博物馆',
  sourceUrl: 'https://www.artic.edu/artworks/16568/water-lilies',
  imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Water_Lilies_-_1933.1157_-_Art_Institute_of_Chicago.jpg',
};

const paintingTitle = /星月夜|星夜|\b(?:the\s+)?starry\s+night\b|睡莲|\bwater\s+lilies\b|\bnymph[eé]as\b/giu;

function normalizeMention(text: string): string {
  return text.normalize('NFKC')
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/\s+/g, ' ');
}

function relevantText(text: string): string {
  // The 1888 Rhône painting is a separate work, despite sharing a short title.
  return normalizeMention(text)
    .replace(/罗[讷纳]河[^，。！？,!?；;]{0,8}?星(?:月)?夜/gu, '')
    .replace(/\b(?:the\s+)?starry\s+night\s+over\s+the\s+rh[oô]ne\b/giu, '')
    .replace(/睡莲池|睡莲和日本桥|\bbridge\s+over\s+(?:a\s+)?pond\s+of\s+water\s+lilies\b/giu, '')
    .replace(/星夜(?:兼程|赶路|行军|疾行|出发|驰援)|披星夜行/gu, '');
}

/** The whole turn can suppress showing art, including later assistant mentions. */
export function declinesPaintingDisplay(text: string): boolean {
  for (const clause of relevantText(text).split(/[，。！？,!?；;\n]/u)) {
    // A display preference need not repeat the title. Keep this tied to an
    // explicit display action and picture object, rather than art opinions or
    // “不想画画”, which concern the conversation or creation instead.
    const declinePicture = /(?:不要|不用|不必|无需|先别|别|不想|不需要)(?:你|再|先|现在|暂时|自动|直接|给我|帮我|\s){0,3}(?:展示|显示|弹出|打开|放出|放大|看)(?:这张|那张|这幅|那幅|任何|这些|那些|相关|的|\s){0,3}(?:图片|画面|画作|原作|配图|插图|弹窗|这幅画|这张画|那幅画|那张画)/u.test(clause);
    const declinePictureAfter = /(?:图片|画面|画作|原作|配图|插图|弹窗|这幅画|这张画|那幅画|那张画)(?:先|暂时|现在)?(?:不要|不用|不必|无需|别|不需要)(?:你|再|先|自动|直接|给我|帮我|\s){0,3}(?:展示|显示|弹出|打开|放出|放大|看)/u.test(clause);
    const declinePopup = /(?:不要|不用|不必|无需|先别|别|不想|不需要)(?:你|再|先|自动|直接|给我|帮我|\s){0,3}(?:弹窗|配图)/u.test(clause);
    if (declinePicture || declinePictureAfter || declinePopup) return true;
    for (const mention of clause.matchAll(paintingTitle)) {
      const before = clause.slice(0, mention.index).slice(-30);
      const after = clause.slice(mention.index! + mention[0].length, mention.index! + mention[0].length + 30);
      // Respect a request not to show a picture, without censoring disagreement
      // or ordinary questions containing words such as “不喜欢” or “没有”.
      const declineBefore = /(?:不要|不用|不必|无需|先别|别|不想|不需要).{0,8}(?:展示|显示|弹出|打开|放出|放大|看).{0,8}$/u.test(before);
      const declineAfter = /^[》”"'\s]*(?:(?:这幅|这张|的画|画作|原作)\s*)?(?:先|暂时|现在)?(?:不要|不用|不必|无需|别|不需要).{0,8}(?:展示|显示|弹出|打开|放出|放大|看)/u.test(after);
      if (declineBefore || declineAfter) return true;
    }
  }
  return false;
}

/** Match a named work, rather than guessing from a general topic such as stars. */
export function findMentionedPainting(text: string): Painting | null {
  if (declinesPaintingDisplay(text)) return null;
  const mention = [...relevantText(text).matchAll(paintingTitle)].at(-1);
  if (!mention) return null;
  return /睡莲|water\s+lilies|nymph[eé]as/iu.test(mention[0]) ? waterLilies : starryNight;
}

export interface PaintingSceneState { painting: Painting | null; suppressed: boolean }
export function paintingFromPlayer(state: PaintingSceneState, text: string): PaintingSceneState {
  if (declinesPaintingDisplay(text)) return { painting: null, suppressed: true };
  const painting = findMentionedPainting(text);
  // Ordinary follow-ups stay in the painting. Only an explicit new mention
  // can invite the player back after they have chosen to leave it.
  return painting ? { painting, suppressed: false } : state;
}
export function paintingFromReply(state: PaintingSceneState, text: string): PaintingSceneState {
  if (state.suppressed || state.painting) return state;
  const painting = findMentionedPainting(text);
  return painting ? { painting, suppressed: false } : state;
}
