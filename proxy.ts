// 채널 관리 화면(/channels), 채널 API(/api/channels), 키워드 API(/api/keywords)만 팀 공용 비밀번호로 막는다.
// (보안 점검 SEC-001·003) 검색 화면과 검색 API는 지금처럼 누구나 쓸 수 있다.

import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized, isSameOrigin } from "@/lib/admin/auth";

const SAFE_METHODS = new Set(["GET", "HEAD"]);

export function proxy(request: NextRequest): NextResponse {
  const password = process.env.ADMIN_PASSWORD;
  // 비밀번호를 정해 두지 않았다면 열어 두지 않고 막는다. (설정을 빠뜨려도 누구나 바꾸는 상태가 되지 않게)
  if (!password) {
    return new NextResponse("관리 비밀번호(ADMIN_PASSWORD)가 설정되지 않아 이 화면을 열 수 없습니다.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!isAuthorized(request.headers.get("authorization"), password)) {
    return new NextResponse("비밀번호가 필요합니다.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="channels", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    });
  }

  // Basic 인증은 브라우저가 자동으로 보내므로, 다른 사이트에서 몰래 보낸 쓰기 요청을 막는다.
  if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return new NextResponse("허용되지 않은 요청입니다.", { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/channels/:path*", "/api/channels/:path*", "/api/keywords/:path*"],
};
