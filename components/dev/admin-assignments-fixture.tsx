'use client';

import { useMemo, useRef, useState } from 'react';

import { AdminAssignments } from '@/components/admin/admin-assignments';
import {RuntimeGuideAssignmentError} from '@/lib/application/guide-assignment/contracts';
import type {
  AdminGuideAssignmentQueueItem,
  EligibleGuideCandidate,
  RuntimeGuideAssignmentPort,
} from '@/lib/application/guide-assignment/contracts';

type AssignmentHistory = {
  id: string;
  guide: string;
  status: string;
  assignedAt: string;
  closedAt: string | null;
};

const GUIDE_CANDIDATES: EligibleGuideCandidate[] = [
  { guideUserId: '20000000-0000-4000-8000-000000000001', displayName: 'Nguyễn Minh Anh', language: 'en' },
  { guideUserId: '20000000-0000-4000-8000-000000000002', displayName: 'Trần Quốc Bảo', language: 'en' },
  { guideUserId: '20000000-0000-4000-8000-000000000003', displayName: 'Lê Phương Thảo', language: 'en' },
  { guideUserId: '20000000-0000-4000-8000-000000000004', displayName: 'Võ Gia Huy', language: 'en' },
  { guideUserId: '20000000-0000-4000-8000-000000000005', displayName: 'Nguyễn Khánh Linh', language: 'en' },
  { guideUserId: '20000000-0000-4000-8000-000000000006', displayName: 'Phạm Thanh Hà', language: 'en' },
];

const GUIDE_BY_ID = new Map(GUIDE_CANDIDATES.map((guide) => [guide.guideUserId, guide]));

function row({
  number,
  titleVi,
  titleEn,
  startAt,
  meetingPoint,
  partySize,
  language,
  guideUserId,
  departureId,
}: {
  number: number;
  titleVi: string;
  titleEn: string;
  startAt: string;
  meetingPoint: string;
  partySize: number;
  language: 'vi' | 'en';
  guideUserId?: string;
  departureId?: string;
}): AdminGuideAssignmentQueueItem {
  const guide = guideUserId ? GUIDE_BY_ID.get(guideUserId) : undefined;
  return {
    bookingId: `10000000-0000-4000-8000-${number.toString().padStart(12, '0')}`,
    tourVersionId: departureId ? `30000000-0000-4000-8000-${number.toString().padStart(12, '0')}` : null,
    departureId: departureId ?? null,
    titleVi,
    titleEn,
    startAt,
    endAt: new Date(Date.parse(startAt) + 4 * 60 * 60 * 1000).toISOString(),
    meetingPoint,
    partySize,
    language,
    assignmentId: guide ? `40000000-0000-4000-8000-${number.toString().padStart(12, '0')}` : null,
    guideUserId: guide?.guideUserId ?? null,
    guideDisplayName: guide?.displayName ?? null,
    assignmentStatus: guide ? (number % 3 === 0 ? 'accepted' : 'assigned') : null,
  };
}

