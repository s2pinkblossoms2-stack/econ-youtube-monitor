// Design Ref: §4.1 — DELETE /api/keywords/[id]: 저장한 키워드를 지운다. (이미 모은 영상은 그대로 남는다)

import { getDb } from "@/lib/db/client";

const HEADERS = { "Cache-Control": "no-store" };

function fail(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: HEADERS });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{1,15}$/.test(id)) return fail("키워드 번호가 올바르지 않습니다.", 400);

  const { data, error } = await getDb().from("keywords").delete().eq("id", Number(id)).select("id");
  if (error) {
    console.error("키워드 삭제 실패:", error.message);
    return fail("잠시 후 다시 시도해 주세요.", 503);
  }
  if (!data || data.length === 0) return fail("해당 키워드를 찾지 못했습니다.", 404);
  return Response.json({ deleted: Number(id) }, { headers: HEADERS });
}
