import { AdminPlaceError, type AdminPlace, type AdminPlaceInput, type AdminPlacesPort } from "@/lib/application/admin-places";
import sourceCatalog from "@/data/sources/hcmc-places.v1.json";

type Seed = {
  name: string;
  area: string;
  category: string;
  hours: string;
  duration: number;
  cost: number | null;
  image: string;
  address?: string;
  description?: string;
  sourceUrl?: string;
  verifiedAt?: string;
  sourceNote?: string;
  status?: AdminPlace["status"];
};

const demoSeeds: Seed[] = [
  { name: "Bưu điện Trung tâm Sài Gòn", area: "Quận 1", category: "Lịch sử & văn hóa", hours: "07:30 – 18:00", duration: 60, cost: 0, image: "history" },
  { name: "Chợ Bình Tây", area: "Quận 6", category: "Chợ & đời sống", hours: "06:00 – 18:00", duration: 90, cost: 0, image: "market" },
  { name: "Nhà thờ Tân Định", area: "Quận 3", category: "Lịch sử & văn hóa", hours: "08:00 – 17:00", duration: 30, cost: 0, image: "history" },
  { name: "Hẻm cà phê vợt", area: "Quận 3", category: "Ẩm thực", hours: "06:00 – 22:00", duration: 60, cost: 50000, image: "street-food" },
  { name: "Địa đạo Củ Chi – Bến Đình", area: "H. Củ Chi", category: "Lịch sử & văn hóa", hours: "07:00 – 17:00", duration: 180, cost: 110000, image: "history" },
  { name: "Chợ hoa Hồ Thị Kỷ", area: "Quận 10", category: "Chợ & đời sống", hours: "06:00 – 22:00", duration: 90, cost: 0, image: "market" },
  { name: "Đình Thần An Khánh", area: "TP. Thủ Đức", category: "Lịch sử & văn hóa", hours: "08:00 – 17:00", duration: 45, cost: 0, image: "history" },
];

const categoryLabels: Record<string, string> = {
  history: "Lịch sử & văn hóa",
  street_food: "Ẩm thực",
  traditional_market: "Chợ & đời sống",
  traditional_craft: "Làng nghề",
};

const areaLabels: Record<string, string> = {
  "central-historical": "Khu trung tâm - di sản",
  "district-3-cultural": "Quận 3",
  "district-5-chinatown": "Quận 5 - Chợ Lớn",
  "outer-hcmc": "Khu vực ngoại thành",
};

function imageFor(types: readonly string[]) {
  if (types.includes("street_food")) return "street-food";
  if (types.includes("traditional_market")) return "market";
  if (types.includes("traditional_craft")) return "craft";
  return "history";
}

function researchedAdmission(place: (typeof sourceCatalog.places)[number]) {
  return place.officialAdmission.status === "known" ? place.officialAdmission.amountVnd : null;
}

function canPublishResearch(place: (typeof sourceCatalog.places)[number]) {
  return Boolean(
    place.sourceUrl &&
      place.verifiedAt &&
      place.hours.status === "known" &&
      place.officialAddress.status === "known" &&
      place.officialAdmission.status === "known",
  );
}

function researchSourceNote(place: (typeof sourceCatalog.places)[number]) {
  const admission = researchedAdmission(place);
  const admissionNote =
    admission === null
      ? "Chưa tìm thấy mức vé trên nguồn đã kiểm tra; không coi là miễn phí."
      : admission === 0
        ? "Nguồn đã kiểm tra không ghi nhận phí vào cửa; chi phí ăn uống, mua sắm, dịch vụ và di chuyển chưa bao gồm."
        : `Vé người lớn theo nguồn chính thức: ${new Intl.NumberFormat("vi-VN").format(admission)} đồng/người; chi phí ăn uống, dịch vụ và di chuyển chưa bao gồm.`;
  const unknownNote = place.unknownFacts.length ? ` Lưu ý cần xác minh thêm: ${place.unknownFacts.join(" ")}` : "";
  return `Đã đối chiếu nguồn ngày ${place.verifiedAt}; ${admissionNote}${unknownNote}`;
}

const researchedSeeds: Seed[] = sourceCatalog.places.map((place) => {
  const opening = place.hours.windows[0];
  return {
    name: place.title.vi,
    area: areaLabels[place.operationalArea] ?? place.operationalArea,
    category: place.experienceTypes.map((type) => categoryLabels[type] ?? type).find(Boolean) ?? "Lịch sử & văn hóa",
    hours: opening ? `${opening.opens} – ${opening.closes}` : "",
    duration: place.visitDurationMinutes,
    cost: researchedAdmission(place),
    image: imageFor(place.experienceTypes),
    address: place.officialAddress.value ?? undefined,
    description: place.description.vi,
    sourceUrl: place.sourceUrl,
    verifiedAt: place.verifiedAt,
    sourceNote: researchSourceNote(place),
    status: canPublishResearch(place) ? "published" : "draft",
  };
});

