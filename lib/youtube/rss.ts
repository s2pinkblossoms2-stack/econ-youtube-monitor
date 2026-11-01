// Design Ref: §9 — 채널 RSS로 최근 영상 목록을 가져온다. 유튜브 접속은 수집 스크립트에서만 쓴다. (API 키 불필요, 채널당 최근 15개)

export type FeedVideo = {
  videoId: string;
  title: string;
  /** 업로드 시각 (ISO 문자열) */
  publishedAt: string;
};

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (match) => XML_ENTITIES[match] ?? match);
}

function pick(entry: string, pattern: RegExp): string | undefined {
  return entry.match(pattern)?.[1];
}

/** 채널의 최근 영상 목록(최대 15개)을 가져온다. 접속에 실패하면 오류를 던진다. */
export async function fetchChannelFeed(channelId: string): Promise<FeedVideo[]> {
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!response.ok) {
    throw new Error(`채널 RSS를 가져오지 못했습니다 (상태 ${response.status})`);
  }

  const xml = await response.text();
  const videos: FeedVideo[] = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const videoId = pick(entry, /<yt:videoId>([^<]+)</);
    const title = pick(entry, /<title>([^<]*)</);
    const publishedAt = pick(entry, /<published>([^<]+)</);
    if (!videoId || !title || !publishedAt) continue;
    videos.push({ videoId, title: decodeXml(title), publishedAt });
  }
  return videos;
}