const INITIAL_ROWS: AdminGuideAssignmentQueueItem[] = [
  row({ number: 1, titleVi: 'Dấu ấn Sài Gòn', titleEn: 'Saigon Highlights', startAt: '2026-09-27T01:30:00.000Z', meetingPoint: 'Bưu điện Trung tâm', partySize: 2, language: 'en', guideUserId: GUIDE_CANDIDATES[0].guideUserId, departureId: 'fixed-001' }),
  row({ number: 2, titleVi: 'Chợ Lớn: Chợ Bình Tây và bữa cơm địa phương', titleEn: 'Cholon Food & Market Walk', startAt: '2026-09-28T02:00:00.000Z', meetingPoint: 'Khách sạn Windsor Plaza', partySize: 3, language: 'en', departureId: 'fixed-002' }),
  row({ number: 3, titleVi: 'Sài Gòn theo vị giác', titleEn: 'Taste of Saigon', startAt: '2026-09-30T05:00:00.000Z', meetingPoint: 'The Reverie Saigon', partySize: 4, language: 'en', guideUserId: GUIDE_CANDIDATES[4].guideUserId }),
  row({ number: 4, titleVi: 'Sắc màu Chợ Lớn và trải nghiệm làm đèn Phú Bình', titleEn: 'Cholon Colours & Lantern Workshop', startAt: '2026-10-02T01:00:00.000Z', meetingPoint: 'Chùa Bà Thiên Hậu', partySize: 5, language: 'en', guideUserId: GUIDE_CANDIDATES[2].guideUserId, departureId: 'fixed-003' }),
  row({ number: 5, titleVi: 'Cà phê, kiến trúc và những câu chuyện cũ', titleEn: 'Coffee, Architecture & Stories', startAt: '2026-10-04T02:30:00.000Z', meetingPoint: 'Nhà hát Thành phố', partySize: 2, language: 'en', departureId: 'fixed-004' }),
  row({ number: 6, titleVi: 'Một ngày sống như người Sài Gòn', titleEn: 'A Day Like a Local', startAt: '2026-10-07T01:30:00.000Z', meetingPoint: 'Ga Metro Bến Thành', partySize: 1, language: 'en', guideUserId: GUIDE_CANDIDATES[1].guideUserId }),
  row({ number: 7, titleVi: 'Di sản Sài Gòn cho gia đình có trẻ nhỏ', titleEn: 'Family Heritage Day', startAt: '2026-10-10T01:00:00.000Z', meetingPoint: 'Khách sạn Caravelle', partySize: 4, language: 'en', guideUserId: GUIDE_CANDIDATES[3].guideUserId }),
  row({ number: 8, titleVi: 'Hoàng hôn trên sông và ẩm thực ven bờ', titleEn: 'Sunset River & Riverside Food', startAt: '2026-10-12T09:00:00.000Z', meetingPoint: 'Bến Bạch Đằng', partySize: 6, language: 'en', departureId: 'fixed-005' }),
  row({ number: 9, titleVi: 'Sài Gòn không rào cản', titleEn: 'Step-free Saigon', startAt: '2026-10-15T02:00:00.000Z', meetingPoint: 'Khách sạn Park Hyatt', partySize: 2, language: 'en', guideUserId: GUIDE_CANDIDATES[4].guideUserId }),
  row({ number: 10, titleVi: 'Nghệ thuật đương đại và xưởng thủ công', titleEn: 'Contemporary Art & Craft Studios', startAt: '2026-10-18T03:30:00.000Z', meetingPoint: 'Bảo tàng Mỹ thuật', partySize: 3, language: 'en', guideUserId: GUIDE_CANDIDATES[5].guideUserId }),
  row({ number: 11, titleVi: 'Sài Gòn cho người mê nhiếp ảnh', titleEn: 'Photographer’s Saigon', startAt: '2026-10-21T22:30:00.000Z', meetingPoint: 'Chợ Bến Thành', partySize: 2, language: 'en', departureId: 'fixed-006' }),
  row({ number: 12, titleVi: 'Món chay và nhịp sống địa phương', titleEn: 'Vegetarian Local Life', startAt: '2026-10-24T04:30:00.000Z', meetingPoint: 'Thiền viện Vạn Hạnh', partySize: 4, language: 'en', guideUserId: GUIDE_CANDIDATES[0].guideUserId }),
  row({ number: 13, titleVi: 'Hành trình riêng cho người yêu lịch sử', titleEn: 'A Personal History Route', startAt: '2026-10-27T01:30:00.000Z', meetingPoint: 'Dinh Độc Lập', partySize: 2, language: 'en', guideUserId: GUIDE_CANDIDATES[3].guideUserId }),
  row({ number: 14, titleVi: 'Đêm Sài Gòn: nhạc sống và hàng quán khuya', titleEn: 'Saigon After Dark', startAt: '2026-10-30T11:00:00.000Z', meetingPoint: 'Phố đi bộ Nguyễn Huệ', partySize: 3, language: 'en', departureId: 'fixed-007' }),
  row({ number: 15, titleVi: 'Vườn rau, bếp nhà và bữa trưa miền Nam', titleEn: 'Garden-to-Table Countryside', startAt: '2026-11-03T01:00:00.000Z', meetingPoint: 'Khách sạn Mia Saigon', partySize: 5, language: 'en', guideUserId: GUIDE_CANDIDATES[4].guideUserId }),
  row({ number: 16, titleVi: 'Kiến trúc thuộc địa bằng xe đạp', titleEn: 'Colonial Architecture by Bicycle', startAt: '2026-11-07T00:30:00.000Z', meetingPoint: 'Nhà thờ Đức Bà', partySize: 2, language: 'en', guideUserId: GUIDE_CANDIDATES[1].guideUserId }),
  row({ number: 17, titleVi: 'Sài Gòn xanh cho nhóm bạn', titleEn: 'Green Saigon for Friends', startAt: '2026-11-12T02:00:00.000Z', meetingPoint: 'Thảo Cầm Viên', partySize: 6, language: 'en', departureId: 'fixed-008' }),
  row({ number: 18, titleVi: 'Lịch trình riêng: chợ hoa và ký ức Tết', titleEn: 'Personal Flower Market Route', startAt: '2026-11-16T03:00:00.000Z', meetingPoint: 'Chợ hoa Hồ Thị Kỷ', partySize: 3, language: 'en', guideUserId: GUIDE_CANDIDATES[2].guideUserId }),
  row({ number: 19, titleVi: 'Hương vị miền Tây trong một ngày', titleEn: 'Mekong Flavours in One Day', startAt: '2026-11-21T00:00:00.000Z', meetingPoint: 'Bến xe miền Tây', partySize: 4, language: 'en', guideUserId: GUIDE_CANDIDATES[3].guideUserId }),
  row({ number: 20, titleVi: 'Sài Gòn thư thả cho hai người', titleEn: 'A Slow Saigon for Two', startAt: '2026-11-28T02:30:00.000Z', meetingPoint: 'Khách sạn Hotel des Arts', partySize: 2, language: 'en', departureId: 'fixed-009' }),
];

