import english from "@/messages/en.json";
import vietnamese from "@/messages/vi.json";

import type { Locale } from "@/lib/i18n/config";

export type Dictionary = {
  brand: string;
  home: {
    eyebrow: string;
    title: string;
    subtitle: string;
    heroPrimaryCta: string;
    heroSecondaryCta: string;
    heroActionsLabel: string;
    heroNote: string;
    heroTrust: string;
    discoveryEyebrow: string;
    discoveryTitle: string;
    discoveryIntro: string;
    fixedTours: Array<{
      id: string;
      icon: string;
      title: string;
      description: string;
      detail: string;
    }>;
    fixedToursCta: string;
    trustEyebrow: string;
    trustTitle: string;
    trustIntro: string;
    trustItems: Array<{
      icon: string;
      title: string;
      description: string;
    }>;
    personalizationEyebrow: string;
    personalizationTitle: string;
    personalizationIntro: string;
    personalizationForm: {
      formLabel: string;
      durationLabel: string;
      durationOptions: Array<{ value: string; label: string }>;
      areasLabel: string;
      areasHint: string;
      areaOptions: Array<{ value: string; label: string }>;
      budgetLabel: string;
      budgetOptions: Array<{ value: string; label: string }>;
      startDateLabel: string;
      startDateHint: string;
      startTimeLabel: string;
      languageLabel: string;
      languageOptions: Array<{ value: string; label: string }>;
      partySizeLabel: string;
      partySizeHint: string;
      prioritiesLegend: string;
      priorities: string[];
      paceLabel: string;
      paceOptions: Array<{ value: string; label: string }>;
      dietLabel: string;
      dietOptions: Array<{ value: string; label: string }>;
      mobilityLabel: string;
      mobilityOptions: Array<{ value: string; label: string }>;
      specialNeedsLabel: string;
      specialNeedsHint: string;
      submitLabel: string;
      previewMessage: string;
      confirmationMessage: string;
    };
  };
  navigation: {
    primary: string;
    explore: string;
    fixedTours: string;
    planTrip: string;
    signIn: string;
    skipToContent: string;
  };
  language: {
    label: string;
    options: {
      en: string;
      vi: string;
    };
  };
  footer: {
    summary: string;
    copyright: string;
  };
  serviceStatus: {
    available: string;
    degraded: string;
    unavailable: string;
  };
};

