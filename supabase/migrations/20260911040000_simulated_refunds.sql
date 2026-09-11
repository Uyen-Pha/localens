begin;
alter table public.reviewed_demo_bookings
 add column payment_status text not null default 'pending' check(payment_status in('pending','processing','paid','failed','reviewing','cancelled','refunding','refunded')),
 add column refund_due_at timestamptz,
 add column refunded_at timestamptz;
update public.reviewed_demo_bookings set payment_status=case when status='cancelled' and paid_at is not null then 'refunding' when paid_at is not null then 'paid' when status in('cancelled','expired') then 'cancelled' else 'pending' end,
 refund_due_at=case when status='cancelled' and paid_at is not null then clock_timestamp()+interval '30 seconds' end;
create function public.reviewed_payment_sync() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='cancelled' and new.paid_at is not null then
  if new.payment_status<>'refunded' then new.payment_status='refunding'; new.refund_due_at=coalesce(new.refund_due_at,clock_timestamp()+interval '30 seconds'); end if;
 elsif new.status in('cancelled','expired') and new.paid_at is null then
  if new.payment_status not in('processing','reviewing') then new.payment_status='cancelled'; end if;
 elsif new.paid_at is not null then new.payment_status='paid';
 end if;
 return new;
end; $$;
create trigger reviewed_payment_sync before insert or update on public.reviewed_demo_bookings for each row execute function public.reviewed_payment_sync();
create or replace function public.reviewed_demo_expire() returns void language sql security definer set search_path='' as $$
 update public.reviewed_demo_bookings set status='expired' where status='pending_payment' and expires_at<=clock_timestamp();
 update public.reviewed_demo_bookings b set status='completed',completed_at=d.end_at+interval '12 hours' from public.reviewed_demo_departures d where b.departure_id=d.id and b.status='confirmed' and d.end_at+interval '12 hours'<=clock_timestamp();
 update public.reviewed_demo_bookings set payment_status='refunded',refunded_at=clock_timestamp() where status='cancelled' and payment_status='refunding' and paid_at is not null and refund_due_at<=clock_timestamp();
$$;
create or replace function public.reviewed_demo_cancel(p_booking uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.reviewed_demo_bookings; d public.reviewed_demo_departures;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into b from public.reviewed_demo_bookings where id=p_booking and user_id=auth.uid();
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into d from public.reviewed_demo_departures where id=b.departure_id for update;
 select * into b from public.reviewed_demo_bookings where id=p_booking and user_id=auth.uid() for update;
 if b.status='cancelled' then return to_jsonb(b); end if;
 if not ((b.status='confirmed' and d.start_at-clock_timestamp()>=interval '48 hours') or (b.status='pending_payment' and b.expires_at>clock_timestamp() and b.payment_status in('pending','failed'))) then raise exception 'CANCEL_NOT_ALLOWED'; end if;
 update public.reviewed_demo_bookings set status='cancelled' where id=b.id returning * into b;
 return to_jsonb(b);
end; $$;
revoke all on function public.reviewed_payment_sync() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
