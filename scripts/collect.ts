// 수집 스크립트: 담당자 PC에서 `npm run collect`로 실행한다. (Design Ref: §2 수집 분리형)
// 순서: 채널 저장 → 14일 지난 영상 삭제 → 채널별 새 영상 목록 저장 → 새 영상 자막 저장.

import { getDb } from "../lib/db/client";
import { RETENTION_DAYS } from "../lib/search/constants";
import { buildMetaText, findMetadataMatch } from "../lib/search/metadata";
import { normalizeText } from "../lib/search/normalize";
import { MAX_KEYWORD_LENGTH, MAX_KEYWORDS } from "../lib/search/validate";
import { fetchVideoDetails, searchRecentVideoIds, type DiscoveredVideo } from "../lib/youtube/discover";
import { fetchKoreanTranscript } from "../lib/youtube/transcript";
import { fetchRecentUploads } from "../lib/youtube/uploads";
import { MAIN_CHANNELS } from "./main-channels";

const DAY_MS = 24 * 60 * 60 * 1000;
// 유튜브가 막지 않도록 영상 사이에 쉬는 시간을 둔다.
const REQUEST_DELAY_MS = 600;
const MAX_FAILED_IN_ROW = 8;
const PAGE_ROWS = 1000;
// 키워드 하나당 유튜브 검색으로 찾을 영상 수 (호출 2번 = 200단위). 하루 한도는 10,000단위다.
const MAX_SEARCH_RESULTS = 100;
// 설명은 앞부분만 저장한다. (아주 긴 설명이 DB를 키우는 것을 막는다)
const MAX_DESCRIPTION_LENGTH = 2000;

async function saveMainChannels(): Promise<void> {
  const db = getDb();
  const rows = MAIN_CHANNELS.map((channel) => ({
    youtube_channel_id: channel.youtubeChannelId,
    name: channel.name,
    kind: "main",
  }));
  // 이미 있는 채널은 건드리지 않는다. (화면에서 바꾼 이름이나 비활성 상태를 보존)
  const { error } = await db
    .from("channels")
    .upsert(rows, { onConflict: "youtube_channel_id", ignoreDuplicates: true });
  if (error) throw new Error(`채널 저장 실패: ${error.message}`);
}

async function collectVideoLists(): Promise<void> {
  const db = getDb();
  const { data: channels, error } = await db
    .from("channels")
    .select("id, name, youtube_channel_id")
    .eq("kind", "main") // 그 밖의 채널은 전체 영상을 받지 않고 키워드 검색으로 찾은 영상만 저장한다.
    .eq("active", true);
  if (error) throw new Error(`채널 목록 읽기 실패: ${error.message}`);

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const failed: string[] = [];
  let totalNew = 0;

  for (const channel of channels ?? []) {
    try {
      const recent = await fetchRecentUploads(channel.youtube_channel_id, new Date(cutoff));

      if (recent.length > 0) {
        const { data: inserted, error: insertError } = await db
          .from("videos")
          .upsert(
            recent.map((video) => ({
              youtube_video_id: video.videoId,
              channel_id: channel.id,
              title: video.title,
              uploaded_at: video.publishedAt,
            })),
            { onConflict: "youtube_video_id", ignoreDuplicates: true },
          )
          .select("id");
        if (insertError) throw new Error(insertError.message);
        totalNew += inserted?.length ?? 0;
        console.log(`${channel.name}: 최근 ${RETENTION_DAYS}일 영상 ${recent.length}개 (새로 저장 ${inserted?.length ?? 0}개)`);
      } else {
        console.log(`${channel.name}: 최근 ${RETENTION_DAYS}일 영상 없음`);
      }

      await db
        .from("channels")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", channel.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failed.push(channel.name);
      console.error(`${channel.name}: 확인하지 못함 (${message})`);
    }
  }

  console.log(`\n새로 저장한 영상: ${totalNew}개`);
  if (failed.length > 0) console.log(`확인하지 못한 채널 ${failed.length}개: ${failed.join(", ")}`);
}

// 업로드 14일이 지난 영상을 지운다. transcripts는 videos를 따라 함께 지워진다. (PRD: 14일 지난 자막 삭제)
async function deleteExpiredVideos(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getDb().from("videos").delete().lt("uploaded_at", cutoff).select("id");
  if (error) throw new Error(`오래된 영상 삭제 실패: ${error.message}`);
  console.log(`14일이 지나 삭제한 영상: ${data?.length ?? 0}개`);
}

type VideoToCheck = { id: string; youtube_video_id: string };

