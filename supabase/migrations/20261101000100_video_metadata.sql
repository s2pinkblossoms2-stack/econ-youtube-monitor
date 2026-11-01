-- 영상의 제목·태그·설명을 담는 칼럼. (PLAN 9번: 24개 채널이 아닌 채널은 자막 대신 이 글에서 키워드를 찾는다)
-- meta_text는 제목·태그·설명을 이어 붙여 띄어쓰기를 지우고 소문자로 바꾼 검색용 글이다. (자막의 normalized_text와 같은 방식)

alter table videos add column if not exists tags text[] not null default '{}';
alter table videos add column if not exists description text;
alter table videos add column if not exists meta_text text;
