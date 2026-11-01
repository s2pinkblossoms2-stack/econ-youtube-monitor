// Design Ref: §4.2 — 키워드 검색. 저장된 자막에서 키워드가 나온 영상을 찾아 채널 종류별로 나누고, 20건씩 언급 구절을 붙인다.
// 자막 원본(segments)은 매우 커서, 검색용 글(normalized_text)로 먼저 걸러 낸 뒤 보여줄 쪽의 영상만 읽는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TranscriptSegment } from "../youtube/transcript";
import { RETENTION_DAYS } from "./constants";
import { buildVideoMentions, type Excerpt } from "./excerpts";
import { thumbnailUrl, videoUrl } from "./links";
import { findMetadataMatch } from "./metadata";
import { normalizeText } from "./normalize";
import { PAGE_SIZE } from "./validate";

const DAY_MS = 24 * 60 * 60 * 1000;
// 요청 주소가 너무 길어지지 않게 한 번에 묻는 영상 수를 제한한다.
const ID_CHUNK = 100;
// 마지막 수집이 이 시간보다 오래됐으면 "확인하지 못한 채널"로 안내한다.
const STALE_CHECK_MS = 2 * DAY_MS;

export type SearchResultItem = {
  channelName: string;
  videoTitle: string;
  uploadedAt: string;
  videoUrl: string;
  thumbnailUrl: string;
  isShort: boolean;
  /** ok: 자막에서 찾음 / none: 자막을 확인하지 못해 제목·태그·설명에서만 찾음 */
  captionStatus: "ok" | "none";
  /** transcript: 자막 언급 구절이 있음 / metadata: 제목·태그·설명에서 찾음 */
  matchType: "transcript" | "metadata";
  /** metadata일 때 키워드가 나온 곳 (제목·태그·설명) */
  matchedIn: string[];
  matchedKeywords: string[];
  mentions: Excerpt[];
  moreMentions: number;
};

export type SearchResponse = {
  /** 24개 채널 영상 중 자막으로 확인한 결과 */
  main: SearchResultItem[];
  /** 24개 채널 영상 중 자막을 받지 못해 확인불가인 영상. 제목·태그·설명에 키워드가 있어 언급 가능성이 높은 것만 */
  unverified: SearchResultItem[];
  small: SearchResultItem[];
  totalMain: number;
  totalUnverified: number;
  totalSmall: number;
  page: number;
  unchecked: { channelName: string; reason: string }[];
  /** 아직 수집(키워드 검색)을 거치지 않은 키워드. 그 밖의 채널 결과는 다음 수집 후에 나온다. */
  pendingKeywords: string[];
};

type VideoRow = {
  id: string;
  youtube_video_id: string;
  title: string;
  uploaded_at: string;
  is_short: boolean;
  caption_status: "ok" | "none" | "pending";
  tags: string[];
  description: string | null;
  channels: { name: string; kind: "main" | "small"; active: boolean };
};

/** 저장소 읽기에 실패하면 오류를 던진다. 호출한 쪽에서 503으로 바꾼다. */
export async function searchMentions(
  db: SupabaseClient,
  keywords: string[],
  page: number,
): Promise<SearchResponse> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString();

  const matchedIds = await findMatchedVideoIds(db, keywords, cutoff);
  const videos = await loadVideos(db, [...matchedIds], cutoff);

  // 최신 업로드 순. 같은 영상은 한 번만 나온다.
  videos.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  // 24개 채널 영상 중 자막을 확인하지 못한 영상은 "확인불가"로 따로 모은다. (자막으로 확인한 결과와 섞지 않는다)
  const mainAll = videos.filter((video) => video.channels.kind === "main" && video.caption_status === "ok");
  const unverifiedAll = videos.filter((video) => video.channels.kind === "main" && video.caption_status !== "ok");
  const smallAll = videos.filter((video) => video.channels.kind === "small");

  const from = (page - 1) * PAGE_SIZE;
  const mainPage = mainAll.slice(from, from + PAGE_SIZE);
  const unverifiedPage = unverifiedAll.slice(from, from + PAGE_SIZE);
  const smallPage = smallAll.slice(from, from + PAGE_SIZE);

  const segmentsById = await loadSegments(db, [...mainPage, ...smallPage].map((video) => video.id));

  return {
    main: toItems(mainPage, segmentsById, keywords),
    unverified: toItems(unverifiedPage, segmentsById, keywords),
    small: toItems(smallPage, segmentsById, keywords),
    totalMain: mainAll.length,
    totalUnverified: unverifiedAll.length,
    totalSmall: smallAll.length,
    page,
    unchecked: await findUncheckedChannels(db),
    pendingKeywords: await findPendingKeywords(db, keywords),
  };
}

