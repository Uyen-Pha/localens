import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = 'data/planner/research-v2/';
const read = name => JSON.parse(readFileSync(root + name, 'utf8'));
const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const hhmm = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const estimated = value => ({ value, status: 'internal_simulation_estimate', isOfficial: false });

export function buildDataset() {
  const research = read('planner-dataset-v2.json');
  const assumptions = read('simulation-assumptions.json');
  const profiles = new Map(assumptions.places.map(row => [row[0], row]));
  if (profiles.size !== 30 || research.places.length !== 30) throw Error('Expected 30 unique profiles');
  const places = research.places.map(p => {
    const row = profiles.get(p.placeId);
    if (!row) throw Error('Missing profile ' + p.placeId);
    const [, zone, duration, groupSize, opens, closes, visit, meal, enabled] = row;
    const knownHours = p.operatingHours.windows.length > 0;
    const partial = p.operatingHours.partialObservation;
    const windows = knownHours ? p.operatingHours.windows : (partial?.timeSegments ?? [{ opens, closes }]).map(w => ({ ...w, isoWeekdays: [1, 2, 3, 4, 5, 6, 7] }));
    const knownFee = p.admission.amountVnd !== null;
    const foodQuote = p.observedFoodOffer;
    const streetWalk = ['LL-R19', 'LL-R21'].includes(p.placeId);
    const food = meal > 0;
    return {
      placeId: p.placeId, slug: p.slug, nameVi: p.nameVi, nameEn: p.nameEn,
      areaMembership: p.areaMembership, simulationZone: zone, experienceTags: p.experienceTags,
      researchRecordId: p.placeId, sourceIds: p.evidenceSourceIds.filter(id => !(p.rejectedSourceIds ?? []).includes(id)),
      dataMode: 'internal_simulation', realBookingEnabled: false,
      simulationEligible: enabled,
      disabledReason: enabled ? null : 'Chưa xác định cơ sở và hoạt động tiếp khách; không tự tạo buổi thực hành.',
      address: p.address,
      meetingPoint: { text: `Dự kiến tập trung tại lối vào ${p.nameVi}; cần chốt vị trí cụ thể trước chuyến thực tế.`, status: 'proposed_not_verified', latitude: null, longitude: null },
      activity: {
        type: !enabled ? 'operator_confirmation_required' : streetWalk ? 'neighborhood_walk' : food ? 'food_stop' : 'sightseeing',
        descriptionVi: !enabled ? `Hồ sơ tham khảo về ${p.nameVi}; chưa lên lịch hoạt động với cơ sở.` : streetWalk ? `Dạo quanh khu vực ${p.nameVi}, tìm hiểu sinh hoạt và ngành nghề địa phương; mua sắm tùy nhu cầu.` : food ? `Ghé ${p.nameVi}, dành thời gian ăn uống và khám phá khu vực. Món ăn cụ thể cần phù hợp yêu cầu của khách.` : `Tham quan ${p.nameVi}, tìm hiểu không gian và câu chuyện của địa điểm.`,
        workshopIncluded: false,
      },
      durationMinutes: estimated(duration), maximumGuests: estimated(groupSize),
      openingHours: {
        timezone: assumptions.timezone, windows,
        status: knownHours ? p.operatingHours.status : 'internal_simulation_estimate',
        sourceIds: knownHours ? p.evidenceSourceIds.filter(id => !(p.rejectedSourceIds ?? []).includes(id)) : partial ? [partial.sourceId] : [],
        note: partial ? 'Giờ sáng/chiều có nguồn; ngày hoạt động giả định cho mô phỏng.' : knownHours ? 'Giờ quan sát từ nguồn; vẫn cần kiểm tra đóng cửa đặc biệt trước chuyến thực tế.' : 'Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.',
        liveAvailabilityChecked: false,
      },
      cost: {
        currency: 'VND',
        visitPerPerson: knownFee ? { value: p.admission.amountVnd, status: p.admission.status, sourceId: p.admission.sourceId, audience: p.admission.audience } : estimated(visit),
        mealPerPerson: foodQuote ? { value: foodQuote.amountVnd, status: foodQuote.status, sourceId: foodQuote.sourceId, product: foodQuote.product } : estimated(meal),
        guideAndTransport: 'charged_once_per_itinerary_by_group',
        optionalShoppingIncluded: false,
        note: 'Giá vé quan sát áp dụng đúng đối tượng ghi trong nguồn; phép tính mẫu dùng khách người lớn, không tự áp dụng cho trẻ em hoặc mọi nhóm tuổi.',
      },
      dietarySupport: { halal: 'unknown', vegetarian: 'unknown', allergySafe: 'unknown' },
      guideLanguages: { values: ['vi', 'en'], status: 'internal_simulation_estimate', operatorProvided: false },
      contact: p.contact ?? { phone: null, email: null, status: 'not_verified' },
      preVisitChecks: ['Xác nhận lịch hoạt động vào ngày đi', 'Chốt điểm gặp và phương tiện', ...(food ? ['Chốt món ăn, dị ứng và khả năng phục vụ nhóm'] : []), ...(!enabled ? ['Xác định cơ sở tiếp khách và đặt lịch hoạt động'] : [])],
    };
  });
  const nodes = [{ placeId: 'ORIGIN-CENTER', simulationZone: 'center' }, ...places];
  const t = assumptions.transfer;
  const edges = [];
  for (const from of nodes) for (const to of nodes) {
    if (from.placeId === to.placeId) continue;
    const zones = new Set([from.simulationZone, to.simulationZone]);
    const base = from.simulationZone === to.simulationZone ? t.sameZoneMinutes : zones.has('cu-chi') && zones.has('long-phuoc') ? t.cuChiLongPhuocMinutes : zones.has('cu-chi') ? t.cuChiCityMinutes : zones.has('long-phuoc') ? t.longPhuocCityMinutes : t.differentCityZoneMinutes;
    const sameOrigin = [from.placeId, to.placeId].includes('ORIGIN-CENTER') && [from.placeId, to.placeId].includes('LL-R16');
    edges.push({ from: from.placeId, to: to.placeId, baseMinutes: sameOrigin ? t.originSamePlaceMinutes : base, bufferMinutes: t.bufferMinutesPerLeg, status: 'internal_simulation_estimate', isLiveRouting: false });
  }
  return {
    schemaVersion: 'locallens-planner-simulation-v1', preparedOn: '2026-09-11', dataMode: 'internal_simulation', realBookingEnabled: false,
    userApprovedEstimates: true, assumptions, researchSourceSha256: research.sourceSha256, evidenceSources: research.sources,
    origin: { placeId: 'ORIGIN-CENTER', nameVi: 'Điểm xuất phát giả định tại khu Nguyễn Huệ', fixedForSample: true, coordinates: null },
    places, transferEdges: edges,
    limitations: ['Không xác nhận nhận khách hoặc giá dịch vụ thực tế.', 'Không có tọa độ đã kiểm chứng; không dùng các cạnh này để chỉ đường.', 'Kết quả chỉ là lịch trình mẫu; ngày lễ và đóng cửa đột xuất chưa được kiểm tra.', 'Thông số ăn chay/Halal chưa rõ không được hiểu là đáp ứng.'],
  };
}