const customerHomeCopy: Record<Locale, Dictionary["home"]> = {
  en: {
    eyebrow: "Local knowledge, thoughtfully shared",
    title: "Discover Ho Chi Minh City through local eyes.",
    subtitle: "Authentic cultural experiences, thoughtfully planned for you.",
    heroPrimaryCta: "Browse fixed tours",
    heroSecondaryCta: "Build a personal route",
    heroActionsLabel: "Start exploring",
    heroNote: "For curious travelers who want more than a checklist.",
    heroTrust: "Company-managed places · Human-reviewed routes · English-friendly",
    discoveryEyebrow: "Choose your starting point",
    discoveryTitle: "Ways to see Saigon",
    discoveryIntro:
      "Follow a well-shaped route or tell us what you want to feel, taste, and understand.",
    fixedTours: [
      {
        id: "food",
        icon: "✦",
        title: "Food & flavor",
        description: "Follow the small stools, family kitchens, and stories behind every bite.",
        detail: "Taste-led · 3–4 hours",
      },
      {
        id: "history",
        icon: "◌",
        title: "History & culture",
        description: "Read the city through old streets, living traditions, and layered memories.",
        detail: "Story-led · Half day",
      },
      {
        id: "craft",
        icon: "⌁",
        title: "Craft & makers",
        description: "Meet the hands and patient rituals keeping local craft in motion.",
        detail: "Hands-on · Slow pace",
      },
      {
        id: "market",
        icon: "▦",
        title: "Markets & local life",
        description: "See how the city wakes, trades, gathers, and makes room for one more guest.",
        detail: "Everyday · Morning routes",
      },
      {
        id: "local-life",
        icon: "⊙",
        title: "Local life",
        description: "Make space for ordinary rituals, neighborhood corners, and the people who give them meaning.",
        detail: "People-led · Unhurried",
      },
    ],
    fixedToursCta: "See all fixed tours",
    trustEyebrow: "A considered way to wander",
    trustTitle: "Local, clear, and made around you",
    trustIntro:
      "LocalLens keeps discovery grounded in places our team manages, checks, and can explain.",
    trustItems: [
      {
        icon: "01",
        title: "Know the place",
        description: "Explore cultural, historic, craft, market, local-life, and food experiences beyond the usual highlights.",
      },
      {
        icon: "02",
        title: "Shape the day",
        description: "Share your time, pace, budget, and access needs before a route takes form.",
      },
      {
        icon: "03",
        title: "Stay in control",
        description: "Review a clear plan and request changes before anything becomes an order.",
      },
    ],
    personalizationEyebrow: "Your brief, your rhythm",
    personalizationTitle: "Tell us what a good day in the city feels like",
    personalizationIntro:
      "Start with a few practical details. This preview keeps your preferences on this page until the planning service is connected.",
    personalizationForm: {
      formLabel: "Personalized route preferences",
      durationLabel: "How much time do you have?",
      durationOptions: [
        { value: "half-day", label: "Half day" },
        { value: "full-day", label: "Full day" },
        { value: "two-days", label: "Two days" },
      ],
      areasLabel: "Which areas interest you?",
      areasHint: "Choose one or more areas.",
      areaOptions: [
        { value: "central", label: "District 1 & central" },
        { value: "cholon", label: "Cho Lon" },
        { value: "thuduc", label: "Thu Duc" },
        { value: "riverside", label: "Riverside" },
      ],
      budgetLabel: "Comfortable budget per person",
      budgetOptions: [
        { value: "under-30", label: "Under US$30" },
        { value: "30-60", label: "US$30–60" },
        { value: "60-100", label: "US$60–100" },
        { value: "100-plus", label: "US$100+" },
      ],
      startDateLabel: "Preferred start date",
      startDateHint: "Use your local travel date.",
      startTimeLabel: "Preferred start time",
      languageLabel: "Experience language",
      languageOptions: [
        { value: "english", label: "English" },
        { value: "vietnamese", label: "Vietnamese" },
        { value: "either", label: "English or Vietnamese" },
      ],
      partySizeLabel: "People in your party",
      partySizeHint: "Including children.",
      prioritiesLegend: "What should lead the route?",
      priorities: [
        "Food & everyday flavor",
        "History & living culture",
        "Craft & local makers",
        "Markets & neighborhood life",
      ],
      paceLabel: "Preferred pace",
      paceOptions: [
        { value: "easy", label: "Easy and spacious" },
        { value: "balanced", label: "A balanced mix" },
        { value: "curious", label: "Curious and full" },
      ],
      dietLabel: "Dietary preferences",
      dietOptions: [
        { value: "none", label: "No special preference" },
        { value: "vegetarian", label: "Vegetarian" },
        { value: "vegan", label: "Vegan" },
        { value: "allergies", label: "I have allergies" },
      ],
      mobilityLabel: "Mobility needs",
      mobilityOptions: [
        { value: "none", label: "No special requirement" },
        { value: "less-walking", label: "Prefer less walking" },
        { value: "step-free", label: "Need step-free options" },
      ],
      specialNeedsLabel: "Anything else we should plan around?",
      specialNeedsHint: "Optional — tell us about accessibility, celebrations, or a must-see detail.",
      submitLabel: "Preview my route brief",
      previewMessage: "Preview only: your preferences stay on this page and are not sent yet.",
      confirmationMessage: "Your route is confirmed.",
    },
  },
  vi: {
    eyebrow: "Hiểu địa phương, chia sẻ có chủ đích",
    title: "Khám phá Thành phố Hồ Chí Minh qua góc nhìn người bản địa.",
    subtitle: "Trải nghiệm văn hóa đích thực, được lên kế hoạch dành riêng cho bạn.",
    heroPrimaryCta: "Xem tour cố định",
    heroSecondaryCta: "Tạo lịch trình riêng",
    heroActionsLabel: "Bắt đầu khám phá",
    heroNote: "Dành cho những người muốn hiểu thành phố, không chỉ ghé qua.",
    heroTrust: "Địa điểm do công ty quản lý · Lịch trình được kiểm duyệt · Hỗ trợ tiếng Anh",
    discoveryEyebrow: "Chọn cách bắt đầu",
    discoveryTitle: "Nhìn Sài Gòn theo cách của bạn",
    discoveryIntro:
      "Theo một lịch trình được thiết kế sẵn hoặc chia sẻ điều bạn muốn cảm nhận, nếm thử và tìm hiểu.",
    fixedTours: [
      {
        id: "food",
        icon: "✦",
        title: "Ẩm thực & hương vị",
        description: "Theo những quán nhỏ, căn bếp gia đình và câu chuyện sau mỗi món ăn.",
        detail: "Theo vị giác · 3–4 giờ",
      },
      {
        id: "history",
        icon: "◌",
        title: "Lịch sử & văn hóa",
        description: "Đọc thành phố qua những con phố cũ, truyền thống sống động và ký ức nhiều lớp.",
        detail: "Theo câu chuyện · Nửa ngày",
      },
      {
        id: "craft",
        icon: "⌁",
        title: "Làng nghề & người làm nghề",
        description: "Gặp những đôi tay và nhịp sống bền bỉ giữ nghề địa phương tiếp tục chuyển động.",
        detail: "Trải nghiệm · Nhịp chậm",
      },
      {
        id: "market",
        icon: "▦",
        title: "Chợ & đời sống địa phương",
        description: "Xem thành phố thức giấc, mua bán, gặp gỡ và đón thêm một vị khách.",
        detail: "Đời thường · Buổi sáng",
      },
      {
        id: "local-life",
        icon: "⊙",
        title: "Đời sống địa phương",
        description: "Dành chỗ cho những nhịp sinh hoạt thường ngày, góc phố và con người làm nên ý nghĩa của chúng.",
        detail: "Theo con người · Thong thả",
      },
    ],
    fixedToursCta: "Xem tất cả tour cố định",
    trustEyebrow: "Một cách khám phá có cân nhắc",
    trustTitle: "Địa phương, rõ ràng và xoay quanh bạn",
    trustIntro:
      "LocalLens giữ trải nghiệm gắn với những địa điểm đội ngũ quản lý, kiểm tra và có thể giới thiệu.",
    trustItems: [
      {
        icon: "01",
        title: "Hiểu nơi mình đến",
        description: "Khám phá trải nghiệm lịch sử, văn hóa, làng nghề, chợ, đời sống địa phương và ẩm thực.",
      },
      {
        icon: "02",
        title: "Tạo nhịp cho ngày đi",
        description: "Chia sẻ thời gian, tốc độ, ngân sách và nhu cầu tiếp cận trước khi tạo lịch trình.",
      },
      {
        icon: "03",
        title: "Bạn luôn quyết định",
        description: "Xem lịch trình rõ ràng và yêu cầu chỉnh sửa trước khi có bất kỳ đơn đặt nào.",
      },
    ],
    personalizationEyebrow: "Yêu cầu của bạn, nhịp điệu của bạn",
    personalizationTitle: "Hãy kể một ngày lý tưởng ở thành phố với bạn",
    personalizationIntro:
      "Bắt đầu từ vài thông tin thực tế. Bản xem trước này giữ lựa chọn trên trang cho đến khi dịch vụ lập kế hoạch được kết nối.",
    personalizationForm: {
      formLabel: "Tùy chọn lịch trình riêng",
      durationLabel: "Bạn có bao nhiêu thời gian?",
      durationOptions: [
        { value: "half-day", label: "Nửa ngày" },
        { value: "full-day", label: "Một ngày" },
        { value: "two-days", label: "Hai ngày" },
      ],
      areasLabel: "Bạn quan tâm khu vực nào?",
      areasHint: "Chọn một hoặc nhiều khu vực.",
      areaOptions: [
        { value: "central", label: "Quận 1 & trung tâm" },
        { value: "cholon", label: "Chợ Lớn" },
        { value: "thuduc", label: "Thủ Đức" },
        { value: "riverside", label: "Khu ven sông" },
      ],
      budgetLabel: "Ngân sách phù hợp mỗi người",
      budgetOptions: [
        { value: "under-30", label: "Dưới 30 USD" },
        { value: "30-60", label: "30–60 USD" },
        { value: "60-100", label: "60–100 USD" },
        { value: "100-plus", label: "Trên 100 USD" },
      ],
      startDateLabel: "Ngày bắt đầu mong muốn",
      startDateHint: "Dùng ngày bạn sẽ đi du lịch.",
      startTimeLabel: "Thời gian bắt đầu mong muốn",
      languageLabel: "Ngôn ngữ trải nghiệm",
      languageOptions: [
        { value: "english", label: "Tiếng Anh" },
        { value: "vietnamese", label: "Tiếng Việt" },
        { value: "either", label: "Tiếng Anh hoặc tiếng Việt" },
      ],
      partySizeLabel: "Số người trong nhóm",
      partySizeHint: "Bao gồm cả trẻ em.",
      prioritiesLegend: "Điều gì nên dẫn dắt lịch trình?",
      priorities: [
        "Ẩm thực & hương vị đời thường",
        "Lịch sử & văn hóa sống",
        "Làng nghề & người làm nghề",
        "Chợ & đời sống khu phố",
      ],
      paceLabel: "Nhịp độ mong muốn",
      paceOptions: [
        { value: "easy", label: "Thư thả và rộng rãi" },
        { value: "balanced", label: "Cân bằng" },
        { value: "curious", label: "Tò mò và nhiều điểm" },
      ],
      dietLabel: "Nhu cầu ăn uống",
      dietOptions: [
        { value: "none", label: "Không có yêu cầu đặc biệt" },
        { value: "vegetarian", label: "Ăn chay" },
        { value: "vegan", label: "Thuần chay" },
        { value: "allergies", label: "Tôi có dị ứng" },
      ],
      mobilityLabel: "Nhu cầu di chuyển",
      mobilityOptions: [
        { value: "none", label: "Không có yêu cầu đặc biệt" },
        { value: "less-walking", label: "Ưu tiên đi bộ ít hơn" },
        { value: "step-free", label: "Cần lựa chọn không bậc thang" },
      ],
      specialNeedsLabel: "Có điều gì khác cần lưu ý?",
      specialNeedsHint: "Không bắt buộc — hãy chia sẻ nhu cầu tiếp cận, dịp đặc biệt hoặc điều nhất định phải xem.",
      submitLabel: "Xem trước yêu cầu lịch trình",
      previewMessage: "Chỉ là bản xem trước: lựa chọn của bạn vẫn ở trên trang và chưa được gửi đi.",
      confirmationMessage: "Lịch trình của bạn đã được xác nhận.",
    },
  },
};

const dictionaries = {
  en: { ...english, home: customerHomeCopy.en },
  vi: { ...vietnamese, home: customerHomeCopy.vi },
} satisfies Record<Locale, Dictionary>;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
