// Design Ref: §4.1 — PATCH /api/channels/[id] {"active": true|false}: 채널을 끄거나 켠다.
// 지우지 않고 비활성화만 한다. 영상·자막은 남고 검색 결과와 다음 수집에서만 빠진다. (담당자 결정 2026-11-01)

import { getDb } from "@/lib/db/client";
import { MAX_ACTIVE_MAIN_CHANNELS } from "@/lib/admin/channel-input";

const HEADERS = { "Cache-Control": "no-store" };

function fail(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: HEADERS });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{1,15}$/.test(id)) return fail("채널 번호가 올바르지 않습니다.", 400);

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return fail("요청 형식이 올바르지 않습니다.", 415);
  }
  const body: unknown = await request.json().catch(() => null);
  const active = typeof body === "object" && body !== null ? (body as { active?: unknown }).active : undefined;
  if (typeof active !== "boolean") return fail("active는 true 또는 false여야 합니다.", 400);

  const db = getDb();
  try {
    if (active) {
      const { count, error } = await db
        .from("channels")
        .select("id", { count: "exact", head: true })
        .eq("kind", "main")
        .eq("active", true);
      if (error) throw new Error(error.message);
      if ((count ?? 0) >= MAX_ACTIVE_MAIN_CHANNELS) {
        return fail(`사용 중인 채널은 ${MAX_ACTIVE_MAIN_CHANNELS}개까지 둘 수 있습니다.`, 409);
      }
    }

    // 24개 주요 채널(kind main)만 바꿀 수 있다.
    const { data, error } = await db
      .from("channels")
      .update({ active })
      .eq("id", Number(id))
      .eq("kind", "main")
      .select("id, youtube_channel_id, name, active, last_checked_at");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return fail("해당 채널을 찾지 못했습니다.", 404);
    return Response.json({ channel: data[0] }, { headers: HEADERS });
  } catch (e) {
    console.error("채널 상태 변경 실패:", e instanceof Error ? e.message : "알 수 없는 오류");
    return fail("잠시 후 다시 시도해 주세요.", 503);
  }
}
