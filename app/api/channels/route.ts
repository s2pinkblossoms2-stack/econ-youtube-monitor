// Design Ref: §4.1 — GET /api/channels (24개 주요 채널 목록), POST /api/channels (채널 추가)
// proxy.ts가 팀 공용 비밀번호로 이 경로를 막는다. 추가한 채널은 다음 수집(npm run collect)부터 영상·자막을 모은다.

import { getDb } from "@/lib/db/client";
import {
  MAX_ACTIVE_MAIN_CHANNELS,
  parseChannelId,
  parseChannelName,
} from "@/lib/admin/channel-input";

const HEADERS = { "Cache-Control": "no-store" };

type ChannelRow = {
  id: number;
  youtube_channel_id: string;
  name: string;
  kind: "main" | "small";
  active: boolean;
  last_checked_at: string | null;
};

function fail(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: HEADERS });
}

export async function GET(): Promise<Response> {
  const { data, error } = await getDb()
    .from("channels")
    .select("id, youtube_channel_id, name, active, last_checked_at")
    .eq("kind", "main")
    .order("name");
  if (error) {
    console.error("채널 목록 읽기 실패:", error.message);
    return fail("잠시 후 다시 시도해 주세요.", 503);
  }
  return Response.json({ channels: data ?? [], maxActive: MAX_ACTIVE_MAIN_CHANNELS }, { headers: HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return fail("요청 형식이 올바르지 않습니다.", 415);
  }
  const body: unknown = await request.json().catch(() => null);
  const input = (typeof body === "object" && body !== null ? body : {}) as { channel?: unknown; name?: unknown };

  const youtubeChannelId = typeof input.channel === "string" ? parseChannelId(input.channel) : null;
  if (!youtubeChannelId) {
    return fail("채널 ID(UC로 시작하는 24자) 또는 youtube.com/channel/UC… 주소를 입력해 주세요. @이름 주소는 쓸 수 없습니다.", 400);
  }
  const name = typeof input.name === "string" ? parseChannelName(input.name) : null;
  if (!name) return fail("채널 이름을 1~50자로 입력해 주세요.", 400);

  const db = getDb();
  try {
    const { count, error: countError } = await db
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("kind", "main")
      .eq("active", true);
    if (countError) throw new Error(countError.message);

    const { data: existing, error: readError } = await db
      .from("channels")
      .select("id, youtube_channel_id, name, kind, active, last_checked_at")
      .eq("youtube_channel_id", youtubeChannelId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    const found = existing as ChannelRow | null;

    if (found && found.kind === "main" && found.active) return fail("이미 사용 중인 채널입니다.", 409);
    if ((count ?? 0) >= MAX_ACTIVE_MAIN_CHANNELS) {
      return fail(`사용 중인 채널은 ${MAX_ACTIVE_MAIN_CHANNELS}개까지 둘 수 있습니다. 쓰지 않는 채널을 먼저 끄세요.`, 409);
    }

    if (found) {
      // 꺼 둔 채널이거나 키워드 검색으로 찾은 채널이면 24개 주요 채널로 켠다. (이름은 새로 입력한 값으로)
      const { data, error } = await db
        .from("channels")
        .update({ kind: "main", active: true, name })
        .eq("id", found.id)
        .select("id, youtube_channel_id, name, active, last_checked_at")
        .single();
      if (error) throw new Error(error.message);
      return Response.json({ channel: data }, { headers: HEADERS });
    }

    const { data, error } = await db
      .from("channels")
      .insert({ youtube_channel_id: youtubeChannelId, name, kind: "main", active: true })
      .select("id, youtube_channel_id, name, active, last_checked_at")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ channel: data }, { status: 201, headers: HEADERS });
  } catch (e) {
    // 저장소 오류 원문은 응답에 내보내지 않고 서버 로그에만 남긴다. (보안 점검 SEC-011)
    console.error("채널 추가 실패:", e instanceof Error ? e.message : "알 수 없는 오류");
    return fail("잠시 후 다시 시도해 주세요.", 503);
  }
}
