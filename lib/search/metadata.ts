// Design Ref: §3 — 자막이 없는 영상(24개 채널이 아닌 채널)은 제목·태그·설명에서 키워드를 찾는다. (PLAN 9번)
// 저장할 때(meta_text)와 찾을 때 같은 함수를 써서 결과가 어긋나지 않게 한다.

import { normalizeText } from "./normalize";

export type VideoMetadata = { title: string; tags: string[]; description: string | null };

/** 제목·태그·설명을 이어 붙이고 띄어쓰기를 지운 검색용 글 */
export function buildMetaText(video: VideoMetadata): string {
  return normalizeText([video.title, ...video.tags, video.description ?? ""].join(" "));
}

export type MatchField = "제목" | "태그" | "설명";

export type MetadataMatch = {
  /** 영상에서 언급된 키워드 (입력한 순서) */
  matchedKeywords: string[];
  /** 키워드가 나온 곳 */
  matchedIn: MatchField[];
};

/** 영상의 제목·태그·설명에 키워드가 하나라도 있으면 어디서 나왔는지 돌려주고, 없으면 null이다. */
export function findMetadataMatch(video: VideoMetadata, keywords: string[]): MetadataMatch | null {
  const fields: [MatchField, string][] = [
    ["제목", normalizeText(video.title)],
    ["태그", normalizeText(video.tags.join(" "))],
    ["설명", normalizeText(video.description ?? "")],
  ];

  const matchedKeywords: string[] = [];
  const matchedIn = new Set<MatchField>();
  for (const keyword of keywords) {
    const needle = normalizeText(keyword);
    if (needle.length === 0) continue;
    let found = false;
    for (const [field, text] of fields) {
      if (text.includes(needle)) {
        matchedIn.add(field);
        found = true;
      }
    }
    if (found) matchedKeywords.push(keyword);
  }
  if (matchedKeywords.length === 0) return null;
  return { matchedKeywords, matchedIn: fields.map(([field]) => field).filter((field) => matchedIn.has(field)) };
}