// Keep the existing screen fixtures while adding the researched catalogue.
// Only records with verified source, hours, address and admission facts are published in this demo; all other research records remain drafts.
// Research-only records are deliberately not treated as published operational data.
const seeds = [
  ...demoSeeds,
  ...researchedSeeds.filter((source) => !demoSeeds.some((demo) => demo.name === source.name)),
];

function validateBasic(input: AdminPlaceInput) {
  if (!input.name.trim()) throw new AdminPlaceError("Vui lòng nhập tên địa điểm.", "name");
  if (!Number.isFinite(input.duration) || input.duration <= 0) throw new AdminPlaceError("Thời lượng phải lớn hơn 0 phút.", "duration");
  const cost = input.cost; if (cost === null || !Number.isFinite(cost) || cost < 0) throw new AdminPlaceError("Chi phí phải là số không âm.", "cost");
  const image = input.imageUrl.trim();
  if (image) {
    let safe = /^\/(?!\/)/.test(image) && !/[\\\u0000-\u001f]/.test(image);
    if (!safe) {
      try { safe = ["http:", "https:"].includes(new URL(image).protocol) && !/[\\\u0000-\u001f]/.test(image); } catch { /* Report invalid image below. */ }
    }
    if (!safe) throw new AdminPlaceError("Ảnh phải dùng đường dẫn nội bộ hoặc URL http/https hợp lệ.", "imageUrl");
  }
}

function validatePublishing(input: AdminPlaceInput) {
  validateBasic(input);
  for (const [field, label] of [["address", "địa chỉ"], ["area", "khu vực"], ["hours", "giờ hoạt động"], ["description", "mô tả"], ["imageUrl", "hình ảnh"], ["sourceNote", "ghi chú nguồn"]] as const) {
    if (!input[field].trim()) throw new AdminPlaceError(`Vui lòng bổ sung ${label} trước khi xuất bản.`, field);
  }
  let validUrl = false;
  try { validUrl = ["http:", "https:"].includes(new URL(input.sourceUrl).protocol); } catch { /* Invalid URLs are reported below. */ }
  if (!validUrl) throw new AdminPlaceError("Vui lòng nhập đường dẫn nguồn thông tin hợp lệ (http hoặc https).", "sourceUrl");
  const date = new Date(`${input.verifiedAt}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", numberingSystem: "latn" }).formatToParts(new Date());
  const today = ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.verifiedAt) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.verifiedAt || input.verifiedAt > today) {
    throw new AdminPlaceError("Ngày kiểm chứng phải hợp lệ và không nằm trong tương lai.", "verifiedAt");
  }
}

/** Per-instance fictional operational data. No database, network or browser persistence. */
export function createDemoAdminPlacesPort(): AdminPlacesPort {
  const places: AdminPlace[] = seeds.map((seed, index) => ({
    id: `demo-place-${index + 1}`, name: seed.name, area: seed.area, category: seed.category, hours: seed.hours, duration: seed.duration, cost: seed.cost,
    address: seed.address ?? `${seed.name}, ${seed.area}, TP. Hồ Chí Minh (địa chỉ minh họa)`,
    description: seed.description ?? `Địa điểm ${seed.name} trong danh mục minh họa LocalLens. Giờ hoạt động, thời lượng và chi phí là dữ liệu giả định để duyệt giao diện; cần kiểm chứng trước khi sử dụng thực tế.`,
    imageUrl: `/images/editorial/category-${seed.image}.webp`,
    sourceUrl: seed.sourceUrl ?? (index === 6 ? "" : `https://example.com/demo/places/${index + 1}`),
    verifiedAt: seed.verifiedAt ?? (index === 6 ? "" : "2026-09-01"),
    sourceNote: seed.sourceNote ?? "Nguồn, ngày kiểm chứng và thông tin vận hành minh họa; chưa được kiểm chứng thực tế. Ảnh minh họa theo nhóm địa điểm, không phải ảnh xác thực tại địa điểm.",
    status: seed.status ?? (index === 4 ? "archived" : index === 6 ? "draft" : "published"),
  }));
  function find(id: string) {
    const place = places.find(item => item.id === id);
    if (!place) throw new AdminPlaceError("Không tìm thấy địa điểm.");
    return place;
  }
  return {
    async list() { return places.map(place => ({ ...place })); },
    async save(input, id) {
      validateBasic(input);
      // Copy only contract fields; callers cannot change identity/status through form data.
      const clean: AdminPlaceInput = {
        name: input.name.trim(), category: input.category.trim(), area: input.area.trim(), address: input.address.trim(),
        hours: input.hours.trim(), duration: input.duration, cost: input.cost, description: input.description.trim(),
        imageUrl: input.imageUrl.trim(), sourceUrl: input.sourceUrl.trim(), verifiedAt: input.verifiedAt.trim(), sourceNote: input.sourceNote.trim(),
      };
      if (id) {
        const existing = find(id);
        if (existing.status === "published") validatePublishing(clean);
        Object.assign(existing, clean);
      }
      else places.unshift({ ...clean, id: `demo-place-${crypto.randomUUID()}`, status: "draft" });
    },
    async setStatus(id, status) {
      const place = find(id);
      if (status === "published") validatePublishing(place);
      place.status = status;
    },
  };
}
