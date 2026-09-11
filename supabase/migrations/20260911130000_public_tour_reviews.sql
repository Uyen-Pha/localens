begin;
alter table public.reviewed_demo_departures add column if not exists review_tour_id uuid references public.reviewed_demo_departures(id);
-- Bind every departure to the same stable tour identity, across departure dates.
update public.reviewed_demo_departures d set review_tour_id=base.id
from public.reviewed_demo_departures base
where base.id in ('d1700000-0000-4000-8000-000000000421','d1700000-0000-4000-8000-000000000422','d1700000-0000-4000-8000-000000000423') and d.title_vi=base.title_vi;
alter table public.reviewed_demo_bookings add column if not exists review_hidden boolean not null default false;
create or replace function public.reviewed_demo_public_reviews(p_departure uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with reviews as (
 select b.rating,b.review_text,b.reviewed_at
 from public.reviewed_demo_bookings b
 join public.reviewed_demo_departures d on d.id=b.departure_id
 join public.reviewed_demo_departures selected on selected.id=p_departure and selected.review_tour_id=d.review_tour_id
 where b.status='completed' and b.reviewed_at is not null and not b.review_hidden
 ), recent as (select * from reviews order by reviewed_at desc limit 200)
 select jsonb_build_object('count',(select count(*) from reviews),'average',(select round(avg(rating),1) from reviews),'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.reviewed_at desc) from recent r),'[]'::jsonb));
$$;
-- Return only review content, score and date. No account, booking or contact data.
revoke all on function public.reviewed_demo_public_reviews(uuid) from public;
grant execute on function public.reviewed_demo_public_reviews(uuid) to anon,authenticated;
create or replace function public.reviewed_demo_moderate_review(p_booking uuid,p_hidden boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from private.user_roles where user_id=auth.uid() and role='admin') then raise exception 'FORBIDDEN'; end if;
 if p_hidden is null then raise exception 'INVALID_INPUT'; end if;
 update public.reviewed_demo_bookings set review_hidden=p_hidden where id=p_booking and reviewed_at is not null;
end $$;
revoke all on function public.reviewed_demo_moderate_review(uuid,boolean) from public,anon;
grant execute on function public.reviewed_demo_moderate_review(uuid,boolean) to authenticated;
commit;
