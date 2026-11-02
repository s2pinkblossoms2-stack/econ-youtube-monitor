-- 수집 현황에서 24개 주요 채널뿐 아니라 "그 밖의 채널"도 자막을 확인했는지 볼 수 있게 한다.
--   channel_coverage: 채널 종류(main/small)를 골라 집계한다. 그 밖의 채널은 최근 14일 영상이 있는 채널만 나온다.
--   channel_videos:   채널 종류와 관계없이 한 채널의 영상 목록을 돌려준다.

drop function if exists channel_coverage(timestamptz);

create or replace function channel_coverage(since timestamptz, p_kind text default 'main')
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb)
  from (
    select
      c.id,
      c.name,
      c.last_checked_at as "lastCheckedAt",
      count(v.id) filter (where v.uploaded_at >= since) as total,
      count(v.id) filter (where v.uploaded_at >= since and v.caption_status = 'ok') as ok,
      count(v.id) filter (where v.uploaded_at >= since and v.caption_status = 'none') as none,
      count(v.id) filter (where v.uploaded_at >= since and v.caption_status = 'pending') as pending
    from channels c
    left join videos v on v.channel_id = c.id
    where c.kind = p_kind and c.active
    group by c.id
    having p_kind = 'main' or count(v.id) filter (where v.uploaded_at >= since) > 0
  ) r
$$;

create or replace function channel_videos(p_channel bigint, since timestamptz)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'videoId', v.youtube_video_id,
        'title', v.title,
        'uploadedAt', v.uploaded_at,
        'status', v.caption_status,
        'isShort', v.is_short
      )
      order by v.uploaded_at desc
    ),
    '[]'::jsonb
  )
  from videos v
  join channels c on c.id = v.channel_id
  where v.channel_id = p_channel
    and c.active
    and v.uploaded_at >= since
$$;

revoke all on function channel_coverage(timestamptz, text) from public, anon, authenticated;
grant execute on function channel_coverage(timestamptz, text) to service_role;
revoke all on function channel_videos(bigint, timestamptz) from public, anon, authenticated;
grant execute on function channel_videos(bigint, timestamptz) to service_role;
