// 경제 관련 주요 유튜버 Top24. 수집 스크립트가 처음 실행될 때 channels 테이블에 넣는다.
// 채널 ID는 유튜브 검색 결과에서 찾았다. 확인이 필요한 채널은 note에 적어 둔다.

export type MainChannel = {
  name: string;
  youtubeChannelId: string;
  note?: string;
};

export const MAIN_CHANNELS: MainChannel[] = [
  { name: "슈카월드", youtubeChannelId: "UCsJ6RuBiTVWRX156FVbeaGg" },
  { name: "삼프로TV_경제의신과함께", youtubeChannelId: "UChlv4GSd7OQl3js-jkLOnFA" },
  { name: "김작가TV", youtubeChannelId: "UCvil4OAt-zShzkKHsg9EQAw" },
  { name: "월급쟁이부자들TV", youtubeChannelId: "UCDSj40X9FFUAnx1nv7gQhcA" },
  { name: "미래에셋 스마트머니", youtubeChannelId: "UCZS9wEZ4itPbBZk_sqccXfw" },
  { name: "한국경제TV", youtubeChannelId: "UCF8AeLlUbEpKju6v1H6p8Eg" },
  { name: "MTN 머니투데이방송", youtubeChannelId: "UClErHbdZKUnD1NyIUeQWvuQ" },
  { name: "815머니톡", youtubeChannelId: "UCCG6BEYjfQMGzypJw2EJCDQ" },
  {
    name: "부읽남TV (부동산 읽어주는 남자)",
    youtubeChannelId: "UC2QeHNJFfuQWB4cy3M-745g",
    note: "부읽남TV 계열 채널이 여럿이다. 구독자가 가장 많은 '내집마련부터건물주까지'를 골랐다.",
  },
  { name: "전인구 경제연구소", youtubeChannelId: "UCznImSIaxZR7fdLCICLdgaQ" },
  { name: "재테크읽어주는 파일럿", youtubeChannelId: "UCaWi2foADm_lKAKnmeQwLSA" },
  { name: "E트렌드", youtubeChannelId: "UCpsfkRRT7L2nBnizBn_u9YA" },
  { name: "머니인사이드", youtubeChannelId: "UCxfko2YOD6DODYRGzeOPhIQ" },
  { name: "달란트투자", youtubeChannelId: "UCBM86JVoHLqg9irpR2XKvGw" },
  { name: "소수몽키", youtubeChannelId: "UCC3yfxS5qC6PCwDzetUuEWg" },
  { name: "박곰희TV", youtubeChannelId: "UCr7XsrSrvAn_WcU4kF99bbQ" },
  {
    name: "돈깡의 알고하는투자",
    youtubeChannelId: "UCI6C5V4J8FWRcLcOdh1yElw",
    note: "검색 결과의 채널 이름이 '강민우 돈깡TV'로 다르다. 같은 채널이 맞는지 확인이 필요하다.",
  },
  { name: "창원개미TV", youtubeChannelId: "UCqsuesS39x5nUWcBH-1Q6YA" },
  { name: "한경 글로벌마켓", youtubeChannelId: "UCWskYkV4c4S9D__rsfOl2JA" },
  { name: "매일경제TV", youtubeChannelId: "UCnfwIKyFYRuqZzzKBDt6JOA" },
  { name: "내일은 투자왕 - 김단테", youtubeChannelId: "UCKTMvIu9a4VGSrpWy-8bUrQ" },
  { name: "연합뉴스경제TV", youtubeChannelId: "UC6kZpTl39-_SqfBrF1-N2oQ" },
  {
    name: "힐링여행자",
    youtubeChannelId: "UCHpGooMnVgnILywqrpqvZcQ",
    note: "이름만으로는 경제 채널인지 알 수 없다. 목록에 있는 채널이 맞는지 확인이 필요하다.",
  },
  { name: "미주은 (미국주식으로 은퇴하기)", youtubeChannelId: "UCNnwmqZOxSuOiF3_c7mAGWA" },
];
