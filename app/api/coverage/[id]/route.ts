// GET /api/coverage/[id] — 한 채널의 최근 14일 영상 목록과 영상별 자막 확인 상태.
// status: ok(자막 확인 완료) / none(확인불가: 자막을 받지 못함) / pending(대기: 아직 확인 전)

import { getDb } from "@/lib/db/client";
import { RETENTION_DAYS } from "@/lib/search/constants";
import { videoUrl } from "@/lib/search/links";

const HEADERS = { "Cache-Control": "no-store" };

type VideoRow = { videoId: string; title: string; uploadedAt: string; status: "ok" | "none" | "pending"; isShort: boolean };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{1,15}$/.test(id)) return Response.json({ error: "채널 번호가 올바르지 않습니다." }, { status: 400, headers: HEADERS });

  const since = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getDb().rpc("channel_videos", { p_channel: Number(id), since });
  if (error) {
    console.error("채널 영상 목록 읽기 실패:", error.message);
    return Response.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 503, headers: HEADERS });
  }

  // 링크를 만들 수 없는 영상(잘못된 영상 ID)은 뺀다. 링크는 영상 ID로 서버에서 조립한다.
  const videos = ((data ?? []) as VideoRow[]).flatMap((video) => {
    try {
      return [{ ...video, url: videoUrl(video.videoId) }];
    } catch {
      return [];
    }
  });
  return Response.json({ videos }, { headers: HEADERS });
}
