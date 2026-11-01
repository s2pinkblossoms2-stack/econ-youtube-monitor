// Design Ref: §9 — 키워드로 유튜브를 검색해 24개 채널이 아닌 채널의 영상을 찾는다. 유튜브 접속은 수집 스크립트에서만 쓴다.
// 공식 YouTube Data API만 쓴다. search.list는 호출 한 번에 100단위(하루 한도 10,000), videos.list는 1단위다.

export type DiscoveredVideo = {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  channelId: string;
  channelTitle: string;
  /** 업로드 시각 (ISO 문자열) */
  publishedAt: string;
  isShort: boolean;
};

type ApiError = { error?: { message?: string; errors?: { reason?: string }[] } };

type SearchResponse = ApiError & {
  nextPageToken?: string;
  items?: { id?: { videoId?: string } }[];
};

type VideosResponse = ApiError & {
  items?: {
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      tags?: string[];
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      liveBroadcastContent?: string;
    };
    contentDetails?: { duration?: string };
  }[];
};

const SEARCH_PAGE_SIZE = 50;
const DETAILS_CHUNK = 50;
const SHORT_MAX_SECONDS = 60;

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error(".env에 YOUTUBE_API_KEY가 필요합니다.");
  return key;
}

// 키가 든 주소는 오류에 넣지 않는다. 한도 초과 같은 이유만 알려준다.
async function callApi<T extends ApiError>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("key", apiKey());

  const response = await fetch(url);
  const body = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const reason = body.error?.errors?.[0]?.reason ?? body.error?.message ?? "알 수 없음";
    throw new Error(`유튜브 API 오류 (${path}, 상태 ${response.status}, 이유 ${reason})`);
  }
  return body;
}

/**
 * 키워드로 `since` 이후 올라온 영상을 검색해 영상 ID를 돌려준다. (관련도 순, 최대 maxResults개)
 * 호출 한 번(50개)에 100단위를 쓰므로 maxResults 100이면 최대 200단위다.
 */
export async function searchRecentVideoIds(keyword: string, since: Date, maxResults: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < maxResults) {
    const params: Record<string, string> = {
      part: "id",
      type: "video",
      q: keyword,
      publishedAfter: since.toISOString(),
      maxResults: String(Math.min(SEARCH_PAGE_SIZE, maxResults - ids.length)),
      relevanceLanguage: "ko",
      regionCode: "KR",
    };
    if (pageToken) params.pageToken = pageToken;

    const body = await callApi<SearchResponse>("search", params);
    for (const item of body.items ?? []) {
      if (item.id?.videoId) ids.push(item.id.videoId);
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}

/** 영상 ID들의 제목·설명·태그·채널·업로드 시각을 가져온다. (50개씩, 호출당 1단위) 예정·생방송 대기 영상은 뺀다. */
export async function fetchVideoDetails(videoIds: string[]): Promise<DiscoveredVideo[]> {
  const videos: DiscoveredVideo[] = [];
  for (let i = 0; i < videoIds.length; i += DETAILS_CHUNK) {
    const body = await callApi<VideosResponse>("videos", {
      part: "snippet,contentDetails",
      id: videoIds.slice(i, i + DETAILS_CHUNK).join(","),
    });
    for (const item of body.items ?? []) {
      const snippet = item.snippet;
      if (!item.id || !snippet?.title || !snippet.channelId || !snippet.publishedAt) continue;
      if (snippet.liveBroadcastContent === "upcoming") continue;
      videos.push({
        videoId: item.id,
        title: clean(snippet.title),
        description: clean(snippet.description ?? ""),
        tags: (snippet.tags ?? []).map(clean),
        channelId: snippet.channelId,
        channelTitle: clean(snippet.channelTitle ?? ""),
        publishedAt: snippet.publishedAt,
        isShort: parseDurationSeconds(item.contentDetails?.duration) <= SHORT_MAX_SECONDS,
      });
    }
  }
  return videos;
}

// 저장소(Postgres)는 널 문자(\u0000)와, 이모지의 반쪽만 남은 깨진 글자를 받지 못한다. 미리 뺀다.
function clean(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/** 글을 max자까지 자른다. 이모지 중간에서 잘려 깨진 글자가 남지 않게 한다. */
export function truncateText(text: string, max: number): string {
  return clean(text.slice(0, max));
}

// "PT1H2M3S" → 3723. 알 수 없으면 쇼츠로 오해하지 않게 아주 큰 값을 돌려준다.
function parseDurationSeconds(duration: string | undefined): number {
  const match = duration?.match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  // 생방송 등은 길이가 "P0D"처럼 와서 시·분·초가 모두 비어 있다.
  if (!match || !duration || (!match[1] && !match[2] && !match[3])) return Number.MAX_SAFE_INTEGER;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}