// 저장된 키워드 중 유튜브 검색 수집을 마친 것을 빼고, 입력한 키워드 중 아직 수집 전인 것을 돌려준다.
async function findPendingKeywords(db: SupabaseClient, keywords: string[]): Promise<string[]> {
  const { data, error } = await db.from("keywords").select("text, last_collected_at");
  if (error) throw new Error(`키워드 읽기 실패: ${error.message}`);
  const collected = new Set(
    ((data ?? []) as { text: string; last_collected_at: string | null }[])
      .filter((row) => row.last_collected_at)
      .map((row) => normalizeText(row.text)),
  );
  return keywords.filter((keyword) => !collected.has(normalizeText(keyword)));
}

// 자막의 검색용 글, 또는 영상의 제목·태그·설명(meta_text)에 키워드(띄어쓰기를 뺀 글)가 들어 있는 영상을 모두 찾는다.
// 키워드 중 하나라도 있으면 포함한다.
// DB 함수(matching_video_ids)가 키워드마다 한 번의 조회로 영상 번호 전체를 배열 하나로 돌려준다.
// 키워드는 글자 그대로 찾으므로 % _ 같은 문자를 따로 막을 필요가 없다. (supabase/migrations/20261102000100_matching_video_ids.sql)
async function findMatchedVideoIds(db: SupabaseClient, keywords: string[], cutoff: string): Promise<Set<number>> {
  const perKeyword = await Promise.all(
    keywords.map(async (keyword) => {
      const { data, error } = await db.rpc("matching_video_ids", { needle: normalizeText(keyword), since: cutoff });
      if (error) throw new Error(`키워드 검색 실패: ${error.message}`);
      return (data ?? []) as number[];
    }),
  );
  return new Set(perKeyword.flat());
}

// 14일 안에 올라온 영상 중, 사용 중인 채널의 영상만 가져온다.
async function loadVideos(db: SupabaseClient, ids: number[], cutoff: string): Promise<VideoRow[]> {
  const chunks = chunk(ids, ID_CHUNK);
  const results = await Promise.all(
    chunks.map(async (part) => {
      const { data, error } = await db
        .from("videos")
        .select("id, youtube_video_id, title, uploaded_at, is_short, caption_status, tags, description, channels!inner(name, kind, active)")
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

// 영상마다 결과를 만든다. 자막에서 찾았으면 언급 구절을, 못 찾았으면 제목·태그·설명에서 찾은 결과를 붙인다.
// 링크를 만들 수 없는 영상(잘못된 영상 ID)은 결과에서 뺀다.
function toItems(
  videos: VideoRow[],
  segmentsById: Map<string, TranscriptSegment[]>,
  keywords: string[],
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  for (const video of videos) {
    try {
      const base = {
        channelName: video.channels.name,
        videoTitle: video.title,
        uploadedAt: video.uploaded_at,
        videoUrl: videoUrl(video.youtube_video_id),
        thumbnailUrl: thumbnailUrl(video.youtube_video_id),
        isShort: video.is_short,
      };

      const segments = segmentsById.get(video.id);
      const found = segments ? buildVideoMentions(video.youtube_video_id, segments, keywords) : null;
      if (found) {
        items.push({
          ...base,
          captionStatus: "ok",
          matchType: "transcript",
          matchedIn: [],
          matchedKeywords: found.matchedKeywords,
          mentions: found.mentions,
          moreMentions: found.moreMentions,
        });
        continue;
      }

      const metadata = findMetadataMatch({ title: video.title, tags: video.tags ?? [], description: video.description }, keywords);
      if (metadata) {
        items.push({
          ...base,
          captionStatus: segments ? "ok" : "none",
          matchType: "metadata",
          matchedIn: metadata.matchedIn,
          matchedKeywords: metadata.matchedKeywords,
          mentions: [],
          moreMentions: 0,
        });
      }
    } catch {
      continue;
    }
  }
  return items;
}

// 사용 중인 채널 중 수집 기록이 없거나 오래된 채널. (수집이 멈춘 채널을 "언급 없음"으로 오해하지 않게 알린다)
async function findUncheckedChannels(db: SupabaseClient): Promise<SearchResponse["unchecked"]> {
  // 24개 주요 채널만 본다. 그 밖의 채널은 키워드 검색으로 찾은 영상만 저장하므로 수집 기록이 없는 것이 정상이다.
  const { data, error } = await db.from("channels").select("name, last_checked_at").eq("kind", "main").eq("active", true);
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
