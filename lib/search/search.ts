// Design Ref: §4.2 — 키워드 검색. 저장된 자막에서 키워드가 나온 영상을 찾아 채널 종류별로 나누고, 20건씩 언급 구절을 붙인다.
// 자막 원본(segments)은 매우 커서, 검색용 글(normalized_text)로 먼저 걸러 낸 뒤 보여줄 쪽의 영상만 읽는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TranscriptSegment } from "../youtube/transcript";
import { RETENTION_DAYS } from "./constants";
import { buildVideoMentions, type Excerpt } from "./excerpts";
import { videoUrl } from "./links";
import { normalizeText } from "./normalize";
import { PAGE_SIZE } from "./validate";

const DAY_MS = 24 * 60 * 60 * 1000;
// Supabase는 한 번에 1,000행까지만 주므로 쪽을 나눠 읽는다.
const PAGE_ROWS = 1000;
// 요청 주소가 너무 길어지지 않게 한 번에 묻는 영상 수를 제한한다.
const ID_CHUNK = 100;
// 마지막 수집이 이 시간보다 오래됐으면 "확인하지 못한 채널"로 안내한다.
const STALE_CHECK_MS = 2 * DAY_MS;

export type SearchResultItem = {
  channelName: string;
  videoTitle: string;
  uploadedAt: string;
  videoUrl: string;
  isShort: boolean;
  captionStatus: "ok";
  matchedKeywords: string[];
  mentions: Excerpt[];
  moreMentions: number;
};

export type SearchResponse = {
  main: SearchResultItem[];
  small: SearchResultItem[];
  totalMain: number;
  totalSmall: number;
  page: number;
  unchecked: { channelName: string; reason: string }[];
  /** 아직 수집을 거치지 않은 키워드. 중소 유튜버 찾기(PLAN 9번)를 만들 때 채운다. */
  pendingKeywords: string[];
};

type VideoRow = {
  id: string;
  youtube_video_id: string;
  title: string;
  uploaded_at: string;
  is_short: boolean;
  channels: { name: string; kind: "main" | "small"; active: boolean };
};

/** 저장소 읽기에 실패하면 오류를 던진다. 호출한 쪽에서 503으로 바꾼다. */
export async function searchMentions(
  db: SupabaseClient,
  keywords: string[],
  page: number,
): Promise<SearchResponse> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString();

  const matchedIds = await findMatchedVideoIds(db, keywords);
  const videos = await loadVideos(db, [...matchedIds], cutoff);

  // 최신 업로드 순. 같은 영상은 한 번만 나온다.
  videos.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const mainAll = videos.filter((video) => video.channels.kind === "main");
  const smallAll = videos.filter((video) => video.channels.kind === "small");

  const from = (page - 1) * PAGE_SIZE;
  const mainPage = mainAll.slice(from, from + PAGE_SIZE);
  const smallPage = smallAll.slice(from, from + PAGE_SIZE);

  const segmentsById = await loadSegments(db, [...mainPage, ...smallPage].map((video) => video.id));

  return {
    main: toItems(mainPage, segmentsById, keywords),
    small: toItems(smallPage, segmentsById, keywords),
    totalMain: mainAll.length,
    totalSmall: smallAll.length,
    page,
    unchecked: await findUncheckedChannels(db),
    pendingKeywords: [],
  };
}

// 검색용 글에 키워드(띄어쓰기를 뺀 글)가 들어 있는 영상을 모두 찾는다. 키워드 중 하나라도 있으면 포함한다.
async function findMatchedVideoIds(db: SupabaseClient, keywords: string[]): Promise<Set<string>> {
  const perKeyword = await Promise.all(
    keywords.map(async (keyword) => {
      const pattern = `%${escapeLike(normalizeText(keyword))}%`;
      const ids: string[] = [];
      for (let from = 0; ; from += PAGE_ROWS) {
        const { data, error } = await db
          .from("transcripts")
          .select("video_id")
          .ilike("normalized_text", pattern)
          .order("video_id")
          .range(from, from + PAGE_ROWS - 1);
        if (error) throw new Error(`자막 검색 실패: ${error.message}`);
        const rows = (data ?? []) as { video_id: string }[];
        ids.push(...rows.map((row) => row.video_id));
        if (rows.length < PAGE_ROWS) break;
      }
      return ids;
    }),
  );
  return new Set(perKeyword.flat());
}

