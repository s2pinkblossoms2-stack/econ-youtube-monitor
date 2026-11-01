-- 수집 현황 화면용 함수 두 개. (채널별·영상별로 자막을 확인했는지 보여주려고)
-- 영상이 수천 개라 한 번에 1,000행까지만 받는 제한을 피하려고, DB가 집계해서 배열 하나(jsonb)로 돌려준다.
--   channel_coverage: 사용 중인 24개 주요 채널마다 [영상 수, 자막 확인 완료, 확인불가(자막 없음), 대기] 집계
--   channel_videos:   한 채널의 최근 14일 영상 목록과 자막 확인 상태

create or replace function channel_coverage(since timestamptz)
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
    where c.kind = 'main' and c.active
    group by c.id
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
    and c.kind = 'main'
    and c.active
    and v.uploaded_at >= since
$$;

-- 서버 전용 키(service_role)만 부를 수 있게 한다. 브라우저용 공개 키로는 호출할 수 없다.
revoke all on function channel_coverage(timestamptz) from public, anon, authenticated;
grant execute on function channel_coverage(timestamptz) to service_role;
revoke all on function channel_videos(bigint, timestamptz) from public, anon, authenticated;
grant execute on function channel_videos(bigint, timestamptz) to service_role;
