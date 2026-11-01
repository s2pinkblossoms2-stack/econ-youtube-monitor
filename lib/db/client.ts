import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Design Ref: §3, §7 — 저장소는 서버 전용 키로만 접근한다. 브라우저 코드에서 이 파일을 가져오지 않는다.

let client: SupabaseClient | undefined;

/** 저장소(Supabase) 연결을 돌려준다. 처음 부를 때 한 번만 만든다. */
export function getDb(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(".env에 SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.");
  }

  client = createClient(url, secretKey, {
    auth: { persistSession: false },
  });
  return client;
}
