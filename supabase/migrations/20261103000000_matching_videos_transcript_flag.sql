-- 그 밖의 채널 영상도 자막을 받아 실제 언급을 확인하게 되면서, 결과마다 "자막에서 찾았는지"를 알아야 한다.
-- matching_videos_any가 돌려주는 배열에 다섯 번째 값(자막에서 찾았으면 true)을 더한다.
--   [영상 번호, 업로드 시각, 채널 종류(main/small), 자막 상태(ok/none/pending), 자막에서 찾음(true/false)]
-- 자막을 읽었는데 키워드가 없는 그 밖의 채널 영상은, 제목·태그·설명에만 있어도 앱이 결과에서 뺀다. (자막 확인이 더 정확하므로)

create or replace function matching_videos_any(needles text[], since timestamptz)
returns jsonb
language sql
stable
as $$
  with in_transcript as (
    select t.video_id as id
    from transcripts t
    where exists (select 1 from unnest(needles) n where n <> '' and strpos(t.normalized_text, n) > 0)
  ),
  matched as (
    select id from in_transcript
    union
    select v.id
    from videos v
    where v.uploaded_at >= since
      and v.meta_text is not null
      and exists (select 1 from unnest(needles) n where n <> '' and strpos(v.meta_text, n) > 0)
  )
  select coalesce(
    jsonb_agg(jsonb_build_array(v.id, v.uploaded_at, c.kind, v.caption_status, it.id is not null)),
    '[]'::jsonb
  )
  from matched m
  join videos v on v.id = m.id
  join channels c on c.id = v.channel_id
  left join in_transcript it on it.id = m.id
  where c.active
    and v.uploaded_at >= since
$$;

revoke all on function matching_videos_any(text[], timestamptz) from public, anon, authenticated;
grant execute on function matching_videos_any(text[], timestamptz) to service_role;
