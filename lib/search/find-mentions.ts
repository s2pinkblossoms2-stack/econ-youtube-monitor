// Design Ref: §9 — 자막에서 키워드가 나온 곳을 찾는다. (PLAN 5번: 여러 키워드 동시 검색, 띄어쓰기·조사 변화 허용)
// PRD 규칙: 키워드 중 하나라도 나오면 언급이다. 글자가 그대로 들어 있으면 언급으로 보므로,
// 띄어쓰기를 모두 지운 글에서 부분 문자열로 찾으면 "금리를", "금리가", "금 리"가 모두 같은 언급이 된다.

import type { TranscriptSegment } from "../youtube/transcript";
import { normalizeText } from "./normalize";

export type Mention = {
  /** 사용자가 입력한 키워드 (입력한 그대로) */
  keyword: string;
  /** 언급이 시작된 자막 조각의 순번 */
  segmentIndex: number;
  /** 그 조각의 시작 시점 (초) */
  start: number;
};

/**
 * 자막에서 키워드가 나온 곳을 모두 찾아 시간순으로 돌려준다. 없으면 빈 배열이다.
 * 키워드가 자막 조각 사이에 걸쳐 있어도(예: "금" | "리") 찾는다.
 */
export function findMentions(segments: TranscriptSegment[], keywords: string[]): Mention[] {
  // 조각마다 띄어쓰기를 지운 글을 이어 붙이고, 각 조각이 시작하는 위치를 기억해 둔다.
  let joined = "";
  const segmentStarts: number[] = [];
  for (const segment of segments) {
    segmentStarts.push(joined.length);
    joined += normalizeText(segment.text);
  }

  const mentions: Mention[] = [];
  for (const keyword of keywords) {
    const needle = normalizeText(keyword);
    if (needle.length === 0) continue;

    let from = 0;
    for (;;) {
      const position = joined.indexOf(needle, from);
      if (position === -1) break;
      const segmentIndex = segmentIndexAt(segmentStarts, position);
      mentions.push({ keyword, segmentIndex, start: segments[segmentIndex].start });
      from = position + needle.length;
    }
  }
  return mentions.sort((a, b) => a.segmentIndex - b.segmentIndex);
}

// position이 속한 조각의 순번: 시작 위치가 position 이하인 조각 중 마지막. (빈 조각은 같은 위치를 공유하므로 마지막 것을 고른다)
function segmentIndexAt(segmentStarts: number[], position: number): number {
  let low = 0;
  let high = segmentStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (segmentStarts[mid] <= position) low = mid;
    else high = mid - 1;
  }
  return low;
}
