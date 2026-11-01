// Design Ref: §7, 보안 점검 SEC-001 — 채널 관리 화면과 쓰기 API는 팀 공용 비밀번호(Basic 인증)로 막는다.
// 사용자 계정·로그인 관리는 만들지 않는다. 비밀번호는 .env의 ADMIN_PASSWORD 하나뿐이다. (사용자 이름 칸은 무시한다)

import { createHash, timingSafeEqual } from "node:crypto";

/** `Authorization: Basic …` 헤더의 비밀번호가 맞으면 true. 비밀번호 비교는 시간차 공격을 막는 방식으로 한다. */
export function isAuthorized(authorizationHeader: string | null, password: string): boolean {
  if (!authorizationHeader?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(authorizationHeader.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  const given = decoded.slice(separator + 1);

  // 길이가 달라도 같은 시간이 걸리게 해시 값끼리 비교한다.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}

/** 쓰기 요청(POST·PATCH 등)이 이 사이트 화면에서 온 것인지 확인한다. 다른 사이트가 대신 보내는 요청(CSRF)을 막는다. */
export function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