// Evaluates an explicitly chosen sample route; does not create a booking or contact an operator.
export function evaluateSample(data, { placeIds, date, startTime, durationMinutes, travelers, budgetVnd, dietary = null }) {
  const fail = (reason, details = {}) => ({ feasible: false, reason, ...details, dataMode: 'internal_simulation' });
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > data.assumptions.maximumPartySize) return fail('invalid_party_size');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 60 || durationMinutes > 720 || !Number.isFinite(budgetVnd) || budgetVnd < 0) return fail('invalid_time_or_budget');
  if (!/^\d{2}:\d{2}$/.test(startTime) || minute(startTime) < 0 || minute(startTime) >= 1440 || Number(startTime.slice(3)) > 59) return fail('invalid_start');
  const day = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day.valueOf()) || day.toISOString().slice(0, 10) !== date) return fail('invalid_date');
  if (!placeIds.length || new Set(placeIds).size !== placeIds.length) return fail('empty_or_duplicate_places');
  const selected = placeIds.map(id => data.places.find(p => p.placeId === id));
  if (selected.some(p => !p)) return fail('unknown_place_id');
  if (selected.some(p => !p.simulationEligible)) return fail('operator_not_identified');
  if (selected.some(p => travelers > p.maximumGuests.value)) return fail('group_exceeds_place_limit');
  if (dietary && selected.some(p => p.cost.mealPerPerson.value > 0 && p.dietarySupport[dietary] !== 'confirmed')) return fail('dietary_support_not_confirmed');
  const start = minute(startTime), deadline = start + durationMinutes;
  if (deadline > 1440) return fail('overnight_not_supported');
  const weekday = day.getUTCDay() || 7;
  let now = start, current = data.origin.placeId, transportVnd = 0, perPersonVnd = 0;
  const stops = [], legs = [];
  const t = data.assumptions.transfer;
  const tariff = t.costTiers.find(tier => travelers <= tier.maxGuests);
  const transfer = next => {
    const edge = data.transferEdges.find(e => e.from === current && e.to === next);
    if (!edge) return false;
    const peak = t.peakHours.some(([a,b]) => now >= a * 60 && now < b * 60);
    const minutes = Math.ceil(edge.baseMinutes * (peak ? t.peakDurationMultiplier : 1)) + edge.bufferMinutes;
    const costVnd = tariff.baseVndPerLeg + minutes * tariff.vndPerMinute;
    legs.push({ from: current, to: next, departure: hhmm(now), minutes, costVnd, status: 'internal_simulation_estimate' });
    now += minutes; transportVnd += costVnd; current = next;
    return true;
  };
  for (const p of selected) {
    if (!transfer(p.placeId)) return fail('missing_transfer');
    const window = p.openingHours.windows.filter(w => w.isoWeekdays.includes(weekday)).sort((a,b) => minute(a.opens) - minute(b.opens)).find(w => {
      const arrival = Math.max(now, minute(w.opens));
      return arrival + p.durationMinutes.value <= minute(w.closes) && (!w.lastAdmission || arrival <= minute(w.lastAdmission));
    });
    if (!window) return fail('outside_opening_hours', { placeId: p.placeId });
    const begins = Math.max(now, minute(window.opens));
    stops.push({ placeId: p.placeId, nameVi: p.nameVi, arrival: hhmm(begins), departure: hhmm(begins + p.durationMinutes.value), waitMinutes: begins - now });
    now = begins + p.durationMinutes.value;
    perPersonVnd += p.cost.visitPerPerson.value + p.cost.mealPerPerson.value;
  }
  if (!transfer(data.origin.placeId)) return fail('missing_return_transfer');
  if (now > deadline) return fail('insufficient_duration_including_return', { requiredMinutes: now - start, availableMinutes: durationMinutes });
  const guideVnd = Math.max(data.assumptions.guide.minimumPerGroupVnd, Math.ceil((now - start) / 60) * data.assumptions.guide.perGroupPerHourVnd);
  const totalVnd = perPersonVnd * travelers + transportVnd + guideVnd;
  if (totalVnd > budgetVnd) return fail('insufficient_budget', { requiredVnd: totalVnd, budgetVnd });
  return { feasible: true, dataMode: 'internal_simulation', date, stops, legs, returnTime: hhmm(now), durationMinutes: now - start, cost: { perPersonVnd, travelers, transportVnd, guideVnd, totalVnd }, realBookingEnabled: false };
}

