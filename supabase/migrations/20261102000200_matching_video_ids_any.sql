-- 여러 키워드를 한 번의 조회로 찾는 함수. (저장한 키워드 10~30개를 하나씩 따로 검색하지 않고 한 번에 검색하려고)
-- 키워드마다 DB를 따로 훑던 방식(matching_video_ids)을 대체한다. 자막과 제목·태그·설명을 한 번씩만 훑고,
-- 키워드 중 하나라도 들어 있으면 그 영상 번호를 배열 하나로 돌려준다. needles는 앱이 띄어쓰기를 지우고 소문자로 바꾼 글자이며,
-- strpos로 글자 그대로 찾으므로 % _ 같은 문자를 따로 막을 필요가 없다. (보안 점검 SEC-005)

create or replace function matching_video_ids_any(needles text[], since timestamptz)
returns bigint[]
language sql
stable
as $$
  select coalesce(array_agg(m.id), '{}'::bigint[])
  from (
    select t.video_id as id
    from transcripts t
    where exists (select 1 from unnest(needles) n where n <> '' and strpos(t.normalized_text, n) > 0)
    union
    select v.id
    from videos v
    where v.uploaded_at >= since
      and v.meta_text is not null
      and exists (select 1 from unnest(needles) n where n <> '' and strpos(v.meta_text, n) > 0)
  ) m
$$;

-- 서버 전용 키(service_role)만 부를 수 있게 한다. 브라우저용 공개 키로는 호출할 수 없다.
revoke all on function matching_video_ids_any(text[], timestamptz) from public, anon, authenticated;
grant execute on function matching_video_ids_any(text[], timestamptz) to service_role;

-- 키워드 하나짜리 이전 함수는 더 쓰지 않으므로 지운다.
drop function if exists matching_video_ids(text, timestamptz);
