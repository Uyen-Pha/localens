-- Reviewed hypothetical schedule only; callers must wrap in a transaction.
DO $check$ BEGIN
 IF (SELECT count(*) FROM auth.users u JOIN private.user_roles r ON r.user_id=u.id WHERE u.email='guide.demo@localens.invalid' AND r.role='guide') <> 1 THEN RAISE EXCEPTION 'demo guide identity unavailable'; END IF;
END $check$;
INSERT INTO private.guide_demo_schedule (id,guide_user_id,tour_version_id,start_at,end_at,party_size,tour_status)
SELECT seed.id, users.id, seed.version_id, seed.start_at, seed.end_at, seed.party_size, seed.status
FROM (VALUES ('d1800000-0000-4000-8000-000000000801'::uuid, 'd1700000-0000-4000-8000-000000000411'::uuid, '2026-08-8T01:30:00Z'::timestamptz, '2026-08-8T06:00:00Z'::timestamptz, 4, 'completed'),
('d1800000-0000-4000-8000-000000000802'::uuid, 'd1700000-0000-4000-8000-000000000412'::uuid, '2026-08-12T02:00:00Z'::timestamptz, '2026-08-12T11:00:00Z'::timestamptz, 5, 'completed'),
('d1800000-0000-4000-8000-000000000803'::uuid, 'd1700000-0000-4000-8000-000000000413'::uuid, '2026-08-15T08:00:00Z'::timestamptz, '2026-08-15T13:30:00Z'::timestamptz, 6, 'completed'),
('d1800000-0000-4000-8000-000000000804'::uuid, 'd1700000-0000-4000-8000-000000000411'::uuid, '2026-08-20T01:30:00Z'::timestamptz, '2026-08-20T06:00:00Z'::timestamptz, 7, 'completed'),
('d1800000-0000-4000-8000-000000000805'::uuid, 'd1700000-0000-4000-8000-000000000412'::uuid, '2026-08-24T02:00:00Z'::timestamptz, '2026-08-24T11:00:00Z'::timestamptz, 8, 'completed'),
('d1800000-0000-4000-8000-000000000806'::uuid, 'd1700000-0000-4000-8000-000000000413'::uuid, '2026-08-28T08:00:00Z'::timestamptz, '2026-08-28T13:30:00Z'::timestamptz, 9, 'cancelled'),
('d1800000-0000-4000-8000-000000000901'::uuid, 'd1700000-0000-4000-8000-000000000411'::uuid, '2026-09-8T01:30:00Z'::timestamptz, '2026-09-8T06:00:00Z'::timestamptz, 4, 'completed'),
('d1800000-0000-4000-8000-000000000902'::uuid, 'd1700000-0000-4000-8000-000000000412'::uuid, '2026-09-12T02:00:00Z'::timestamptz, '2026-09-12T11:00:00Z'::timestamptz, 5, 'completed'),
('d1800000-0000-4000-8000-000000000903'::uuid, 'd1700000-0000-4000-8000-000000000413'::uuid, '2026-09-15T08:00:00Z'::timestamptz, '2026-09-15T13:30:00Z'::timestamptz, 6, 'upcoming'),
('d1800000-0000-4000-8000-000000000904'::uuid, 'd1700000-0000-4000-8000-000000000411'::uuid, '2026-09-20T01:30:00Z'::timestamptz, '2026-09-20T06:00:00Z'::timestamptz, 7, 'upcoming'),
('d1800000-0000-4000-8000-000000000905'::uuid, 'd1700000-0000-4000-8000-000000000412'::uuid, '2026-09-24T02:00:00Z'::timestamptz, '2026-09-24T11:00:00Z'::timestamptz, 8, 'upcoming'),
('d1800000-0000-4000-8000-000000000906'::uuid, 'd1700000-0000-4000-8000-000000000413'::uuid, '2026-09-28T08:00:00Z'::timestamptz, '2026-09-28T13:30:00Z'::timestamptz, 9, 'cancelled'),
('d1800000-0000-4000-8000-000000001001'::uuid, 'd1700000-0000-4000-8000-000000000411'::uuid, '2026-10-8T01:30:00Z'::timestamptz, '2026-10-8T06:00:00Z'::timestamptz, 4, 'upcoming'),
('d1800000-0000-4000-8000-000000001002'::uuid, 'd1700000-0000-4000-8000-000000000412'::uuid, '2026-10-12T02:00:00Z'::timestamptz, '2026-10-12T11:00:00Z'::timestamptz, 5, 'upcoming'),
('d1800000-0000-4000-8000-000000001003'::uuid, 'd1700000-0000-4000-8000-000000000413'::uuid, '2026-10-15T08:00:00Z'::timestamptz, '2026-10-15T13:30:00Z'::timestamptz, 6, 'upcoming'),
('d1800000-0000-4000-8000-000000001004'::uuid, 'd1700000-0000-4000-8000-000000000411'::uuid, '2026-10-20T01:30:00Z'::timestamptz, '2026-10-20T06:00:00Z'::timestamptz, 7, 'upcoming'),
('d1800000-0000-4000-8000-000000001005'::uuid, 'd1700000-0000-4000-8000-000000000412'::uuid, '2026-10-24T02:00:00Z'::timestamptz, '2026-10-24T11:00:00Z'::timestamptz, 8, 'upcoming'),
('d1800000-0000-4000-8000-000000001006'::uuid, 'd1700000-0000-4000-8000-000000000413'::uuid, '2026-10-28T08:00:00Z'::timestamptz, '2026-10-28T13:30:00Z'::timestamptz, 9, 'cancelled')) AS seed(id,version_id,start_at,end_at,party_size,status)
CROSS JOIN auth.users AS users WHERE users.email='guide.demo@localens.invalid'
ON CONFLICT (id) DO NOTHING;
