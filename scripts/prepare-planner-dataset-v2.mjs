import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='data/planner/research-v2/';
const raw=readFileSync(root+'source-v1.json','utf8');
const input=JSON.parse(raw.replace(/^\uFEFF/,''));
const checked='2026-09-11';
const sources=[
 {id:'verified-dinh-2026',url:'https://dinhdoclap.gov.vn/gio-tham-quan-va-gia-ve-moi-nhat-ap-dung-tu-01-8-2025-2/',observedOn:checked,authority:'operator',method:'page_read',placeId:'LL-R01'},
 {id:'verified-war-2026',url:'https://ticket.baotangchungtichchientranh.vn/terms-and-conditions.html',observedOn:checked,authority:'operator',method:'search_full_extract',placeId:'LL-R02'},
 {id:'verified-history-2026',url:'https://www.baotanglichsutphcm.com.vn/tham-quan/chinh-sach',observedOn:checked,authority:'operator',method:'page_read',placeId:'LL-R04'},
 {id:'research-finearts-2026',url:'https://www.baotangmythuattphcm.com.vn/tham-quan',observedOn:checked,authority:'operator',method:'search_extract_direct_fetch_502',placeId:'LL-R06'},
 {id:'verified-tonducthang-2026',url:'https://baotangtonducthang.vn/',observedOn:checked,authority:'operator',method:'page_read',placeId:'LL-R08'},
];
const fees={
 'LL-R01':{amountVnd:80000,product:'Dinh và Nhà Trưng bày',audience:'18–59 tuổi',sourceId:sources[0].id},
 'LL-R02':{amountVnd:40000,product:'Vé tham quan',audience:'Người lớn quốc tế',sourceId:sources[1].id},
 'LL-R04':{amountVnd:30000,product:'Phí tham quan phổ thông',audience:'Vé tiêu chuẩn; kiểm tra miễn giảm riêng',sourceId:sources[2].id},
};
const hoursIds=new Set(['LL-R01','LL-R02','LL-R04','LL-R08']);
const deferred=new Set(['LL-R10','LL-R19','LL-R27','LL-R28','LL-R29','LL-R30']);
const data={schemaVersion:'locallens-planner-dataset-v2',sourceSha256:createHash('sha256').update(raw).digest('hex'),preparedOn:checked,publicationStatus:'research_draft',sources,
 areas:input.areas.map(a=>({...a,minimumRecommendedDurationMin:a.minimumRecommendedDurationMin,minimumIsNotRouteGuarantee:true})),experienceTypes:input.experienceTypes,
 routePolicy:{areaPreference:'soft',experiencePreference:'soft',unknownCost:'reject_not_zero',unknownSupport:'not_confirmed',fallback:'requires_explicit_area_expansion_consent',originAndReturnRequired:true,travelTimeSource:'approved_place_to_place_edges',clusterMatrixForScheduling:false,budgetFormula:'sum(per_person_mandatory_costs) * travelers + sum(per_group_costs)',optionalShoppingIncluded:false,unknownAiIds:'reject',emptyResult:'no_feasible_itinerary'},
 unapprovedClusterEstimates:input.travelMatrix,
 places:input.places.map(p=>{
 const tier=!p.uiAreaMembership.length?'outside_current_areas':deferred.has(p.placeId)?'deferred_operator_confirmation':'inner_city_priority';
 const evidence=sources.filter(s=>s.placeId===p.placeId);
 const missing=['operator_group_capacity','approved_transfer_edges','approved_group_service_cost','admin_release_review'];
 if(!hoursIds.has(p.placeId))missing.push('current_operating_windows');
 if(!fees[p.placeId])missing.push('admission_or_explicit_free_confirmation');
 if(p.addressReviewStatusVi!=='Đối chiếu được')missing.push('exact_meeting_point');
 if(deferred.has(p.placeId))missing.push('named_host_and_bookable_activity');
 if(!p.uiAreaMembership.length)missing.push('supported_area');
 return {placeId:p.placeId,slug:p.slug,nameVi:p.nameVi,nameEn:p.nameEn,areaMembership:p.uiAreaMembership,experienceTags:p.experienceTags,
  rolloutTier:tier,publicationStatus:'draft',adminVerified:false,plannerEligible:false,
  address:{value:p.addressVi,sourceStatus:p.addressReviewStatusVi,coordinates:null,meetingPoint:null},
  visitDuration:{minutes:p.visitDurationMin,status:'planning_estimate_needs_review'},
  admission:fees[p.placeId]?{...fees[p.placeId],currency:'VND',basis:'per_person',status:'operator_source_observed',observedOn:checked}:{amountVnd:null,status:'unknown'},
  otherCosts:{mealPerPersonVnd:null,activityPerPersonVnd:null,guidePerGroupVnd:null,transportPerGroupVnd:null,optionalShoppingVnd:null},
  sourceAllowance:p.planningCostVndPerPerson,
  operatingHours:{timezone:'Asia/Ho_Chi_Minh',status:hoursIds.has(p.placeId)?'operator_source_observed':'needs_review',windows:hoursIds.has(p.placeId)?p.openingHoursResearch.observations.flatMap(o=>o.windows):[],observedOn:hoursIds.has(p.placeId)?checked:null,exceptions:[],validForAllFutureDates:false},
  capacity:{maximumGroupSize:null,advanceBookingRequired:null},supports:{guideLanguages:[],vegetarian:'unknown',halal:'unknown'},
  evidenceSourceIds:evidence.map(s=>s.id),blockingReasons:missing,originalResearch:p};
 })};
