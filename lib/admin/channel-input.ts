// Design Ref: §4.1, 보안 점검 SEC-004 — 채널 추가 입력 검사. 사용자가 준 주소를 서버가 가져오지 않고, 글자만 해석한다.

const CHANNEL_ID_PATTERN = /^UC[0-9A-Za-z_-]{22}$/;
const CHANNEL_URL_PATH = /^\/channel\/(UC[0-9A-Za-z_-]{22})\/?$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

export const MAX_CHANNEL_NAME_LENGTH = 50;
/** 사용 중인 24개 주요 채널(수집 대상)의 최대 개수. 유튜브 API 한도를 지키려는 상한이다. */
export const MAX_ACTIVE_MAIN_CHANNELS = 50;

/**
 * `UC…` 채널 ID이거나 `youtube.com/channel/UC…` 주소에서 채널 ID를 꺼낸다. 그 밖의 입력(@핸들, 다른 사이트 주소)은 null이다.
 * 주소로 접속하지 않으므로 서버가 임의의 주소를 요청하는 일(SSRF)이 없다.
 */
export function parseChannelId(input: string): string | null {
  const text = input.trim();
  if (CHANNEL_ID_PATTERN.test(text)) return text;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const match = CHANNEL_URL_PATH.exec(url.pathname);
  return match ? match[1] : null;
}

/** 채널 이름을 검사해 앞뒤 공백을 뺀 값을 돌려준다. 비었거나 너무 길거나 제어 문자가 있으면 null이다. */
export function parseChannelName(input: string): string | null {
  const name = input.trim();
  if (name.length === 0 || name.length > MAX_CHANNEL_NAME_LENGTH) return null;
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}