// 자막을 가져올 영상: 아직 확인 안 한 영상 + 올린 지 24시간 안에 자막이 없던 영상(늦게 생기는 자막 재확인)
async function findVideosToCheck(): Promise<VideoToCheck[]> {
  const db = getDb();
  // Supabase는 한 번에 1,000행까지만 돌려주므로 쪽을 나눠 모두 읽는다.
  const pending: VideoToCheck[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await db
      .from("videos")
      .select("id, youtube_video_id")
      .eq("caption_status", "pending")
      .order("uploaded_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`자막 확인할 영상 읽기 실패: ${error.message}`);
    pending.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_ROWS) break;
  }

  const recentSince = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: none, error: noneError } = await db
    .from("videos")
    .select("id, youtube_video_id, uploaded_at, caption_checked_at")
    .eq("caption_status", "none")
    .gte("uploaded_at", recentSince);
  if (noneError) throw new Error(`자막 재확인할 영상 읽기 실패: ${noneError.message}`);

  const recheck = (none ?? []).filter(
    (v) => !v.caption_checked_at || new Date(v.caption_checked_at).getTime() - new Date(v.uploaded_at).getTime() < DAY_MS,
  );
  return [...pending, ...recheck];
}

// 자막을 하나씩 가져와 저장한다. limit이 있으면 그 개수까지만 하고, 중단돼도 다음에 이어서 한다.
async function collectTranscripts(limit: number | undefined): Promise<void> {
  const db = getDb();
  const all = await findVideosToCheck();
  const targets = limit ? all.slice(0, limit) : all;
  console.log(`\n자막 확인할 영상: ${all.length}개 (이번에 처리 ${targets.length}개)`);

  let saved = 0;
  let none = 0;
  let failedInRow = 0;
  let failedTotal = 0;

  for (const [index, video] of targets.entries()) {
    try {
      const result = await fetchKoreanTranscript(video.youtube_video_id);
      if (result.status === "ok") {
        const { error } = await db.from("transcripts").upsert({
          video_id: video.id,
          segments: result.segments,
          normalized_text: normalizeText(result.segments.map((s) => s.text).join(" ")),
        });
        if (error) throw new Error(error.message);
        saved++;
      } else {
        none++;
      }
      await db
        .from("videos")
        .update({ caption_status: result.status, caption_checked_at: new Date().toISOString() })
        .eq("id", video.id);
      failedInRow = 0;
    } catch (e) {
      // 일시적 실패는 pending으로 남겨 다음 실행 때 다시 한다.
      failedInRow++;
      failedTotal++;
      console.error(`${video.youtube_video_id}: 자막을 가져오지 못함 (${e instanceof Error ? e.message : String(e)})`);
      // 연달아 실패하면 접속이 막힌 것으로 보고 멈춘다.
      if (failedInRow >= MAX_FAILED_IN_ROW) {
        console.error(`연속 ${MAX_FAILED_IN_ROW}번 실패해서 멈춥니다. 잠시 뒤 다시 실행하세요.`);
        break;
      }
    }
    if ((index + 1) % 50 === 0) console.log(`  진행 ${index + 1}/${targets.length} (저장 ${saved}, 자막 없음 ${none}, 실패 ${failedTotal})`);
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }

  console.log(`자막 저장 ${saved}개, 자막 없음 ${none}개, 실패 ${failedTotal}개`);
}

