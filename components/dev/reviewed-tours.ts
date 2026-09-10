import original from "@/data/demo/thesis-demo.v1.json";
import { reviewedToursEnglish, reviewedEnglishExclusions, reviewedEnglishCancellation } from "./reviewed-tours-en";

// Local design data only: approved itinerary proposals, not supplier bookings.
const proposals = [
  {
    title: "Dấu ấn Sài Gòn", en: "Saigon Heritage", duration: 270, price: 790000, time: "08:30–13:00",
    meeting: "Trước cửa chính Bưu điện Trung tâm, 2 Công xã Paris, TP.HCM.",
    summary: "Dạo bước qua những dấu ấn của Sài Gòn, từ kiến trúc Bưu điện Trung tâm đến câu chuyện lịch sử tại Dinh Độc Lập và nhịp sống ở Chợ Bến Thành. Khép lại buổi khám phá với bữa trưa cơm tấm mang hương vị quen thuộc của thành phố.",
    stops: ["08:30–08:40 · Tập trung — Bưu điện Trung tâm, 2 Công xã Paris", "08:40–09:10 · Tham quan Bưu điện, viết bưu thiếp", "09:10–09:30 · Đi bộ đến Dinh Độc Lập", "09:30–11:00 · Dinh Độc Lập và Nhà Trưng bày — 135 Nam Kỳ Khởi Nghĩa", "11:00–11:15 · Nghỉ, vệ sinh", "11:15–11:40 · Đi bộ đến Chợ Bến Thành", "11:40–12:05 · Khám phá Chợ Bến Thành — phía đường Lê Lợi", "12:05–12:15 · Đi bộ đến điểm ăn trưa gần Chợ Bến Thành", "12:15–13:00 · Ăn trưa với một phần cơm tấm Sài Gòn và một đồ uống cơ bản; trò chuyện và kết thúc tour"],
    includes: ["Hướng dẫn viên", "Vé Dinh và Nhà Trưng bày", "Một phần cơm tấm Sài Gòn và một đồ uống cơ bản", "Bưu thiếp; không gồm bưu phí quốc tế", "Bảo hiểm theo gói được xác nhận"],
    note: "Tuyến đi bộ cần khảo sát; phương án trời mưa sẽ được xác nhận.", start: "01:30", end: "06:00",
  },
  {
    title: "Sắc màu Chợ Lớn và trải nghiệm làm đèn Phú Bình", en: "Cholon Culture and Phu Binh Lantern Making", duration: 540, price: 1990000, time: "09:00–18:00",
    meeting: "Điểm đón xe tại trung tâm TP.HCM — vị trí cụ thể sẽ được xác nhận trước khi mở bán.",
    summary: "Khám phá nét văn hóa người Hoa tại Hội quán Tuệ Thành, rồi tìm hiểu nghề làm đèn truyền thống Phú Bình và tự tay trang trí chiếc đèn của mình. Hành trình tiếp nối giữa sắc hoa và hương vị ẩm thực đường phố Hồ Thị Kỷ.",
    stops: ["09:00–09:15 · Tập trung tại điểm đón xe trung tâm — chờ xác nhận", "09:15–10:00 · Xe đến Hội quán Tuệ Thành", "10:00–10:45 · Hội quán Tuệ Thành / Chùa Bà Thiên Hậu — 710 Nguyễn Trãi", "10:45–11:00 · Di chuyển đến nhà hàng", "11:00–11:45 · Ăn trưa tại Chợ Lớn — nhà hàng chờ xác nhận", "11:45–12:30 · Xe đến cơ sở làm đèn Phú Bình", "12:30–13:00 · Nghe chuyện nghề và xem trình diễn làm đèn truyền thống Phú Bình", "13:00–14:30 · Dán giấy, phối màu và trang trí đèn trên khung chuẩn bị sẵn", "14:30–15:00 · Hoàn thiện, đóng gói và nghỉ", "15:00–15:45 · Xe đến Hồ Thị Kỷ", "15:45–16:05 · Dạo chợ hoa — đường Hồ Thị Kỷ", "16:05–16:55 · Thưởng thức ẩm thực đường phố tại Hồ Thị Kỷ", "16:55–17:40 · Xe về điểm hẹn trung tâm", "17:40–18:00 · Dự phòng giao thông và trả khách"],
    includes: ["Xe và hướng dẫn viên theo chương trình", "Workshop, vật liệu và sản phẩm đèn dự kiến", "Một bữa trưa và ba phần ăn thử", "Nước uống", "Bảo hiểm theo gói được xác nhận"],
    note: "Cơ sở, sức chứa và báo giá workshop chưa xác nhận. Nhận sản phẩm cuối buổi phụ thuộc kết quả thử vật liệu và đóng gói.", start: "02:00", end: "11:00",
  },
  {
    title: "Mỹ thuật Sài Gòn và du ngoạn sông chiều tối", en: "Saigon Fine Arts and Evening River Cruise", duration: 330, price: 1590000, time: "15:00–20:30",
    meeting: "Trước Bảo tàng Mỹ thuật TP.HCM, 97 Phó Đức Chính.",
    summary: "Dành một buổi chiều khám phá nghệ thuật và kiến trúc tại Bảo tàng Mỹ thuật, rồi ngắm Sài Gòn từ mặt sông trên chuyến du ngoạn khởi hành ở Bạch Đằng. Khi thành phố lên đèn, dạo phố đi bộ Nguyễn Huệ và khép lại hành trình bằng bữa tối cùng một tách cà phê hoặc trà.",
    stops: ["15:00–15:15 · Tập trung — Bảo tàng Mỹ thuật, 97 Phó Đức Chính", "15:15–16:30 · Tham quan tác phẩm và kiến trúc chọn lọc", "16:30–17:00 · Xe đến Bến Bạch Đằng, 10B Tôn Đức Thắng", "17:00–17:20 · Nghỉ, vệ sinh, ngắm bờ sông / dự phòng", "17:20–18:00 · Kiểm tra vé, tập trung và lên tàu", "18:00–18:45 · Du ngoạn sông — River Seat, quay về Bạch Đằng", "18:45–19:05 · Xuống tàu, đi bộ đến Nguyễn Huệ", "19:05–19:25 · Dạo phố đi bộ Nguyễn Huệ, chụp ảnh", "19:25–20:15 · Ăn tối và cà phê/trà tại cùng nhà hàng — chờ xác nhận", "20:15–20:30 · Trò chuyện, dự phòng và kết thúc"],
    includes: ["Hướng dẫn viên và vé Bảo tàng Mỹ thuật", "Một chặng xe đến Bạch Đằng", "Vé tàu River Seat dự kiến suất 18:00", "Một bữa tối trên bờ và một cà phê/trà", "Nước uống và bảo hiểm theo gói được xác nhận"],
    note: "Suất tàu và nhà hàng cần xác nhận theo ngày. Vé tàu theo điều kiện nhà cung cấp; không cam kết có biểu diễn đường phố.", start: "08:00", end: "13:30",
  },
];

