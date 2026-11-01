// Design Ref: §4.2 — 언급 구절 만들기. (PLAN 6번, PRD must 2)
// 규칙: 자막 원문 그대로, 언급 시점 앞뒤 각 15초, 영상당 최대 3곳 + "외 N건", 곳마다 시점 링크.

import type { TranscriptSegment } from "../youtube/transcript";
import { findMentions, type Mention } from "./find-mentions";
import { videoUrl } from "./links";

/** 언급 시점 앞뒤로 보여줄 자막 길이 (초) */
export const EXCERPT_SECONDS = 15;
/** 영상 하나에서 보여줄 최대 언급 구절 수 */
export const MAX_EXCERPTS = 3;

export type Excerpt = {
  /** 앞뒤 15초 자막 원문 (요약하거나 바꾸지 않고 조각을 이어 붙인 것) */
  text: string;
  /** 언급 시점 (초) */
  seconds: number;
  /** 그 시점으로 이동하는 영상 링크 */
  url: string;
  /** 이 구절 안에서 찾은 키워드 */
  keywords: string[];
};

export type VideoMentions = {
  /** 이 영상에서 언급된 키워드 (입력한 순서) */
  matchedKeywords: string[];
  /** 보여줄 언급 구절 (최대 3곳) */
  mentions: Excerpt[];
  /** 보여주지 않은 나머지 언급 곳 수 ("외 N건") */
  moreMentions: number;
};

/**
 * 영상의 자막에서 언급 구절을 만든다. 언급이 없으면 null이다.
 * 가까운 언급(첫 언급 기준 30초 안)은 앞뒤 15초 구절이 겹치므로 한 곳으로 묶는다.
 */
export function buildVideoMentions(
  videoId: string,
  segments: TranscriptSegment[],
  keywords: string[],
): VideoMentions | null {
  const found = findMentions(segments, keywords);
  if (found.length === 0) return null;

  const places = groupNearby(found);
  const matchedKeywords = keywords.filter((keyword) => found.some((mention) => mention.keyword === keyword));

  const mentions = places.slice(0, MAX_EXCERPTS).map((place) => {
    const center = place[0].start;
    return {
      text: excerptText(segments, center),
      seconds: Math.floor(center),
      url: videoUrl(videoId, center),
      keywords: keywords.filter((keyword) => place.some((mention) => mention.keyword === keyword)),
    };
  });

  return { matchedKeywords, mentions, moreMentions: Math.max(0, places.length - MAX_EXCERPTS) };
}

// 시간순으로 정렬된 언급을, 곳마다 첫 언급에서 2 × 15초 안이면 같은 곳으로 묶는다.
function groupNearby(found: Mention[]): Mention[][] {
  const places: Mention[][] = [];
  for (const mention of found) {
    const current = places[places.length - 1];
    if (current && mention.start - current[0].start <= EXCERPT_SECONDS * 2) current.push(mention);
    else places.push([mention]);
  }
  return places;
}

function excerptText(segments: TranscriptSegment[], center: number): string {
  return segments
    .filter((segment) => segment.start >= center - EXCERPT_SECONDS && segment.start <= center + EXCERPT_SECONDS)
    .map((segment) => segment.text)
    .join(" ");
}