const additional=JSON.parse(readFileSync(root+'additional-observations.json','utf8'));
data.additionalEvidence=additional;
for(const observation of additional.observations){
 const p=data.places.find(p=>p.placeId===observation.placeId);
 if(!p)throw Error('Unknown evidence place '+observation.placeId);
 const {sourceId:id,url,authority,method}=observation;
 data.sources.push({id,url,authority,method,placeId:p.placeId,observedOn:additional.observedOn});
 p.evidenceSourceIds.push(id);
 p.additionalObservations??=[];
 p.additionalObservations.push(observation);
 if(authority==='rejected'){p.rejectedSourceIds=[...(p.rejectedSourceIds??[]),id];continue;}
 if(authority!=='operator')continue;
 const f=observation.facts;
 if(f.address){p.address.value=f.address;p.address.sourceStatus='operator_source_observed';p.address.sourceId=id;}
 if(f.phone||f.email)p.contact={phone:f.phone??null,email:f.email??null,sourceId:id,status:'operator_source_observed'};
 if(f.openingWindows){p.operatingHours={...p.operatingHours,status:'operator_search_extract',windows:f.openingWindows,observedOn:additional.observedOn,sourceId:id};p.blockingReasons=p.blockingReasons.filter(x=>x!=='current_operating_windows');}
 if(f.dailyTimeSegments)p.operatingHours.partialObservation={timeSegments:f.dailyTimeSegments,isoWeekdays:null,sourceId:id};
 if(f.combinedAmountPerPerson){p.admission={amountVnd:f.combinedAmountPerPerson,currency:'VND',basis:'per_person',audience:f.audience,effectiveFrom:f.effectiveFrom,status:'operator_search_extract',sourceId:id,components:[{label:'Phí tham quan',amountVnd:f.admissionFeePerPerson},{label:'Phục vụ, hướng dẫn tại di tích',amountVnd:f.visitorServiceAndGuidancePerPerson}]};p.blockingReasons=p.blockingReasons.filter(x=>x!=='admission_or_explicit_free_confirmation');}
 if(f.foodPriceVnd)p.observedFoodOffer={product:f.foodProduct,amountVnd:f.foodPriceVnd,currency:'VND',sourceId:id,status:'operator_search_extract',includedInAdmission:false};
}
data.completionDecision={status:'user_approved_internal_simulation',appliesTo:['group_service_cost','group_size_limit','travel_time','unpublished_operating_hours'],estimatesApproved:true,scope:'Chỉ kiểm tra tính khả thi và tạo lịch trình mẫu; không phải giá hoặc thông tin chính thức.'};
const ids=new Set(data.places.map(p=>p.placeId));if(ids.size!==input.places.length)throw Error('Duplicate place IDs');
for(const a of data.areas)for(const id of [...a.corePlaceIds,...a.nearbyFallbackPlaceIds])if(!ids.has(id))throw Error('Unknown area place '+id);
writeFileSync(root+'planner-dataset-v2.json',JSON.stringify(data,null,2)+'\n');
const counts=Object.fromEntries(['inner_city_priority','deferred_operator_confirmation','outside_current_areas'].map(t=>[t,data.places.filter(p=>p.rolloutTier===t).length]));
const report=['# LocalLens — Bộ địa điểm cá nhân hóa v2','',`Ngày đối chiếu: ${checked}. Giữ đủ ${data.places.length} địa điểm và ID nguồn.`,
 '',`Ưu tiên nội thành: ${counts.inner_city_priority}; chờ điều kiện tiếp khách: ${counts.deferred_operator_confirmation}; ngoài vùng hiện tại: ${counts.outside_current_areas}.`,
 '', '## Những gì đã sửa', '',
 '- Tách giá vé quan sát được từ nguồn chính thức khỏi khoảng chi tiêu ước tính ban đầu. Giá chưa rõ để null, không thay bằng 0.',
 '- Bổ sung nguồn, ngày đối chiếu, giờ nghỉ trưa và điều kiện vé. Giữ nguyên nghiên cứu gốc trong mỗi bản ghi.',
 '- Tách chi phí theo người và theo nhóm; không tự cộng mua sắm vào ngân sách bắt buộc.',
 '- Ngừng dùng thời gian trung bình giữa khu vực để khẳng định một tuyến khả thi. Chưa có cạnh di chuyển được duyệt.',
 '- Không biến tham quan khu làng nghề thành một buổi thực hành có thể đặt chỗ.',
 '- Dữ liệu nghiên cứu không tự bật published/adminVerified/plannerEligible.',
 '', '## Đã đối chiếu trực tiếp', '',
 '- Dinh Độc Lập: 07:00–18:00; vé toàn bộ 80.000 VND cho tuổi 18–59, không phải mọi nhóm tuổi hay mọi loại vé.',
 '- Bảo tàng Chứng tích Chiến tranh: vé người lớn quốc tế 40.000 VND; 07:30–17:30, nhận khách đến 17:00.',
 '- Bảo tàng Lịch sử: vé phổ thông 30.000 VND; thứ Ba–Chủ nhật, 08:00–11:30 và 13:00–17:00.',
 '- Bảo tàng Tôn Đức Thắng: đối chiếu được giờ thứ Ba–Chủ nhật, chưa dùng thông tin miễn phí cũ làm xác nhận giá hiện tại.',
 '- Bảo tàng Mỹ thuật: nguồn tìm kiếm ghi 30.000 VND nhưng mở trực tiếp lỗi 502; giữ ở trạng thái cần kiểm tra, chưa nâng thành dữ liệu vận hành.',
 '', '## Bổ sung lần rà soát tiếp theo', '',
 '- Củ Chi: nguồn đơn vị công bố 35.000 đồng phí tham quan và 100.000 đồng phục vụ, hướng dẫn cho khách ngoại quốc từ 01/02/2026; tổng hai khoản 135.000 đồng/người. Không gồm xe và ăn uống.',
 '- Huynh Hoa: nguồn đơn vị nêu 06:00–22:00 cả tuần và 73.000 đồng/ổ; giữ giá món riêng với vé tham quan.',
 '- Bảo tàng Phụ nữ Nam Bộ: giờ sáng 07:30–11:30, chiều 13:30–17:00; chưa gán ngày trong tuần vì nguồn chưa nêu.',
 '- Bảo tàng TP.HCM: thêm đầu mối liên hệ; không áp dụng ưu đãi năm 2024 cho năm 2026.',
 '- FITO: loại nguồn website có nội dung không liên quan; tài liệu Sở năm 2022 được giữ như nguồn lịch sử, chưa coi là giờ hiện hành.',
 '- Người dùng đã đồng ý dùng ước tính nội bộ. Xem SIMULATION-README.md và planner-simulation-v1.json; dữ liệu nghiên cứu vẫn không bị gắn nhãn đã xác nhận.',
 '', '## Danh sách xử lý', '', '| ID | Địa điểm | Nhóm xử lý | Còn thiếu |','|---|---|---|---|',
 ...data.places.map(p=>`| ${p.placeId} | ${p.nameVi} | ${p.rolloutTier} | ${p.blockingReasons.join(', ')} |`),
 '', '## Tích hợp CSDL hiện tại', '',
 'Bộ tạo tour hiện đọc snapshot đã công bố, dùng UUID, bảng giờ mở cửa và cạnh di chuyển. Không thể thay thẳng bằng ID LL-Rxx hoặc ma trận 5 khu vực. Bản v2 được lưu riêng ở private.planner_dataset_revisions; không thay snapshot đang chạy.',
 '', 'Trước khi phát hành cần ánh xạ slug sang UUID, chốt điểm gặp và sức chứa, giá dịch vụ nhóm, cạnh di chuyển đi/về, rồi mới tạo snapshot. Khu vực không đủ điểm phải báo không có tuyến phù hợp; không hứa luôn có kết quả.',
 '', '## Nguồn đối chiếu', '',...sources.map(s=>`- [${s.id}](${s.url}) — ${s.method}; ${s.observedOn}.`),
 '', 'Chạy lại: node scripts/prepare-planner-dataset-v2.mjs. File gốc trong Downloads không bị chỉnh sửa.'];
writeFileSync(root+'README.md',report.join('\n')+'\n');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const sql=`begin;\ncreate table if not exists private.planner_dataset_revisions (source_sha256 text primary key, schema_version text not null, payload jsonb not null, imported_at timestamptz not null default now());\nalter table private.planner_dataset_revisions enable row level security;\nrevoke all on private.planner_dataset_revisions from public,anon,authenticated;\ninsert into private.planner_dataset_revisions(source_sha256,schema_version,payload) values (${quote(data.sourceSha256)},${quote(data.schemaVersion)},${quote(JSON.stringify(data))}::jsonb) on conflict(source_sha256) do nothing;\ncommit;\n`;
writeFileSync(root+'stage-private.sql',sql);
console.log(JSON.stringify({places:data.places.length,...counts,observedAdmissionPrices:Object.keys(fees).length,observedOperatingHours:hoursIds.size,plannerEligible:0}));
