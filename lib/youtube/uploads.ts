// Design Ref: §9 — 채널의 업로드 목록을 공식 YouTube Data API로 가져온다. 유튜브 접속은 수집 스크립트에서만 쓴다.
// 채널의 업로드 목록은 채널 ID의 앞 두 글자 "UC"를 "UU"로 바꾼 재생목록이다. 호출 한 번에 1단위만 쓴다.

export type UploadedVideo = {
  videoId: string;
  title: string;
  /** 업로드 시각 (ISO 문자열) */
  publishedAt: string;
};

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: {
    snippet?: { title?: string };
    contentDetails?: { videoId?: string; videoPublishedAt?: string };
  }[];
  error?: { message?: string; errors?: { reason?: string }[] };
};

const PAGE_SIZE = 50;
// 하루에 영상을 아주 많이 올리는 채널도 있어서 쪽을 넘겨 가며 가져오되, 끝없이 가지 않게 상한을 둔다.
const MAX_PAGES = 10;

/**
 * 채널의 업로드를 최신순으로 가져온다. `since` 이후에 올라온 영상까지만 가져오고, 더 오래된 영상이 나오면 멈춘다.
 * 실패하면 오류를 던진다. 키가 드러나지 않게 주소는 오류에 넣지 않는다.
 */
export async function fetchRecentUploads(channelId: string, since: Date): Promise<UploadedVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error(".env에 YOUTUBE_API_KEY가 필요합니다.");
  if (!channelId.startsWith("UC")) throw new Error("채널 ID는 UC로 시작해야 합니다.");

  const videos: UploadedVideo[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", `UU${channelId.slice(2)}`);
    url.searchParams.set("maxResults", String(PAGE_SIZE));
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url);
    const body = (await response.json().catch(() => ({}))) as PlaylistItemsResponse;
    if (!response.ok) {
      const reason = body.error?.errors?.[0]?.reason ?? body.error?.message ?? "알 수 없음";
      throw new Error(`유튜브 API 오류 (상태 ${response.status}, 이유 ${reason})`);
    }

    let reachedOld = false;
    for (const item of body.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      const title = item.snippet?.title;
      const publishedAt = item.contentDetails?.videoPublishedAt;
      // 비공개·삭제된 영상은 업로드 시각이 없거나 제목이 정해진 문구다.
      if (!videoId || !title || !publishedAt) continue;
      if (title === "Private video" || title === "Deleted video") continue;
      if (new Date(publishedAt) < since) {
        reachedOld = true;
        continue;
      }
      videos.push({ videoId, title, publishedAt });
    }

    pageToken = body.nextPageToken;
    if (reachedOld || !pageToken) break;
  }
  return videos;
}
