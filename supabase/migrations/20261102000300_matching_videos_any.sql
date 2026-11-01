-- 키워드가 걸린 영상의 목록 만들기를 DB 한 번의 조회로 줄인 함수. (검색 응답을 빠르게 하려고)
-- 이전(matching_video_ids_any)에는 영상 번호만 받고, 걸린 영상 2,000~3,000개의 정보를 수십 번에 나눠 읽어 와서 앱이 정렬·분류했다.
-- 이제 DB가 사용 중인 채널의 14일 안 영상만 골라, 정렬과 분류에 필요한 네 가지 값만 배열 하나로 돌려준다.
--   [영상 번호, 업로드 시각, 채널 종류(main/small), 자막 상태(ok/none/pending)]
-- 화면에 보여줄 20건씩의 자세한 정보는 앱이 그 번호로만 따로 읽는다.
-- 자막과 제목·설명은 한 번씩만 훑어 번호를 모은 뒤(이 부분이 빠르다) 그 번호에 영상·채널 정보를 붙인다.
-- (영상마다 자막을 따로 찾는 방식은 훨씬 느려서 쓰지 않는다)

create or replace function matching_videos_any(needles text[], since timestamptz)
returns jsonb
language sql
stable
as $$
  with matched as (
    select t.video_id as id
    from transcripts t
    where exists (select 1 from unnest(needles) n where n <> '' and strpos(t.normalized_text, n) > 0)
    union
    select v.id
    from videos v
    where v.uploaded_at >= since
      and v.meta_text is not null
      and exists (select 1 from unnest(needles) n where n <> '' and strpos(v.meta_text, n) > 0)
  )
  select coalesce(jsonb_agg(jsonb_build_array(v.id, v.uploaded_at, c.kind, v.caption_status)), '[]'::jsonb)
  from matched m
  join videos v on v.id = m.id
  join channels c on c.id = v.channel_id
  where c.active
    and v.uploaded_at >= since
$$;

-- 서버 전용 키(service_role)만 부를 수 있게 한다. 브라우저용 공개 키로는 호출할 수 없다.
revoke all on function matching_videos_any(text[], timestamptz) from public, anon, authenticated;
grant execute on function matching_videos_any(text[], timestamptz) to service_role;

-- 번호만 돌려주던 이전 함수는 더 쓰지 않으므로 지운다.
drop function if exists matching_video_ids_any(text[], timestamptz);