export const reviewedDataset = {
  ...original,
  places: proposals.flatMap((p, i) => p.stops.map((title, j) => ({ id: `review-${i}-${j}`, slug: `review-${i}-${j}`, translations: { vi: { title }, en: { title: reviewedToursEnglish[i].stops[j] } } }))),
  tours: original.tours.map((tour, i) => {
    const p = proposals[i];
    const english = reviewedToursEnglish[i];
    const summary = p.summary;
    return { ...tour, durationMinutes: p.duration, priceVndPerPerson: p.price,
      overview: { vi: { transport: ["Đi bộ", "Xe đưa đón & đi bộ", "Xe, du thuyền & đi bộ"][i], note: p.note }, en: { transport: ["Walking", "Vehicle transfers & walking", "Vehicle, river cruise & walking"][i], note: english.note } },
      translations: { vi: { title: p.title, summary, meetingPoint: p.meeting }, en: { title: p.en, summary: english.summary, meetingPoint: english.meetingPoint } },
      englishInclusions: english.inclusions, englishExclusions: reviewedEnglishExclusions, englishCancellationPolicy: reviewedEnglishCancellation,
      stopPlaceIds: p.stops.map((_, j) => `review-${i}-${j}`), inclusions: p.includes,
      exclusions: ["Đưa đón khách sạn ngoài chương trình", "Mua sắm, gọi thêm món và chi phí cá nhân"],
      cancellationPolicy: "Bản xem trước trên localhost. Chỉ mở bán sau khi xác nhận nhà cung cấp, điều kiện đủ đoàn 6 khách và chính sách hủy. Không tạo đặt chỗ hay thanh toán thật.",
      departures: tour.departures.slice(0, 1).map(d => ({ ...d, capacity: 15, startAt: `${d.startAt.slice(0, 10)}T${p.start}:00.000Z`, endAt: `${d.endAt.slice(0, 10)}T${p.end}:00.000Z` })),
    };
  }),
};
