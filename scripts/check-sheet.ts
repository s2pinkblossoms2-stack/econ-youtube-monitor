// 담당자 확인표 만들기: `npm run check-sheet -- 금리`
// 24개 주요 채널 영상 중 세 묶음을 무작위로 골라 확인표(담당자용)와 정답표(앱의 판정)를 만든다.
//   A: 앱이 자막에서 키워드를 찾은 영상          → 담당자가 "언급함"이면 앱이 맞은 것
//   B: 제목·태그·설명에만 키워드가 있는 영상     → 담당자가 "언급함"이면 자동 자막이 놓친 것(자막 오인식 등)
//   C: 앱이 아무 데서도 못 찾은 영상             → 담당자가 "언급안함"이면 앱이 맞은 것
// 담당자가 앱의 판정에 영향을 받지 않게, 확인표에는 영상 링크만 넣는다. (PLAN 13번, 성공 기준 2)

import { mkdirSync, writeFileSync } from "node:fs";
import { getDb } from "../lib/db/client";
import { buildVideoMentions } from "../lib/search/excerpts";
import { RETENTION_DAYS } from "../lib/search/constants";
import { videoUrl } from "../lib/search/links";
import { normalizeText } from "../lib/search/normalize";
import { MAX_KEYWORD_LENGTH } from "../lib/search/validate";
import type { TranscriptSegment } from "../lib/youtube/transcript";

const PER_GROUP = 8;
const SEED = 20261102;

type VideoRow = {
  id: number;
  youtube_video_id: string;
  title: string;
  uploaded_at: string;
  channels: { name: string };
};

// 같은 시드면 항상 같은 순서가 나오는 간단한 난수 (mulberry32)
function makeRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

async function readAll<T>(readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await readPage(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

async function main(): Promise<void> {
  const keyword = (process.argv[2] ?? "").trim();
  if (keyword.length === 0 || keyword.length > MAX_KEYWORD_LENGTH) throw new Error("사용법: npm run check-sheet -- 금리");
  const needle = normalizeText(keyword);
  const pattern = `%${needle.replace(/[\\%_]/g, "\\$&")}%`;
  const db = getDb();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();

  // 24개 주요 채널의 자막이 있는 영상 전체
  const videos = await readAll<VideoRow>((from, to) =>
    db
      .from("videos")
      .select("id, youtube_video_id, title, uploaded_at, channels!inner(name)")
      .eq("channels.kind", "main")
      .eq("caption_status", "ok")
      .gte("uploaded_at", cutoff)
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: VideoRow[] | null; error: { message: string } | null }>,
  );

  const inTranscript = new Set(
    (
      await readAll<{ video_id: number }>((from, to) =>
        db.from("transcripts").select("video_id").ilike("normalized_text", pattern).order("video_id").range(from, to) as unknown as PromiseLike<{
          data: { video_id: number }[] | null;
          error: { message: string } | null;
        }>,
      )
    ).map((row) => row.video_id),
  );
  const inMeta = new Set(
    (
      await readAll<{ id: number }>((from, to) =>
        db.from("videos").select("id").ilike("meta_text", pattern).gte("uploaded_at", cutoff).order("id").range(from, to) as unknown as PromiseLike<{
          data: { id: number }[] | null;
          error: { message: string } | null;
        }>,
      )
    ).map((row) => row.id),
  );

  const random = makeRandom(SEED);
  const groupA = shuffle(videos.filter((v) => inTranscript.has(v.id)), random).slice(0, PER_GROUP);
  const groupB = shuffle(videos.filter((v) => !inTranscript.has(v.id) && inMeta.has(v.id)), random).slice(0, PER_GROUP);
  const groupC = shuffle(videos.filter((v) => !inTranscript.has(v.id) && !inMeta.has(v.id)), random).slice(0, PER_GROUP);

  const labeled = [
    ...groupA.map((video) => ({ video, group: "A" as const })),
    ...groupB.map((video) => ({ video, group: "B" as const })),
    ...groupC.map((video) => ({ video, group: "C" as const })),
  ];
  const ordered = shuffle(labeled, random); // 담당자가 묶음을 짐작하지 못하게 섞는다

  const sheet = [csvLine(["번호", "채널", "영상 제목", "업로드일", "영상 링크", `"${keyword}"을(를) 말로 했나요? (언급함 / 언급안함)`, "메모"])];
  const key = [csvLine(["번호", "앱 판정", "앱이 찾은 시점 링크", "앱이 보여준 구절 앞부분"])];

  for (const [index, { video, group }] of ordered.entries()) {
    const number = index + 1;
    sheet.push(
      csvLine([number, video.channels.name, video.title, video.uploaded_at.slice(0, 10), videoUrl(video.youtube_video_id), "", ""]),
    );

    let verdict = "";
    let at = "";
    let excerpt = "";
    if (group === "A") {
      const { data } = await db.from("transcripts").select("segments").eq("video_id", video.id).maybeSingle();
      const found = data ? buildVideoMentions(video.youtube_video_id, (data as { segments: TranscriptSegment[] }).segments, [keyword]) : null;
      verdict = "A 자막에서 찾음";
      at = found?.mentions[0]?.url ?? "";
      excerpt = (found?.mentions[0]?.text ?? "").slice(0, 80);
    } else if (group === "B") {
      verdict = "B 제목·태그·설명에만 있음(자막에서는 못 찾음)";
    } else {
      verdict = "C 못 찾음";
    }
    key.push(csvLine([number, verdict, at, excerpt]));
  }

  mkdirSync("check", { recursive: true });
  // 엑셀에서 한글이 깨지지 않게 BOM을 붙인다.
  writeFileSync(`check/확인표_${keyword}.csv`, "﻿" + sheet.join("\r\n") + "\r\n", "utf8");
  writeFileSync(`check/정답표_${keyword}.csv`, "﻿" + key.join("\r\n") + "\r\n", "utf8");
  // 묶음별 전체 영상 수. 정확도를 전체 기준으로 추정할 때 쓴다. (scripts/check-accuracy.ts)
  const population = {
    A: videos.filter((v) => inTranscript.has(v.id)).length,
    B: videos.filter((v) => !inTranscript.has(v.id) && inMeta.has(v.id)).length,
    C: videos.filter((v) => !inTranscript.has(v.id) && !inMeta.has(v.id)).length,
  };
  writeFileSync(`check/정답표_${keyword}.meta.json`, JSON.stringify({ keyword, population }, null, 2), "utf8");
  console.log(
    `"${keyword}" 확인표 ${ordered.length}개 만듦 (A ${groupA.length}, B ${groupB.length}, C ${groupC.length}). 후보 수: A ${[...inTranscript].length}, 자막 있는 주요 채널 영상 ${videos.length}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
