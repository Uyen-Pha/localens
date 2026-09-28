import {bookingPreviewPort} from './admin-bookings-fixture';
import type {ReportPort} from '@/lib/application/admin-reports-preview';
// Report-only sample records; no quote/request workflow or database adapter.
export const reportsPreviewPort:ReportPort={async load(){return {bookings:await bookingPreviewPort.list(),requests:Array.from({length:8},(_,i)=>({id:`SAMPLE-REQUEST-${i+1}`,submittedAt:'2026-09-15T02:30:00.000Z',status:i===2||i===6?'approved':'pending_review',quoted:i===2||i===6,bookingId:i===2?'LL-OD-009':i===6?'LL-OD-010':undefined}))};}};
