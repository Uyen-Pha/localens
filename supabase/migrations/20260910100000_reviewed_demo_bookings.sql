begin;
create table public.reviewed_demo_departures (id uuid primary key,title_vi text not null,title_en text not null,start_at timestamptz not null,unit_price integer not null check(unit_price>0),capacity integer not null default 15 check(capacity=15));
alter table public.reviewed_demo_departures enable row level security;
create policy reviewed_departures_read on public.reviewed_demo_departures for select to anon,authenticated using(true);
revoke all on public.reviewed_demo_departures from anon,authenticated;
grant select on public.reviewed_demo_departures to anon,authenticated;
insert into public.reviewed_demo_departures(id,title_vi,title_en,start_at,unit_price)
select case when n=0 then base_id else ('d1800000-0000-4000-8000-'||lpad(((right(base_id::text,12)::bigint*1000)+n)::text,12,'0'))::uuid end,title_vi,title_en,start_at+n*interval '1 day',price
from (values ('d1700000-0000-4000-8000-000000000421'::uuid,'Dấu ấn Sài Gòn','Saigon Heritage','2026-09-12T01:30:00Z'::timestamptz,790000),
('d1700000-0000-4000-8000-000000000422'::uuid,'Sắc màu Chợ Lớn và trải nghiệm làm đèn Phú Bình','Cholon Culture and Phu Binh Lantern Making','2026-09-19T02:00:00Z'::timestamptz,1990000),
('d1700000-0000-4000-8000-000000000423'::uuid,'Mỹ thuật Sài Gòn và du ngoạn sông chiều tối','Saigon Fine Arts and Evening River Cruise','2026-09-26T08:00:00Z'::timestamptz,1590000)) as t(base_id,title_vi,title_en,start_at,price) cross join generate_series(0,174) n;
create table public.reviewed_demo_bookings (id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,departure_id uuid not null references public.reviewed_demo_departures(id),party_size integer not null check(party_size between 1 and 15),total_vnd integer not null check(total_vnd>0),status text not null default 'pending_payment' check(status in('pending_payment','confirmed','expired','cancelled')),created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '15 minutes'),paid_at timestamptz,request_key text not null,unique(user_id,request_key));
alter table public.reviewed_demo_bookings enable row level security;
create policy reviewed_bookings_own_read on public.reviewed_demo_bookings for select to authenticated using(user_id=auth.uid());
revoke all on public.reviewed_demo_bookings from anon,authenticated;
grant select on public.reviewed_demo_bookings to authenticated;
revoke insert,update,delete on public.reviewed_demo_bookings from anon,authenticated;
create index reviewed_demo_capacity on public.reviewed_demo_bookings(departure_id,status,expires_at);
create function public.reviewed_demo_begin(p_departure uuid,p_size integer,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.reviewed_demo_departures; b public.reviewed_demo_bookings; used integer;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if p_size is null or p_size not between 1 and 15 or p_key is null or length(p_key) not between 1 and 200 then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key,0));
 select * into b from public.reviewed_demo_bookings where user_id=auth.uid() and request_key=p_key;
 if found then
  if b.departure_id<>p_departure or b.party_size<>p_size then raise exception 'CONFLICT'; end if;
  if b.status='pending_payment' and b.expires_at>clock_timestamp() then return to_jsonb(b); end if;
  raise exception 'EXPIRED';
 end if;
 select * into d from public.reviewed_demo_departures where id=p_departure for update;
 if not found or d.start_at<=now() then raise exception 'INVALID_DEPARTURE'; end if;
 select coalesce(sum(party_size),0) into used from public.reviewed_demo_bookings where departure_id=p_departure and (status='confirmed' or(status='pending_payment' and expires_at>clock_timestamp()));
 if used+p_size>d.capacity then raise exception 'SOLD_OUT'; end if;
 insert into public.reviewed_demo_bookings(user_id,departure_id,party_size,total_vnd,request_key) values(auth.uid(),p_departure,p_size,p_size*d.unit_price,p_key) returning * into b;
 return to_jsonb(b);
end; $$;
create function public.reviewed_demo_pay(p_booking uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.reviewed_demo_bookings; dep uuid;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 select departure_id into dep from public.reviewed_demo_bookings where id=p_booking and user_id=auth.uid();
 if not found then raise exception 'NOT_FOUND'; end if;
 perform 1 from public.reviewed_demo_departures where id=dep for update;
 select * into b from public.reviewed_demo_bookings where id=p_booking and user_id=auth.uid() for update;
 if b.status='confirmed' then return to_jsonb(b); end if;
 if b.status='pending_payment' then
  update public.reviewed_demo_bookings set status=case when expires_at<=clock_timestamp() then 'expired' else 'confirmed' end,paid_at=case when expires_at>clock_timestamp() then now() else null end where id=b.id returning * into b;
 end if;
 return to_jsonb(b);
end; $$;
create function public.reviewed_demo_availability() returns table(departure_id uuid,remaining integer) language sql security definer set search_path='' as $$
 select d.id,(d.capacity-coalesce(sum(b.party_size) filter(where b.status='confirmed' or(b.status='pending_payment' and b.expires_at>clock_timestamp())),0))::integer from public.reviewed_demo_departures d left join public.reviewed_demo_bookings b on b.departure_id=d.id group by d.id;
$$;
revoke all on function public.reviewed_demo_begin(uuid,integer,text),public.reviewed_demo_pay(uuid),public.reviewed_demo_availability() from public,anon,authenticated;
grant execute on function public.reviewed_demo_begin(uuid,integer,text),public.reviewed_demo_pay(uuid) to authenticated;
grant execute on function public.reviewed_demo_availability() to anon,authenticated;
commit;
