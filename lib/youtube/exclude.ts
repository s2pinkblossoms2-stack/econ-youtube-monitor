// "그 밖의 채널"에서 뺄 영상: 메이저 방송국 콘텐츠와 뉴스 영상. (2026-11-03 담당자 요청)
// - 유튜브가 영상 분류를 "뉴스/정치"(25번)로 둔 영상
// - 이름이 방송사·뉴스 채널 목록에 있는 채널의 영상
// 24개 주요 채널에는 적용하지 않는다. 방송사 목록은 여기서 고친다.

/** 유튜브 영상 분류 "뉴스/정치" */
export const NEWS_CATEGORY_ID = "25";

// 띄어쓰기를 뺀 소문자 채널 이름에서 찾는다. 영문 이름은 다른 영문자 바로 뒤에 붙어 있으면 같은 이름으로 보지 않는다.
const BROADCASTER_NAMES = [
  "kbs", "mbc", "sbs", "jtbc", "ytn", "ebs", "tbs", "cbs", "mbn", "tvn", "mtn", "tv조선", "채널a", "연합뉴스", "뉴스1",
  "한국경제tv", "매일경제tv", "서울경제tv", "이데일리tv", "머니투데이방송", "아리랑tv", "ocn", "jtbc news",
  "kbs news", "mbcnews", "sbsnews", "sbs biz",
].map((name) => name.replace(/\s+/g, ""));

const BROADCASTER_PATTERN = new RegExp(`(?<![a-z])(?:${BROADCASTER_NAMES.join("|")})`);

export function isBroadcasterChannel(channelName: string): boolean {
  return BROADCASTER_PATTERN.test(channelName.replace(/\s+/g, "").toLowerCase());
}

/** 그 밖의 채널 영상 중 뺄 영상인지 */
export function isExcludedOtherVideo(video: { categoryId?: string | null; channelTitle: string }): boolean {
  return video.categoryId === NEWS_CATEGORY_ID || isBroadcasterChannel(video.channelTitle);
}
