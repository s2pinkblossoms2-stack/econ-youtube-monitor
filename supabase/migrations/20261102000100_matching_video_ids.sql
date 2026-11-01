-- 키워드가 자막 또는 제목·태그·설명에 들어 있는 영상 번호를 한 번에 찾는 함수. (PLAN 13번에서 검색 타임아웃을 줄이려고)
-- 이전에는 자막과 제목·설명을 따로, 1,000건씩 여러 번 훑었다. 이제 한 번의 조회로 끝나고, 번호 전체를 하나의 배열로 돌려줘서
-- 한 번에 1,000행까지만 주는 제한을 받지 않는다. needle은 앱이 띄어쓰기를 지우고 소문자로 바꾼 글자이며,
-- strpos로 글자 그대로 찾으므로 % _ 같은 문자를 따로 막을 필요가 없다. (보안 점검 SEC-005)

create or replace function matching_video_ids(needle text, since timestamptz)
returns bigint[]
language sql
stable
as $$
  select coalesce(array_agg(m.id), '{}'::bigint[])
  from (
    select t.video_id as id from transcripts t where strpos(t.normalized_text, needle) > 0
    union
    select v.id from videos v where v.uploaded_at >= since and v.meta_text is not null and strpos(v.meta_text, needle) > 0
  ) m
$$;

-- 서버 전용 키(service_role)만 부를 수 있게 한다. 브라우저용 공개 키로는 호출할 수 없다.
revoke all on function matching_video_ids(text, timestamptz) from public, anon, authenticated;
grant execute on function matching_video_ids(text, timestamptz) to service_role;
