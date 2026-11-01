// Design Ref: §4.2 — 키워드 검색. 저장된 자막에서 키워드가 나온 영상을 찾아 채널 종류별로 나누고, 20건씩 언급 구절을 붙인다.
// 자막 원본(segments)은 매우 커서, 검색용 글(normalized_text)로 먼저 걸러 낸 뒤 보여줄 쪽의 영상만 읽는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TranscriptSegment } from "../youtube/transcript";
import { RETENTION_DAYS } from "./constants";
import { buildVideoMentions, type Excerpt } from "./excerpts";
import { thumbnailUrl, videoUrl } from "./links";
import { findMetadataMatch } from "./metadata";
import { normalizeText } from "./normalize";
import { EXPORT_PART_SIZE, PAGE_SIZE } from "./validate";

const DAY_MS = 24 * 60 * 60 * 1000;
// 마지막 수집이 이 시간보다 오래됐으면 "확인하지 못한 채널"로 안내한다.
const STALE_CHECK_MS = 2 * DAY_MS;

export type SearchResultItem = {
  /** 유튜브 영상 ID (11자). 붙여넣은 스크립트로 시점 링크를 만들 때 쓴다. */
  videoId: string;
  /** main: 24개 채널 자막 확인 / unverified: 24개 채널인데 자막을 못 받음 / small: 그 밖의 채널 */
  section: "main" | "unverified" | "small";
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
  id: number;
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

  // 1) 키워드가 걸린 영상의 가벼운 목록(번호·업로드 시각·채널 종류·자막 상태)을 DB에서 한 번에 받는다.
  const matches = await findMatchedVideos(db, keywords, cutoff);

  // 최신 업로드 순. 같은 영상은 한 번만 나온다.
  matches.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  // 24개 채널 영상 중 자막을 확인하지 못한 영상은 "확인불가"로 따로 모은다. (자막으로 확인한 결과와 섞지 않는다)
  const mainAll = matches.filter((match) => match.kind === "main" && match.captionStatus === "ok");
  const unverifiedAll = matches.filter((match) => match.kind === "main" && match.captionStatus !== "ok");
  const smallAll = matches.filter((match) => match.kind === "small");

  const from = (page - 1) * PAGE_SIZE;
  const mainPage = mainAll.slice(from, from + PAGE_SIZE);
  const unverifiedPage = unverifiedAll.slice(from, from + PAGE_SIZE);
  const smallPage = smallAll.slice(from, from + PAGE_SIZE);

  // 2) 화면에 보여줄 영상(최대 60개)의 자세한 정보와 자막 원본만 읽는다.
  const shownIds = [...mainPage, ...unverifiedPage, ...smallPage].map((match) => match.id);
  const [rows, segmentsById] = await Promise.all([
    loadVideos(db, shownIds),
    loadSegments(db, [...mainPage, ...smallPage].map((match) => match.id)),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pick = (part: MatchedVideo[]): VideoRow[] =>
    part.flatMap((match) => {
      const row = byId.get(match.id);
      return row ? [row] : [];
    });

  const [main, unverified, small] = await Promise.all([
    toItemsComplete(db, pick(mainPage), segmentsById, keywords),
    toItemsComplete(db, pick(unverifiedPage), segmentsById, keywords),
    toItemsComplete(db, pick(smallPage), segmentsById, keywords),
  ]);

  return {
    main,
    unverified,
    small,
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

type MatchedVideo = {
  id: number;
  uploadedAt: string;
  kind: "main" | "small";
  captionStatus: "ok" | "none" | "pending";
};

// 자막의 검색용 글, 또는 영상의 제목·태그·설명(meta_text)에 키워드(띄어쓰기를 뺀 글)가 들어 있는 영상을 모두 찾는다.
// 키워드 중 하나라도 있으면 포함한다. 14일 안에 올라온, 사용 중인 채널의 영상만 나온다.
// DB 함수(matching_videos_any)가 키워드 전체를 한 번의 조회로 훑어 [번호, 업로드 시각, 채널 종류, 자막 상태]를 배열 하나로 돌려준다.
// 키워드는 글자 그대로 찾으므로 % _ 같은 문자를 따로 막을 필요가 없다. (supabase/migrations/20261102000300_matching_videos_any.sql)
async function findMatchedVideos(db: SupabaseClient, keywords: string[], cutoff: string): Promise<MatchedVideo[]> {
  const needles = keywords.map(normalizeText).filter((needle) => needle.length > 0);
  if (needles.length === 0) return [];
  const { data, error } = await db.rpc("matching_videos_any", { needles, since: cutoff });
  if (error) throw new Error(`키워드 검색 실패: ${error.message}`);
  return ((data ?? []) as [number, string, "main" | "small", "ok" | "none" | "pending"][]).map(
    ([id, uploadedAt, kind, captionStatus]) => ({ id, uploadedAt, kind, captionStatus }),
  );
}

// 보여줄 영상(최대 60개)의 자세한 정보를 한 번에 읽는다. 목록에서 이미 14일·사용 중 채널로 걸렀다.
async function loadVideos(db: SupabaseClient, ids: number[]): Promise<VideoRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("videos")
    .select("id, youtube_video_id, title, uploaded_at, is_short, caption_status, tags, description, channels!inner(name, kind, active)")
    .in("id", ids);
  if (error) throw new Error(`영상 읽기 실패: ${error.message}`);
  return (data ?? []) as unknown as VideoRow[];
}

async function loadSegments(
  db: SupabaseClient,
  videoIds: number[],
  concurrency = Infinity,
): Promise<Map<number, TranscriptSegment[]>> {
  const map = new Map<number, TranscriptSegment[]>();
  // 한 줄이 커서 한꺼번에 읽으면 느리므로 영상마다 따로, 동시에 읽는다. (한 쪽은 최대 60개. 내려받기는 concurrency로 나눠서 읽는다)
  for (let i = 0; i < videoIds.length; i += Math.min(concurrency, videoIds.length || 1)) {
    const group = videoIds.slice(i, i + Math.min(concurrency, videoIds.length));
    await Promise.all(
      group.map(async (videoId) => {
        const { data, error } = await db.from("transcripts").select("segments").eq("video_id", videoId).maybeSingle();
        if (error) throw new Error(`자막 읽기 실패: ${error.message}`);
        if (data) map.set(videoId, (data as { segments: TranscriptSegment[] }).segments);
      }),
    );
  }
  return map;
}


export type ExportResult = {
  items: SearchResultItem[];
  part: number;
  partCount: number;
  total: number;
  totalMain: number;
  totalUnverified: number;
  totalSmall: number;
};

/**
 * 검색 결과 전체를 300개씩 나눈 `part`번째 묶음을 만든다. 순서는 화면과 같다:
 * 24개 주요 채널(자막 확인) → 확인불가 → 그 밖의 채널, 각각 최신 업로드 순.
 */
export async function exportMentions(db: SupabaseClient, keywords: string[], part: number): Promise<ExportResult> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString();
  const matches = await findMatchedVideos(db, keywords, cutoff);
  matches.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const mainAll = matches.filter((match) => match.kind === "main" && match.captionStatus === "ok");
  const unverifiedAll = matches.filter((match) => match.kind === "main" && match.captionStatus !== "ok");
  const smallAll = matches.filter((match) => match.kind === "small");

  const ordered = [...mainAll, ...unverifiedAll, ...smallAll];
  const partCount = Math.max(1, Math.ceil(ordered.length / EXPORT_PART_SIZE));
  const slice = ordered.slice((part - 1) * EXPORT_PART_SIZE, part * EXPORT_PART_SIZE);

  // 한 번에 읽는 영상 정보는 100개씩, 자막 원본은 30개씩 동시에 읽는다.
  const rows: VideoRow[] = [];
  for (let i = 0; i < slice.length; i += 100) rows.push(...(await loadVideos(db, slice.slice(i, i + 100).map((match) => match.id))));
  const segmentsById = await loadSegments(
    db,
    slice.filter((match) => match.captionStatus === "ok").map((match) => match.id),
    30,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const videos = slice.flatMap((match) => {
    const row = byId.get(match.id);
    return row ? [row] : [];
  });

  return {
    items: await toItemsComplete(db, videos, segmentsById, keywords),
    part,
    partCount,
    total: ordered.length,
    totalMain: mainAll.length,
    totalUnverified: unverifiedAll.length,
    totalSmall: smallAll.length,
  };
}

// 영상마다 결과를 만든다. 자막에서 찾았으면 언급 구절을, 못 찾았으면 제목·태그·설명에서 찾은 결과를 붙인다.
// 링크를 만들 수 없는 영상(잘못된 영상 ID)은 결과에서 뺀다.
function toItems(
  videos: VideoRow[],
  segmentsById: Map<number, TranscriptSegment[]>,
  keywords: string[],
  /** 화면용 설명은 앞 2,000자만 저장해서, 그 뒤에 있는 키워드는 검색용 글(meta_text)로 한 번 더 확인한다 */
  fallbackMeta?: Map<number, string>,
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  for (const video of videos) {
    try {
      const base = {
        videoId: video.youtube_video_id,
        section: (video.channels.kind === "small" ? "small" : video.caption_status === "ok" ? "main" : "unverified") as SearchResultItem["section"],
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

      let metadata = findMetadataMatch({ title: video.title, tags: video.tags ?? [], description: video.description }, keywords);
      if (!metadata && fallbackMeta?.has(video.id)) {
        // 제목·태그·저장된 설명 앞부분에는 없고, 설명의 뒷부분에만 키워드가 있는 경우
        const metaText = fallbackMeta.get(video.id) ?? "";
        const matchedKeywords = keywords.filter((keyword) => {
          const needle = normalizeText(keyword);
          return needle.length > 0 && metaText.includes(needle);
        });
        if (matchedKeywords.length > 0) metadata = { matchedKeywords, matchedIn: ["설명"] };
      }
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

// 결과를 만든 뒤, 건수에는 세어졌는데 카드가 만들어지지 않은 영상(설명 뒷부분에만 키워드가 있는 영상)을 찾아 채운다.
async function toItemsComplete(
  db: SupabaseClient,
  videos: VideoRow[],
  segmentsById: Map<number, TranscriptSegment[]>,
  keywords: string[],
): Promise<SearchResultItem[]> {
  const first = toItems(videos, segmentsById, keywords);
  if (first.length === videos.length) return first;

  const have = new Set(first.map((item) => item.videoId));
  const missing = videos.filter((video) => !have.has(video.youtube_video_id));
  const { data, error } = await db.from("videos").select("id, meta_text").in("id", missing.map((video) => video.id));
  if (error) throw new Error(`영상 검색용 글 읽기 실패: ${error.message}`);
  const meta = new Map(((data ?? []) as { id: number; meta_text: string | null }[]).map((row) => [row.id, row.meta_text ?? ""]));

  const extra = new Map(toItems(missing, segmentsById, keywords, meta).map((item) => [item.videoId, item]));
  const firstById = new Map(first.map((item) => [item.videoId, item]));
  return videos.flatMap((video) => {
    const item = firstById.get(video.youtube_video_id) ?? extra.get(video.youtube_video_id);
    return item ? [item] : [];
  });
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