// LIKE에서 특별한 뜻을 가진 \ % _ 를 글자 그대로 찾도록 막는다. (% 하나로 모든 자막이 걸리는 일 방지)
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

// 14일 안에 올라온 영상 중, 사용 중인 채널의 영상만 가져온다.
async function loadVideos(db: SupabaseClient, ids: string[], cutoff: string): Promise<VideoRow[]> {
  const chunks = chunk(ids, ID_CHUNK);
  const results = await Promise.all(
    chunks.map(async (part) => {
      const { data, error } = await db
        .from("videos")
        .select("id, youtube_video_id, title, uploaded_at, is_short, channels!inner(name, kind, active)")
        .in("id", part)
        .gte("uploaded_at", cutoff)
        .eq("channels.active", true);
      if (error) throw new Error(`영상 읽기 실패: ${error.message}`);
      return (data ?? []) as unknown as VideoRow[];
    }),
  );
  return results.flat();
}

async function loadSegments(db: SupabaseClient, videoIds: string[]): Promise<Map<string, TranscriptSegment[]>> {
  const map = new Map<string, TranscriptSegment[]>();
  // 한 쪽은 최대 40개 영상이다. 한 줄이 커서 한꺼번에 읽으면 느리므로 영상마다 따로, 동시에 읽는다.
  await Promise.all(
    videoIds.map(async (videoId) => {
      const { data, error } = await db.from("transcripts").select("segments").eq("video_id", videoId).maybeSingle();
      if (error) throw new Error(`자막 읽기 실패: ${error.message}`);
      if (data) map.set(videoId, (data as { segments: TranscriptSegment[] }).segments);
    }),
  );
  return map;
}

// 영상마다 언급 구절을 붙인다. 링크를 만들 수 없는 영상(잘못된 영상 ID)은 결과에서 뺀다.
function toItems(
  videos: VideoRow[],
  segmentsById: Map<string, TranscriptSegment[]>,
  keywords: string[],
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  for (const video of videos) {
    const segments = segmentsById.get(video.id);
    if (!segments) continue;
    try {
      const found = buildVideoMentions(video.youtube_video_id, segments, keywords);
      if (!found) continue;
      items.push({
        channelName: video.channels.name,
        videoTitle: video.title,
        uploadedAt: video.uploaded_at,
        videoUrl: videoUrl(video.youtube_video_id),
        isShort: video.is_short,
        captionStatus: "ok",
        matchedKeywords: found.matchedKeywords,
        mentions: found.mentions,
        moreMentions: found.moreMentions,
      });
    } catch {
      continue;
    }
  }
  return items;
}

// 사용 중인 채널 중 수집 기록이 없거나 오래된 채널. (수집이 멈춘 채널을 "언급 없음"으로 오해하지 않게 알린다)
async function findUncheckedChannels(db: SupabaseClient): Promise<SearchResponse["unchecked"]> {
  const { data, error } = await db.from("channels").select("name, last_checked_at").eq("active", true);
  if (error) throw new Error(`채널 읽기 실패: ${error.message}`);
  const now = Date.now();
  return ((data ?? []) as { name: string; last_checked_at: string | null }[])
    .filter((channel) => !channel.last_checked_at || now - new Date(channel.last_checked_at).getTime() > STALE_CHECK_MS)
    .map((channel) => ({
      channelName: channel.name,
      reason: channel.last_checked_at ? "최근 수집이 오래되었습니다." : "아직 수집한 적이 없습니다.",
    }));
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
