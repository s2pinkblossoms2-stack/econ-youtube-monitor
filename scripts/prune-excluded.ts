// 이미 저장된 "그 밖의 채널" 영상 중 방송국·뉴스 영상(lib/youtube/exclude.ts)을 찾아 지운다.
// 기본은 목록만 보여주고(확인용), `--apply`를 붙여야 실제로 지운다. 영상을 지우면 자막도 함께 지워진다.
// 실행: npm run prune-excluded            (목록만)
//       npm run prune-excluded -- --apply (삭제)

import { getDb } from "../lib/db/client";
import { fetchVideoDetails } from "../lib/youtube/discover";
import { isExcludedOtherVideo } from "../lib/youtube/exclude";

const PAGE_ROWS = 1000;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  const rows: { id: string; youtube_video_id: string; title: string; channels: { name: string } }[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await db
      .from("videos")
      .select("id, youtube_video_id, title, channels!inner(name, kind)")
      .eq("channels.kind", "small")
      .order("id")
      .range(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`영상 읽기 실패: ${error.message}`);
    rows.push(...((data ?? []) as unknown as typeof rows));
    if ((data?.length ?? 0) < PAGE_ROWS) break;
  }

  const details = await fetchVideoDetails(rows.map((row) => row.youtube_video_id));
  const categoryById = new Map(details.map((video) => [video.videoId, video.categoryId]));
  const excluded = rows.filter((row) => isExcludedOtherVideo({ categoryId: categoryById.get(row.youtube_video_id), channelTitle: row.channels.name }));

  console.log(`그 밖의 채널 영상 ${rows.length}개 중 제외 대상 ${excluded.length}개`);
  for (const row of excluded.slice(0, 15)) console.log(`  - [${row.channels.name}] ${row.title.slice(0, 40)}`);
  if (!apply) {
    console.log("\n지우지 않았습니다. 지우려면 --apply를 붙이세요.");
    return;
  }

  for (let i = 0; i < excluded.length; i += 100) {
    const { error } = await db.from("videos").delete().in("id", excluded.slice(i, i + 100).map((row) => row.id));
    if (error) throw new Error(`영상 삭제 실패: ${error.message}`);
  }
  console.log(`영상 ${excluded.length}개를 지웠습니다.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