export function writeDataset() {
  const data = buildDataset();
  writeFileSync(root + 'planner-simulation-v1.json', JSON.stringify(data, null, 2) + '\n');
  const defaults = { date: '2026-09-15', startTime: '09:00', durationMinutes: 360, travelers: 2, budgetVnd: 3000000 };
  const samples = [
    { name: 'Trung tâm: Dinh Độc Lập – Bưu điện', input: { ...defaults, placeIds: ['LL-R01','LL-R05'] } },
    { name: 'Chợ Lớn: Hội quán – Chợ Bình Tây', input: { ...defaults, placeIds: ['LL-R17','LL-R14'] } },
    { name: 'Củ Chi: một điểm, có chặng về', input: { ...defaults, durationMinutes: 600, budgetVnd: 5000000, placeIds: ['LL-R10'] } },
    { name: 'Từ chối Củ Chi trong một giờ', input: { ...defaults, durationMinutes: 60, placeIds: ['LL-R10'] } },
    { name: 'Từ chối ngân sách quá thấp', input: { ...defaults, budgetVnd: 100000, placeIds: ['LL-R01'] } },
  ].map(s => ({ ...s, result: evaluateSample(data, s.input) }));
  writeFileSync(root + 'sample-itineraries.json', JSON.stringify(samples, null, 2) + '\n');
  const money = n => n.toLocaleString('vi-VN');
  const lines = ['# Hồ sơ địa điểm và thông số mô phỏng LocalLens', '',
    'Người dùng đã đồng ý dùng ước tính nội bộ. Bộ này phục vụ kiểm tra tính khả thi và tạo lịch trình mẫu, không phải giá hoặc khả năng nhận khách chính thức.', '',
    `Đủ ${data.places.length} hồ sơ; ${data.places.filter(p=>p.simulationEligible).length} điểm được chọn trong mô phỏng. Bốn điểm LL-R27–LL-R30 chưa tự động chọn vì chưa xác định hoạt động/cơ sở tiếp khách.`, '',
    '## Thông số cho từng địa điểm', '',
    'Cột phút và giới hạn khách đều là ước tính. Vé/chi phí ghé thăm và tiền ăn có nguồn khi hồ sơ JSON ghi sourceId; phần còn lại là ước tính, kể cả giá trị 0. Chi phí mua sắm không bắt buộc.', '',
    '| ID | Địa điểm | Phút | Tối đa khách | Vé/ghé thăm mỗi người | Ăn mỗi người | Dùng mô phỏng |',
    '|---|---|---:|---:|---:|---:|---|',
    ...data.places.map(p => `| ${p.placeId} | ${p.nameVi} | ${p.durationMinutes.value} | ${p.maximumGuests.value} | ${money(p.cost.visitPerPerson.value)} | ${money(p.cost.mealPerPerson.value)} | ${p.simulationEligible ? 'Có' : 'Chờ cơ sở'} |`), '',
    '## Cách tính', '',
    '- Ngân sách nhóm = tổng vé/ghé thăm và ăn theo người × số khách + xe từng chặng + hướng dẫn viên một lần cho cả chuyến.',
    '- Hướng dẫn viên: giả định 200.000 đồng/giờ cho nhóm, tối thiểu 400.000 đồng; tính cả chờ và di chuyển.',
    '- Xe: chọn bậc theo số khách, tính từng chặng; không nhân thêm số khách. Bảng giá nội bộ nằm trong simulation-assumptions.json.',
    '- 930 cạnh có hướng giữa 30 điểm và điểm xuất phát mẫu. Có chặng về; cộng 5 phút đệm và hệ số 1,3 khi xuất phát giờ cao điểm giả định.',
    '- Giờ mở cửa đã đối chiếu được giữ nguyên, gồm ngày nghỉ và nghỉ trưa. Giờ thiếu dùng khung mô phỏng có nhãn riêng.',
    '- Không đáp ứng thời gian/ngân sách thì trả lý do không có tuyến phù hợp, không ép tạo tuyến.',
    '- Không có tọa độ hoặc điểm đón đã xác nhận. Các cạnh mô phỏng không dùng để chỉ đường thực tế.', '',
    '## Kết quả mẫu đã tính', '',
    ...samples.map(s => `- ${s.name}: ${s.result.feasible ? `${s.result.durationMinutes} phút, ${money(s.result.cost.totalVnd)} VND/nhóm.` : `không tạo tuyến (${s.result.reason}).`}`), '',
    '## Giới hạn còn giữ', '',
    'Chưa xác nhận nhận đoàn, số điện thoại còn hiệu lực ở mọi điểm, điều kiện ăn uống, tọa độ hay lịch đóng cửa đặc biệt. Các trường này có trạng thái chưa xác nhận; không được trình bày thành cam kết của đơn vị.', '',
    'File planner-dataset-v2.json giữ phần nghiên cứu. File planner-simulation-v1.json chứa cấu hình mô phỏng. Bộ tạo tour trên web chưa được nối với bộ dữ liệu mới này.', '',
    'Tạo lại: node scripts/prepare-planner-dataset-v2.mjs rồi node scripts/build-planner-simulation-dataset.mjs.', '',
    '## Hồ sơ từng địa điểm', '',
    ...data.places.flatMap(p => [
      `### ${p.placeId} — ${p.nameVi}`, '',
      `- Địa chỉ: ${p.address.value}.`,
      `- Hoạt động: ${p.activity.descriptionVi}`,
      `- Thời lượng mô phỏng: ${p.durationMinutes.value} phút; tối đa ${p.maximumGuests.value} khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).`,
      `- Khung giờ: ${p.openingHours.windows.map(w=>`ngày ${w.isoWeekdays.join(',')} (1=T2, 7=CN), ${w.opens}–${w.closes}${w.lastAdmission ? ', nhận khách đến '+w.lastAdmission : ''}`).join('; ')}. ${p.openingHours.note}`,
      `- Vé/chi phí ghé thăm: ${money(p.cost.visitPerPerson.value)} VND/người (${p.cost.visitPerPerson.sourceId ? 'có nguồn, xem điều kiện đối tượng trong JSON' : 'ước tính nội bộ'}).`,
      `- Ăn uống: ${money(p.cost.mealPerPerson.value)} VND/người (${p.cost.mealPerPerson.sourceId ? 'giá món từ nguồn' : 'ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn'}).`,
      `- Điểm gặp: ${p.meetingPoint.text}`,
      `- Liên hệ: ${p.contact.phone ?? 'chưa xác nhận điện thoại'}; ${p.contact.email ?? 'chưa xác nhận email'}.`,
      `- Trước chuyến thực tế: ${p.preVisitChecks.join('; ')}.`,
      `- Nguồn đối chiếu: ${p.sourceIds.length ? p.sourceIds.map(id=>{const s=data.evidenceSources.find(s=>s.id===id);return s ? `[${id}](${s.url})` : id;}).join(', ') : 'Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.'}`, '',
    ]),
  ];
  writeFileSync(root + 'SIMULATION-README.md', lines.join('\n').trimEnd() + '\n');
  const payload = JSON.stringify(data), hash = createHash('sha256').update(payload).digest('hex');
  const q = text => "'" + text.replaceAll("'", "''") + "'";
  writeFileSync(root + 'stage-simulation.sql', `begin;\ncreate table if not exists private.planner_simulation_revisions (content_sha256 text primary key, payload jsonb not null, imported_at timestamptz not null default now());\nalter table private.planner_simulation_revisions enable row level security;\nrevoke all on private.planner_simulation_revisions from public,anon,authenticated;\ninsert into private.planner_simulation_revisions (content_sha256,payload) values (${q(hash)},${q(payload)}::jsonb) on conflict do nothing;\ncommit;\n`);
  console.log(JSON.stringify({ places: data.places.length, simulationEligible: data.places.filter(p=>p.simulationEligible).length, edges: data.transferEdges.length, samples: samples.map(s=>({name:s.name,feasible:s.result.feasible,reason:s.result.reason})) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeDataset();
