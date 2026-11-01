// 자막을 받지 못한 영상(확인불가)에 담당자가 유튜브에서 복사한 스크립트를 붙여넣으면, 그 글에서 키워드를 찾아 언급 구절을 만든다.
// 서버로 보내거나 저장하지 않고 브라우저 안에서만 처리한다.
// - 시간이 있는 스크립트("0:03" 한 줄 다음에 내용, 또는 "0:03 내용"): 자동 자막과 같은 방식으로 앞뒤 15초와 시점 링크를 만든다.
// - 시간이 없는 일반 글: 키워드 앞뒤 글자만 보여주고 시점 링크는 만들지 않는다.

import type { TranscriptSegment } from "../youtube/transcript";
import { buildVideoMentions } from "./excerpts";
import { normalizeText } from "./normalize";

/** 붙여넣을 수 있는 글자 수 상한 (브라우저가 멈추지 않게) */
export const MAX_PASTE_LENGTH = 300_000;
const MAX_SHOWN = 3;
const CONTEXT_CHARS = 90;
// 시간이 없는 글에서, 이 글자 수 안에 다시 나온 언급은 같은 곳으로 묶는다.
const CLUSTER_CHARS = 220;
// 시간 표시가 이 개수 이상이어야 시간이 있는 스크립트로 본다.
const MIN_TIMED_SEGMENTS = 3;

const TIME_ONLY = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*$/;
const TIME_PREFIX = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(\S.*)$/;

export type ManualMention = {
  /** 언급 구절 원문 (붙여넣은 글 그대로) */
  text: string;
  /** 언급 시점(초). 시간이 없는 글이면 null */
  seconds: number | null;
  /** 시점 링크. 시간이 없는 글이면 null */
  url: string | null;
};

export type ManualResult = {
  mode: "timed" | "plain";
  matchedKeywords: string[];
  mentions: ManualMention[];
  moreMentions: number;
  /** 붙여넣은 글의 길이 */
  length: number;
};

function toSeconds(hours: string | undefined, minutes: string, seconds: string): number {
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** 붙여넣은 글을 시간이 있는 조각들로 나눈다. 시간 표시가 충분하지 않으면 null이다. */
export function parseTimedTranscript(text: string): TranscriptSegment[] | null {
  const segments: { start: number; parts: string[] }[] = [];
  let current: { start: number; parts: string[] } | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const only = TIME_ONLY.exec(rawLine);
    if (only) {
      current = { start: toSeconds(only[1], only[2], only[3]), parts: [] };
      segments.push(current);
      continue;
    }
    const prefixed = TIME_PREFIX.exec(rawLine);
    if (prefixed) {
      current = { start: toSeconds(prefixed[1], prefixed[2], prefixed[3]), parts: [prefixed[4].trim()] };
      segments.push(current);
      continue;
    }
    const line = rawLine.trim();
    if (line && current) current.parts.push(line);
  }

  const timed = segments
    .map((segment) => ({ start: segment.start, text: segment.parts.join(" ").trim() }))
    .filter((segment) => segment.text.length > 0);
  return timed.length >= MIN_TIMED_SEGMENTS ? timed : null;
}

/**
 * 붙여넣은 스크립트에서 키워드가 나온 곳을 찾는다. 언급이 없으면 mentions가 빈 배열이다.
 * 키워드는 띄어쓰기·대소문자와 관계없이 글자 그대로 찾는다. (자동 자막 검색과 같은 규칙)
 */
export function analyzePastedTranscript(videoId: string, text: string, keywords: string[]): ManualResult {
  const timed = parseTimedTranscript(text);
  if (timed) {
    const found = buildVideoMentions(videoId, timed, keywords);
    return {
      mode: "timed",
      matchedKeywords: found?.matchedKeywords ?? [],
      mentions: (found?.mentions ?? []).map((mention) => ({ text: mention.text, seconds: mention.seconds, url: mention.url })),
      moreMentions: found?.moreMentions ?? 0,
      length: text.length,
    };
  }
  return { ...analyzePlain(text, keywords), mode: "plain", length: text.length };
}

function analyzePlain(text: string, keywords: string[]): Omit<ManualResult, "mode" | "length"> {
  const flat = text.replace(/\s+/g, " ").trim();

  // 띄어쓰기를 뺀 글에서 찾고, 찾은 위치를 원래 글의 위치로 되돌린다.
  let normalized = "";
  const origin: number[] = [];
  for (let i = 0; i < flat.length; i++) {
    const piece = normalizeText(flat[i]);
    for (const char of piece) {
      normalized += char;
      origin.push(i);
    }
  }

  const hits: { keyword: string; start: number; end: number }[] = [];
  for (const keyword of keywords) {
    const needle = normalizeText(keyword);
    if (needle.length === 0) continue;
    let from = 0;
    for (;;) {
      const index = normalized.indexOf(needle, from);
      if (index === -1) break;
      hits.push({ keyword, start: origin[index], end: origin[index + needle.length - 1] + 1 });
      from = index + needle.length;
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const clusters: { start: number; end: number }[] = [];
  for (const hit of hits) {
    const last = clusters[clusters.length - 1];
    if (last && hit.start - last.start <= CLUSTER_CHARS) last.end = Math.max(last.end, hit.end);
    else clusters.push({ start: hit.start, end: hit.end });
  }

  const mentions = clusters.slice(0, MAX_SHOWN).map((cluster) => {
    const from = Math.max(0, cluster.start - CONTEXT_CHARS);
    const to = Math.min(flat.length, cluster.end + CONTEXT_CHARS);
    return {
      text: `${from > 0 ? "…" : ""}${flat.slice(from, to)}${to < flat.length ? "…" : ""}`,
      seconds: null,
      url: null,
    };
  });

  return {
    matchedKeywords: keywords.filter((keyword) => hits.some((hit) => hit.keyword === keyword)),
    mentions,
    moreMentions: Math.max(0, clusters.length - MAX_SHOWN),
  };
}
