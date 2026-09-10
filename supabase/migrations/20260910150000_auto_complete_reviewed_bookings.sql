begin;
alter table public.reviewed_demo_departures add column end_at timestamptz;
update public.reviewed_demo_departures set end_at=start_at+case when right(id::text,12)::bigint=421 or right(id::text,12)::bigint/1000=421 then interval '270 minutes' when right(id::text,12)::bigint=422 or right(id::text,12)::bigint/1000=422 then interval '540 minutes' when right(id::text,12)::bigint=423 or right(id::text,12)::bigint/1000=423 then interval '330 minutes' end;
alter table public.reviewed_demo_departures alter column end_at set not null;
alter table public.reviewed_demo_departures add constraint reviewed_departure_end_after_start check(end_at>start_at);
alter table public.reviewed_demo_bookings add column completed_at timestamptz;
create or replace function public.reviewed_demo_expire() returns void language sql security definer set search_path='' as $$
 update public.reviewed_demo_bookings set status='expired' where status='pending_payment' and expires_at<=clock_timestamp();
 update public.reviewed_demo_bookings b set status='completed',completed_at=d.end_at+interval '12 hours' from public.reviewed_demo_departures d where b.departure_id=d.id and b.status='confirmed' and d.end_at+interval '12 hours'<=clock_timestamp();
$$;
create or replace function public.reviewed_demo_read(p_booking uuid default null) returns setof public.reviewed_demo_bookings language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 update public.reviewed_demo_bookings set status='expired' where user_id=auth.uid() and status='pending_payment' and expires_at<=clock_timestamp();
 update public.reviewed_demo_bookings b set status='completed',completed_at=d.end_at+interval '12 hours' from public.reviewed_demo_departures d where b.user_id=auth.uid() and b.departure_id=d.id and b.status='confirmed' and d.end_at+interval '12 hours'<=clock_timestamp();
 return query select b.* from public.reviewed_demo_bookings b where b.user_id=auth.uid() and(p_booking is null or b.id=p_booking) order by b.created_at desc;
end; $$;
revoke all on function public.reviewed_demo_expire() from public,anon,authenticated;
revoke all on function public.reviewed_demo_read(uuid) from public,anon;
grant execute on function public.reviewed_demo_read(uuid) to authenticated;
-- Existing minute cron runs reviewed_demo_expire; sync already due rows now.
select public.reviewed_demo_expire();
notify pgrst,'reload schema';
commit;
