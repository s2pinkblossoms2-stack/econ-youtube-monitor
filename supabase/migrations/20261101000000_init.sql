-- 경제 유튜브 여론 모니터 저장소 초기 구조 (DESIGN.md §3)

-- 채널 목록: main = 24개 주요 채널, small = 수집 때 찾은 중소 유튜버
create table channels (
  id bigint generated always as identity primary key,
  youtube_channel_id text not null unique,
  name text not null,
  kind text not null check (kind in ('main', 'small')),
  subscriber_count integer,
  last_checked_at timestamptz, -- 채널별로 영상 목록을 마지막에 확인한 시각
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 영상: 업로드 14일이 지나면 수집 스크립트가 삭제한다
create table videos (
  id bigint generated always as identity primary key,
  youtube_video_id text not null unique,
  channel_id bigint not null references channels (id) on delete cascade,
  title text not null,
  uploaded_at timestamptz not null,
  is_short boolean not null default false,
  caption_status text not null default 'pending' check (caption_status in ('ok', 'none', 'pending')),
  caption_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index videos_uploaded_at_idx on videos (uploaded_at);
create index videos_channel_id_idx on videos (channel_id);

-- 자막 원문(조각별 시작 시점 포함)과 검색용 글(띄어쓰기를 뺀 글)
create table transcripts (
  video_id bigint primary key references videos (id) on delete cascade,
  segments jsonb not null,
  normalized_text text not null
);

-- 담당팀이 저장한 키워드: 수집 때 중소 유튜버 검색에 쓴다
create table keywords (
  id bigint generated always as identity primary key,
  text text not null unique,
  created_at timestamptz not null default now(),
  last_collected_at timestamptz
);

-- 브라우저에서 직접 접근하지 못하게 막는다. 서버 코드가 서버 전용 키로만 접근한다.
alter table channels enable row level security;
alter table videos enable row level security;
alter table transcripts enable row level security;
alter table keywords enable row level security;