function historyFor(rowItem: AdminGuideAssignmentQueueItem): AssignmentHistory[] {
  if (!rowItem.guideUserId || !rowItem.guideDisplayName || !rowItem.assignmentId) return [];
  const assignedAt = new Date(Date.parse(rowItem.startAt) - 7 * 24 * 60 * 60 * 1000).toISOString();
  return [{
    id: rowItem.assignmentId,
    guide: rowItem.guideDisplayName,
    status: rowItem.assignmentStatus ?? 'assigned',
    assignedAt,
    closedAt: null,
  }];
}

export function AdminAssignmentsFixture() {
  const rows = useRef(INITIAL_ROWS);
  const [, setRevision] = useState(0);
  const histories = useRef(new Map(INITIAL_ROWS.map((item) => [item.bookingId, historyFor(item)])));
  const port = useMemo<RuntimeGuideAssignmentPort>(() => ({
    listAdminQueue: async () => rows.current.filter(item=>Date.parse(item.startAt)>Date.now()),
    listEligibleGuides: async () => GUIDE_CANDIDATES,
    getAdminAssignmentDetail: async (bookingId) => ({
      departureStatus: 'scheduled',
      history: histories.current.get(bookingId) ?? [],
    }),
    listOwnAssignments: async () => [],
    assignGuide: async ({ bookingId, guideUserId }) => {
      const selectedGuide = GUIDE_BY_ID.get(guideUserId);
      const current = rows.current.find((item) => item.bookingId === bookingId);
      if (!selectedGuide || !current) throw new Error('Đơn mô phỏng không tồn tại.');
      if (!(Date.parse(current.startAt)>Date.now())) throw new RuntimeGuideAssignmentError('CONFLICT');
      const reassigned = Boolean(current.guideUserId && current.guideUserId !== guideUserId);
      const assignmentId = current.assignmentId ?? `40000000-0000-4000-8000-${bookingId.slice(-12)}`;
      const updated = {
        ...current,
        assignmentId,
        guideUserId,
        guideDisplayName: selectedGuide.displayName,
        assignmentStatus: 'assigned' as const,
      };
      histories.current.set(bookingId, historyFor(updated));
      rows.current = rows.current.map((item) => item.bookingId === bookingId ? updated : item);
      setRevision((revision) => revision + 1);
      return {
        assignmentId,
        bookingId,
        guideUserId,
        status: 'assigned' as const,
        outcome: reassigned ? 'reassigned' as const : 'assigned' as const,
      };
    },
  }), []);

  return <AdminAssignments port={port} />;
}
