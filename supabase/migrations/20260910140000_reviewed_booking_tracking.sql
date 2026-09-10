begin;
alter table public.reviewed_demo_bookings drop constraint reviewed_demo_bookings_status_check;
alter table public.reviewed_demo_bookings add constraint reviewed_demo_bookings_status_check check(status in('pending_payment','confirmed','completed','cancelled','expired'));
alter table public.reviewed_demo_bookings add column rating integer check(rating between 1 and 5),add column review_text text check(char_length(review_text)<=2000),add column reviewed_at timestamptz;
create function public.reviewed_demo_expire() returns void language sql security definer set search_path='' as $$
 update public.reviewed_demo_bookings set status='expired' where status='pending_payment' and expires_at<=clock_timestamp();
$$;
revoke all on function public.reviewed_demo_expire() from public,anon,authenticated;
create function public.reviewed_demo_read(p_booking uuid default null) returns setof public.reviewed_demo_bookings language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 update public.reviewed_demo_bookings set status='expired' where user_id=auth.uid() and status='pending_payment' and expires_at<=clock_timestamp();
 return query select b.* from public.reviewed_demo_bookings b where b.user_id=auth.uid() and(p_booking is null or b.id=p_booking) order by b.created_at desc;
end; $$;
create function public.reviewed_demo_cancel(p_booking uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.reviewed_demo_bookings; d public.reviewed_demo_departures;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into b from public.reviewed_demo_bookings where id=p_booking and user_id=auth.uid();
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into d from public.reviewed_demo_departures where id=b.departure_id for update;
 select * into b from public.reviewed_demo_bookings where id=p_booking and user_id=auth.uid() for update;
 if b.status='cancelled' then return to_jsonb(b); end if;
 if b.status<>'confirmed' or d.start_at-clock_timestamp()<interval '48 hours' then raise exception 'CANCEL_NOT_ALLOWED'; end if;
 update public.reviewed_demo_bookings set status='cancelled' where id=b.id returning * into b;
 return to_jsonb(b);
end; $$;
create function public.reviewed_demo_review(p_booking uuid,p_rating integer,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.reviewed_demo_bookings;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into b from public.reviewed_demo_bookings where id=p_booking and user_id=auth.uid() for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if b.status<>'completed' or b.reviewed_at is not null then raise exception 'REVIEW_NOT_ALLOWED'; end if;
 if p_rating is null or p_rating not between 1 and 5 or p_text is null or char_length(trim(p_text)) not between 1 and 2000 then raise exception 'INVALID_REVIEW'; end if;
 update public.reviewed_demo_bookings set rating=p_rating,review_text=trim(p_text),reviewed_at=clock_timestamp() where id=b.id returning * into b;
 return to_jsonb(b);
end; $$;
revoke all on function public.reviewed_demo_read(uuid),public.reviewed_demo_cancel(uuid),public.reviewed_demo_review(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.reviewed_demo_read(uuid),public.reviewed_demo_cancel(uuid),public.reviewed_demo_review(uuid,integer,text) to authenticated;
create extension if not exists pg_cron;
select cron.schedule('reviewed-booking-expiry','* * * * *','select public.reviewed_demo_expire()');
commit;
