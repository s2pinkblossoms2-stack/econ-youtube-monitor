// 수집 스크립트: 담당자 PC에서 `npm run collect`로 실행한다. (Design Ref: §2 수집 분리형)
// 지금 단계(PLAN 3번): 24개 채널을 저장하고, 채널별로 최근 14일 영상 목록을 저장한다.
// 자막 수집과 14일 지난 영상 삭제는 PLAN 4번에서 붙인다.

import { getDb } from "../lib/db/client";
import { fetchChannelFeed } from "../lib/youtube/rss";
import { MAIN_CHANNELS } from "./main-channels";

const RETENTION_DAYS = 14;

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
      const feed = await fetchChannelFeed(channel.youtube_channel_id);
      const recent = feed.filter((video) => new Date(video.publishedAt).getTime() >= cutoff);

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

async function main(): Promise<void> {
  await saveMainChannels();
  await collectVideoLists();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
