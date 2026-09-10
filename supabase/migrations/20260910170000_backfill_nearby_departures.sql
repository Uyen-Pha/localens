begin;
-- Preserve existing departures and bookings; fill the missing daily dates.
insert into public.reviewed_demo_departures(id,title_vi,title_en,start_at,end_at,unit_price,capacity)
select ('d1900000-0000-4000-8000-'||lpad((right(d.id::text,12)::bigint*1000+n)::text,12,'0'))::uuid,
 d.title_vi,d.title_en,d.start_at-n*interval '1 day',d.end_at-n*interval '1 day',d.unit_price,d.capacity
from public.reviewed_demo_departures d
cross join lateral generate_series(1,((d.start_at at time zone 'Asia/Ho_Chi_Minh')::date-date '2026-09-10')) n
where d.id in ('d1700000-0000-4000-8000-000000000421','d1700000-0000-4000-8000-000000000422','d1700000-0000-4000-8000-000000000423')
on conflict(id) do nothing;
commit;
