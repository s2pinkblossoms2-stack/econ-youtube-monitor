// Design Ref: §4.1 — GET /api/keywords (저장한 키워드 목록), POST /api/keywords (키워드 저장)
// 담당팀이 무엇을 살펴보는지 드러나는 목록이라 proxy.ts가 팀 공용 비밀번호로 막는다. (보안 점검 SEC-003)
// 저장한 키워드는 다음 수집(npm run collect)부터 그 밖의 채널 영상을 찾는 데 쓰인다.

import { getDb } from "@/lib/db/client";
import { MAX_SAVED_KEYWORDS, parseKeywordText } from "@/lib/admin/keyword-input";
import { normalizeText } from "@/lib/search/normalize";

const HEADERS = { "Cache-Control": "no-store" };

type KeywordRow = { id: number; text: string; created_at: string; last_collected_at: string | null };

function fail(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: HEADERS });
}

export async function GET(): Promise<Response> {
  const { data, error } = await getDb()
    .from("keywords")
    .select("id, text, created_at, last_collected_at")
    .order("created_at");
  if (error) {
    console.error("키워드 목록 읽기 실패:", error.message);
    return fail("잠시 후 다시 시도해 주세요.", 503);
  }
  return Response.json({ keywords: data ?? [], max: MAX_SAVED_KEYWORDS }, { headers: HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return fail("요청 형식이 올바르지 않습니다.", 415);
  }
  const body: unknown = await request.json().catch(() => null);
  const raw = typeof body === "object" && body !== null ? (body as { text?: unknown }).text : undefined;
  const text = typeof raw === "string" ? parseKeywordText(raw) : null;
  if (!text) return fail("키워드는 1~50자로, 쉼표와 * 없이 입력해 주세요.", 400);

  const db = getDb();
  try {
    const { data, error: readError } = await db.from("keywords").select("id, text, created_at, last_collected_at");
    if (readError) throw new Error(readError.message);
    const saved = (data ?? []) as KeywordRow[];

    // 띄어쓰기·대소문자만 다른 같은 키워드는 한 번만 저장한다.
    if (saved.some((row) => normalizeText(row.text) === normalizeText(text))) {
      return fail("이미 저장된 키워드입니다.", 409);
    }
    if (saved.length >= MAX_SAVED_KEYWORDS) {
      return fail(`키워드는 ${MAX_SAVED_KEYWORDS}개까지 저장할 수 있습니다. 쓰지 않는 키워드를 먼저 지우세요.`, 409);
    }

    const { data: created, error } = await db
      .from("keywords")
      .insert({ text })
      .select("id, text, created_at, last_collected_at")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ keyword: created }, { status: 201, headers: HEADERS });
  } catch (e) {
    console.error("키워드 저장 실패:", e instanceof Error ? e.message : "알 수 없는 오류");
    return fail("잠시 후 다시 시도해 주세요.", 503);
  }
}
