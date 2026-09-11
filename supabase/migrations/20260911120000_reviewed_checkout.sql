-- Test-only checkout. Never accepts or stores card numbers or security codes.
alter table public.reviewed_demo_bookings add column if not exists checkout_details jsonb;
create or replace function public.reviewed_demo_checkout(p_booking uuid,p_details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.reviewed_demo_bookings; result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 select * into b from public.reviewed_demo_bookings where id=p_booking and user_id=auth.uid();
 if not found then raise exception 'NOT_FOUND'; end if;
 -- Same lock order as payment and cancellation.
 perform 1 from public.reviewed_demo_departures where id=b.departure_id for update;
 select * into b from public.reviewed_demo_bookings where id=p_booking and user_id=auth.uid() for update;
 if b.status<>'pending_payment' then return to_jsonb(b); end if;
 if b.expires_at<=clock_timestamp() then
  update public.reviewed_demo_bookings set status='expired' where id=b.id returning * into b;
  return to_jsonb(b);
 end if;
 if jsonb_typeof(p_details) is distinct from 'object' or
    p_details - array['name','email','phone','passengers','outcome'] <> '{}'::jsonb or
    length(trim(coalesce(p_details->>'name',''))) not between 1 and 80 or
    coalesce(p_details->>'phone','') !~ '^[+0-9 ()-]{7,25}$' or
    coalesce(p_details->>'outcome','') not in ('success','declined') or
    jsonb_typeof(p_details->'passengers') is distinct from 'array' then raise exception 'INVALID_CHECKOUT'; end if;
 if jsonb_array_length(p_details->'passengers')<>b.party_size then raise exception 'INVALID_TRAVELERS'; end if;
 if exists(select 1 from jsonb_array_elements(p_details->'passengers') v where jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 80) then raise exception 'INVALID_TRAVELERS'; end if;
 -- Email is the authenticated account email, never a caller-supplied recipient.
 p_details=jsonb_set(p_details,'{email}',to_jsonb((select email from auth.users where id=auth.uid())));
 update public.reviewed_demo_bookings set checkout_details=p_details-'outcome' where id=b.id;
 if p_details->>'outcome'='declined' then
  update public.reviewed_demo_bookings set payment_status='failed' where id=b.id returning * into b;
  return to_jsonb(b);
 end if;
 result=public.reviewed_demo_pay(b.id);
 return result;
end $$;
revoke all on function public.reviewed_demo_checkout(uuid,jsonb) from public,anon;
grant execute on function public.reviewed_demo_checkout(uuid,jsonb) to authenticated;