// 키워드마다 유튜브를 검색해, 24개 채널이 아닌 채널의 영상 중 제목·태그·설명에 키워드가 있는 영상을 저장한다. (PLAN 9번)
// 새 영상만 저장하고, 저장된 영상은 다시 가져오지 않는다. 검색은 키워드당 최대 200단위(하루 한도 10,000)를 쓴다.
async function discoverOtherChannels(newKeywords: string[]): Promise<void> {
  const db = getDb();

  if (newKeywords.length > 0) {
    const { error } = await db
      .from("keywords")
      .upsert(newKeywords.map((text) => ({ text })), { onConflict: "text", ignoreDuplicates: true });
    if (error) throw new Error(`키워드 저장 실패: ${error.message}`);
  }

  const { data: keywordRows, error: keywordError } = await db.from("keywords").select("id, text");
  if (keywordError) throw new Error(`키워드 읽기 실패: ${keywordError.message}`);
  const keywords = (keywordRows ?? []) as { id: string; text: string }[];
  if (keywords.length === 0) {
    console.log("\n등록된 키워드가 없어 그 밖의 채널 검색은 건너뜁니다. (--keywords 금리,환율 로 등록)");
    return;
  }

  const { data: mainRows, error: mainError } = await db.from("channels").select("youtube_channel_id").eq("kind", "main");
  if (mainError) throw new Error(`채널 읽기 실패: ${mainError.message}`);
  const mainChannelIds = new Set((mainRows ?? []).map((row: { youtube_channel_id: string }) => row.youtube_channel_id));

  const since = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
  let totalSaved = 0;
  const failed: string[] = [];

  for (const keyword of keywords) {
    try {
      const foundIds = await searchRecentVideoIds(keyword.text, since, MAX_SEARCH_RESULTS);
      const existing = await findStoredVideoIds(foundIds);
      const details = await fetchVideoDetails(foundIds.filter((id) => !existing.has(id)));

      // 키워드가 제목·태그·설명에 실제로 있고, 24개 채널이 아니며, 14일 안에 올라온 영상만 남긴다.
      const keep = details.filter(
        (video) =>
          !mainChannelIds.has(video.channelId) &&
          new Date(video.publishedAt) >= since &&
          findMetadataMatch(video, [keyword.text]) !== null,
      );
      const saved = await saveDiscoveredVideos(keep);
      totalSaved += saved;
      await db.from("keywords").update({ last_collected_at: new Date().toISOString() }).eq("id", keyword.id);
      console.log(`"${keyword.text}": 검색 ${foundIds.length}개, 이미 저장됨 ${existing.size}개, 새로 저장 ${saved}개`);
    } catch (e) {
      failed.push(keyword.text);
      console.error(`"${keyword.text}": 검색하지 못함 (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  console.log(`\n그 밖의 채널에서 새로 저장한 영상: ${totalSaved}개`);
  if (failed.length > 0) console.log(`검색하지 못한 키워드 ${failed.length}개: ${failed.join(", ")}`);
}

async function findStoredVideoIds(videoIds: string[]): Promise<Set<string>> {
  const stored = new Set<string>();
  for (let i = 0; i < videoIds.length; i += 100) {
    const { data, error } = await getDb()
      .from("videos")
      .select("youtube_video_id")
      .in("youtube_video_id", videoIds.slice(i, i + 100));
    if (error) throw new Error(`저장된 영상 확인 실패: ${error.message}`);
    for (const row of (data ?? []) as { youtube_video_id: string }[]) stored.add(row.youtube_video_id);
  }
  return stored;
}

// 채널(kind small)을 먼저 저장하고, 영상을 제목·태그·설명·검색용 글과 함께 저장한다. 자막은 확인하지 않은 상태(none)다.
async function saveDiscoveredVideos(videos: DiscoveredVideo[]): Promise<number> {
  if (videos.length === 0) return 0;
  const db = getDb();

  const channelRows = [...new Map(videos.map((video) => [video.channelId, video.channelTitle])).entries()].map(
    ([youtubeChannelId, name]) => ({ youtube_channel_id: youtubeChannelId, name: name || youtubeChannelId, kind: "small" }),
  );
  // 이미 있는 채널은 건드리지 않는다. (24개 채널이나 이름을 바꾼 채널 보존)
  const { error: channelError } = await db
    .from("channels")
    .upsert(channelRows, { onConflict: "youtube_channel_id", ignoreDuplicates: true });
  if (channelError) throw new Error(`채널 저장 실패: ${channelError.message}`);

  const { data: channels, error: readError } = await db
    .from("channels")
    .select("id, youtube_channel_id")
    .in("youtube_channel_id", channelRows.map((row) => row.youtube_channel_id));
  if (readError) throw new Error(`채널 읽기 실패: ${readError.message}`);
  const channelIdByYoutubeId = new Map(
    (channels ?? []).map((row: { id: string; youtube_channel_id: string }) => [row.youtube_channel_id, row.id]),
  );

  const now = new Date().toISOString();
  const rows = videos.flatMap((video) => {
    const channelId = channelIdByYoutubeId.get(video.channelId);
    if (!channelId) return [];
    return [
      {
        youtube_video_id: video.videoId,
        channel_id: channelId,
        title: video.title,
        uploaded_at: video.publishedAt,
        is_short: video.isShort,
        tags: video.tags,
        description: video.description.slice(0, MAX_DESCRIPTION_LENGTH),
        meta_text: buildMetaText({ title: video.title, tags: video.tags, description: video.description }),
        caption_status: "none",
        caption_checked_at: now,
      },
    ];
  });

  const { data, error } = await db
    .from("videos")
    .upsert(rows, { onConflict: "youtube_video_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`영상 저장 실패: ${error.message}`);
  return data?.length ?? 0;
}

// 사용법: npm run collect                          (전체)
//         npm run collect -- --limit 20            (자막은 20개까지만, 시험용)
//         npm run collect -- --keywords 금리,환율   (키워드를 등록하고 그 밖의 채널 검색까지)
type CollectOptions = { limit: number | undefined; keywords: string[] };

function readOptions(): CollectOptions {
  const valueOf = (flag: string): string | undefined => {
    const index = process.argv.indexOf(flag);
    return index === -1 ? undefined : process.argv[index + 1];
  };

  let limit: number | undefined;
  const limitText = valueOf("--limit");
  if (limitText !== undefined) {
    limit = Number(limitText);
    if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit 뒤에는 1 이상의 정수를 적어 주세요.");
  }

  const keywords = (valueOf("--keywords") ?? "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
  if (keywords.length > MAX_KEYWORDS) throw new Error(`--keywords는 ${MAX_KEYWORDS}개까지 적을 수 있습니다.`);
  if (keywords.some((keyword) => keyword.length > MAX_KEYWORD_LENGTH)) {
    throw new Error(`키워드는 ${MAX_KEYWORD_LENGTH}자까지 적을 수 있습니다.`);
  }
  return { limit, keywords };
}

async function main(): Promise<void> {
  const { limit, keywords } = readOptions();
  await saveMainChannels();
  await deleteExpiredVideos();
  await collectVideoLists();
  await discoverOtherChannels(keywords);
  await collectTranscripts(limit);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
