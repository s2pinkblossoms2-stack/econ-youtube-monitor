// 수집 스크립트: 담당자 PC에서 `npm run collect`로 실행한다. (Design Ref: §2 수집 분리형)
// 순서: 채널 저장 → 14일 지난 영상 삭제 → 채널별 새 영상 목록 저장 → 새 영상 자막 저장.

import { getDb } from "../lib/db/client";
import { normalizeText } from "../lib/search/normalize";
import { fetchKoreanTranscript } from "../lib/youtube/transcript";
import { fetchRecentUploads } from "../lib/youtube/uploads";
import { MAIN_CHANNELS } from "./main-channels";

const RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
// 유튜브가 막지 않도록 영상 사이에 쉬는 시간을 둔다.
const REQUEST_DELAY_MS = 600;
const MAX_FAILED_IN_ROW = 8;
const PAGE_ROWS = 1000;

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

// 사용법: npm run collect            (전체)
//         npm run collect -- --limit 20   (자막은 20개까지만, 시험용)
function readLimit(): number | undefined {
  const index = process.argv.indexOf("--limit");
  if (index === -1) return undefined;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error("--limit 뒤에는 1 이상의 정수를 적어 주세요.");
  return value;
}

async function main(): Promise<void> {
  const limit = readLimit();
  await saveMainChannels();
  await deleteExpiredVideos();
  await collectVideoLists();
  await collectTranscripts(limit);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
