import english from "@/messages/en.json";
import vietnamese from "@/messages/vi.json";

import type { ExperienceType } from "@/lib/domain/itinerary/contracts";
import type { Locale } from "@/lib/i18n/config";

export type PersonalizationPriorityKey =
  | "street_food"
  | "history"
  | "traditional_craft"
  | "traditional_market";

export type PlannerCopy = {
  heading: string;
  intro: string;
  simulatedDisclosure: string;
  proposalOnly: string;
  revisionLabel: string;
  currentRevisionLabel: string;
  activityLabel: string;
  startLabel: string;
  endLabel: string;
  visitDurationLabel: string;
  travelDurationLabel: string;
  costLabel: string;
  totalDurationLabel: string;
  totalCostLabel: string;
  warningsHeading: string;
  revisionHistoryHeading: string;
  noHistoryLabel: string;
  feedbackLabel: string;
  feedbackPlaceholder: string;
  refineLabel: string;
  refiningLabel: string;
  lockLabel: string;
  unlockLabel: string;
  feedbackRequiredMessage: string;
  revisionCreatedMessage: string;
  staleRevisionMessage: string;
  refreshLabel: string;
  revisionFeedbackLabel: string;
  backHomeLabel: string;
};

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
    heroStampTop: string;
    heroStampLine1: string;
    heroStampLine2: string;
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
    demoDisclosure: string;
    tourCatalog: {
      catalogHeading: string;
      catalogIntro: string;
      filtersLegend: string;
      keywordLabel: string;
      keywordPlaceholder: string;
      areaLabel: string;
      allAreasLabel: string;
      areaOptions: Array<{ value: string; label: string }>;
      experienceLabel: string;
      allExperienceTypesLabel: string;
      experienceTypeOptions: Array<{ value: ExperienceType; label: string }>;
      clearFiltersLabel: string;
      retryLabel: string;
      filteringStatus: string;
      resultCountLabel: string;
      detailsLabel: string;
      durationLabel: string;
      priceLabel: string;
      meetingPointLabel: string;
      experienceTypesLabel: string;
      areasLabel: string;
      stopsLabel: string;
      inclusionsLabel: string;
      exclusionsLabel: string;
      cancellationPolicyLabel: string;
      sourceLabel: string;
      attributionLabel: string;
      verifiedLabel: string;
      licenseLabel: string;
      noResults: string;
      errorMessage: string;
      retryableMessage: string;
      correlationLabel: string;
      disclosure: string;
      bookLabel: string;
    };
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
      durationHint: string;
      areasLabel: string;
      areasHint: string;
      areaOptions: Array<{ value: string; label: string }>;
      budgetLabel: string;
      budgetHint: string;
      budgetCurrencyLabel: string;
      budgetCurrencyOptions: Array<{ value: "VND" | "USD"; label: string }>;
      startDateLabel: string;
      startDateHint: string;
      startTimeLabel: string;
      timezoneHint: string;
      languageLabel: string;
      languageOptions: Array<{ value: "en" | "vi"; label: string }>;
      partySizeLabel: string;
      partySizeHint: string;
      prioritiesLegend: string;
      priorities: Array<{ key: PersonalizationPriorityKey; label: string }>;
      paceLabel: string;
      paceOptions: Array<{ value: "relaxed" | "active"; label: string }>;
      dietLabel: string;
      dietOptions: Array<{ value: string; label: string }>;
      mobilityLabel: string;
      mobilityOptions: Array<{ value: string; label: string }>;
      specialNeedsLabel: string;
      specialNeedsHint: string;
      submitLabel: string;
      validationMessage: string;
      previewMessage: string;
      confirmationMessage: string;
      plannerLinkLabel: string;
      plannerLinkDisclosure: string;
      preview: {
        heading: string;
        deterministicDisclosure: string;
        proposalOnly: string;
        startLabel: string;
        endLabel: string;
        visitDurationLabel: string;
        travelDurationLabel: string;
        travelCostLabel: string;
        placeCostLabel: string;
        totalsHeading: string;
        totalDurationLabel: string;
        totalVisitLabel: string;
        totalTravelLabel: string;
        totalCostLabel: string;
        warningMessage: string;
        errorMessage: string;
        retryableMessage: string;
        correlationLabel: string;
      };
    };
  };
  booking: {
    heading: string;
    intro: string;
    demoDisclosure: string;
    loadingLabel: string;
    invalidDepartureTitle: string;
    invalidPartySizeTitle: string;
    invalidDepartureMessage: string;
    invalidPartySizeMessage: string;
    backToToursLabel: string;
    partySizeLabel: string;
    partySizeHint: string;
    availabilityLabel: string;
    dateLabel: string;
    startLabel: string;
    timezoneLabel: string;
    meetingPointLabel: string;
    sourceLabel: string;
    sourceValue: string;
    unitPriceLabel: string;
    totalLabel: string;
    inclusionsLabel: string;
    inclusionsValue: string;
    continueLabel: string;
    paymentHeading: string;
    paymentIntro: string;
    paymentBanner: string;
    holdLabel: string;
    testSessionLabel: string;
    holdDurationLabel: string;
    testSessionDurationLabel: string;
    paymentStatusLabel: string;
    unpaidStatus: string;
    payLabel: string;
    payingLabel: string;
    successHeading: string;
    successMessage: string;
    successReferenceLabel: string;
    successStatusLabel: string;
    paidStatus: string;
    nextStepsLabel: string;
    nextStepsValue: string;
    cancelLabel: string;
    cancelledMessage: string;
    retryFlowMessage: string;
    retryLabel: string;
    errorLabel: string;
    soldOutMessage: string;
    holdExpiredMessage: string;
    sessionExpiredMessage: string;
    genericErrorMessage: string;
    tourTitles: Record<string, string>;
  };
  planner: PlannerCopy;
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
    heroStampTop: "SGN",
    heroStampLine1: "seen",
    heroStampLine2: "slowly",
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
    demoDisclosure:
      "Demo catalog: these fixed tours use internal sample places and do not accept bookings or payments yet.",
    tourCatalog: {
      catalogHeading: "Fixed tours in Ho Chi Minh City",
      catalogIntro: "Browse the internal demo catalog and inspect the facts behind each fixed route.",
      filtersLegend: "Filter the demo catalog",
      keywordLabel: "Search tours",
      keywordPlaceholder: "Search title or summary",
      areaLabel: "Area",
      allAreasLabel: "All areas",
      areaOptions: [
        { value: "demo-hcmc-district-1", label: "District 1 & central" },
        { value: "demo-hcmc-district-3", label: "District 3 & museum district" },
        { value: "demo-hcmc-district-5", label: "Cho Lon & District 5" },
        { value: "demo-hcmc-thu-duc", label: "Thu Duc" },
      ],
      experienceLabel: "Experience type",
      allExperienceTypesLabel: "All experience types",
      experienceTypeOptions: [
        { value: "street_food", label: "Street food" },
        { value: "history", label: "History" },
        { value: "traditional_craft", label: "Traditional craft" },
        { value: "traditional_market", label: "Traditional market" },
      ],
      clearFiltersLabel: "Clear filters",
      retryLabel: "Retry",
      filteringStatus: "Refreshing the demo catalog…",
      resultCountLabel: "tours",
      detailsLabel: "View tour facts",
      durationLabel: "Duration",
      priceLabel: "Fixed price",
      meetingPointLabel: "Meeting point",
      experienceTypesLabel: "Experience types",
      areasLabel: "Areas",
      stopsLabel: "Stops",
      inclusionsLabel: "Includes",
      exclusionsLabel: "Excludes",
      cancellationPolicyLabel: "Policy",
      sourceLabel: "Source URL",
      attributionLabel: "Attribution",
      verifiedLabel: "Verified",
      licenseLabel: "License",
      noResults: "No demo tours match these filters.",
      errorMessage: "The demo tour catalog could not be loaded.",
      retryableMessage: "Please try loading the demo catalog again.",
      correlationLabel: "Reference",
      disclosure: "Demo catalog: booking buttons open a local test flow only. No production booking or charge is made.",
      bookLabel: "Book",
    },
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
      durationLabel: "How many minutes do you have?",
      durationHint: "Choose between 60 and 720 minutes.",
      areasLabel: "Which areas interest you?",
      areasHint: "Choose one or more areas.",
      areaOptions: [
        { value: "demo-hcmc-district-1", label: "District 1 & central" },
        { value: "demo-hcmc-district-3", label: "District 3 & museum district" },
        { value: "demo-hcmc-district-5", label: "Cho Lon & District 5" },
        { value: "demo-hcmc-thu-duc", label: "Thu Duc" },
      ],
      budgetLabel: "Budget for your whole group",
      budgetHint: "Enter one positive group total. USD is converted to cents for amountMinor.",
      budgetCurrencyLabel: "Budget currency",
      budgetCurrencyOptions: [
        { value: "VND", label: "Vietnamese đồng (VND)" },
        { value: "USD", label: "US dollars (USD)" },
      ],
      startDateLabel: "Preferred start date",
      startDateHint: "Use your local travel date.",
      startTimeLabel: "Preferred start time",
      timezoneHint: "Start date and time use Ho Chi Minh City (Asia/Ho_Chi_Minh), UTC+07:00.",
      languageLabel: "Experience language",
      languageOptions: [
        { value: "en", label: "English" },
        { value: "vi", label: "Vietnamese" },
      ],
      partySizeLabel: "People in your party",
      partySizeHint: "Including children.",
      prioritiesLegend: "What should lead the route?",
      priorities: [
        { key: "street_food", label: "Food & everyday flavor" },
        { key: "history", label: "History & living culture" },
        { key: "traditional_craft", label: "Craft & local makers" },
        { key: "traditional_market", label: "Markets & neighborhood life" },
      ],
      paceLabel: "Preferred pace",
      paceOptions: [
        { value: "relaxed", label: "Relaxed and spacious" },
        { value: "active", label: "Active and full" },
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
      validationMessage: "Add a start date, start time, group size from 1 to 20, a positive budget, at least one area, and at least one priority before previewing your brief.",
      previewMessage: "Preview only: your preferences stay on this page and are not sent yet.",
      confirmationMessage: "Your route is confirmed.",
      plannerLinkLabel: "Open the separate simulated refinement demo",
      plannerLinkDisclosure: "Your form preferences are not transferred to this demo yet. No backend request is created.",
      preview: {
        heading: "Your route proposal",
        deterministicDisclosure:
          "Demo preview: deterministic ranking is the simulated-AI stand-in. No network or paid AI service is called.",
        proposalOnly: "Proposal only — no booking or confirmation has been made.",
        startLabel: "Starts",
        endLabel: "Ends",
        visitDurationLabel: "Visit",
        travelDurationLabel: "Travel before stop",
        travelCostLabel: "Travel cost",
        placeCostLabel: "Place cost",
        totalsHeading: "Proposal totals",
        totalDurationLabel: "Total time",
        totalVisitLabel: "Time visiting",
        totalTravelLabel: "Time travelling",
        totalCostLabel: "Group cost",
        warningMessage: "This proposal includes a transition buffer between stops.",
        errorMessage: "The demo preview could not build a route.",
        retryableMessage: "Please review your choices and try again.",
        correlationLabel: "Reference",
      },
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
    heroStampTop: "SGN",
    heroStampLine1: "nhìn",
    heroStampLine2: "chậm lại",
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
    demoDisclosure:
      "Danh mục demo: các tour cố định này dùng địa điểm mẫu nội bộ và chưa nhận đặt tour hay thanh toán.",
    tourCatalog: {
      catalogHeading: "Tour cố định tại Thành phố Hồ Chí Minh",
      catalogIntro: "Xem danh mục demo nội bộ và kiểm tra thông tin của từng tuyến cố định.",
      filtersLegend: "Lọc danh mục demo",
      keywordLabel: "Tìm tour",
      keywordPlaceholder: "Tìm theo tên hoặc mô tả",
      areaLabel: "Khu vực",
      allAreasLabel: "Tất cả khu vực",
      areaOptions: [
        { value: "demo-hcmc-district-1", label: "Quận 1 & trung tâm" },
        { value: "demo-hcmc-district-3", label: "Quận 3 & khu bảo tàng" },
        { value: "demo-hcmc-district-5", label: "Chợ Lớn & Quận 5" },
        { value: "demo-hcmc-thu-duc", label: "Thủ Đức" },
      ],
      experienceLabel: "Loại trải nghiệm",
      allExperienceTypesLabel: "Tất cả loại trải nghiệm",
      experienceTypeOptions: [
        { value: "street_food", label: "Ẩm thực đường phố" },
        { value: "history", label: "Lịch sử" },
        { value: "traditional_craft", label: "Nghề thủ công truyền thống" },
        { value: "traditional_market", label: "Chợ truyền thống" },
      ],
      clearFiltersLabel: "Xóa bộ lọc",
      retryLabel: "Thử lại",
      filteringStatus: "Đang làm mới danh mục demo…",
      resultCountLabel: "tour",
      detailsLabel: "Xem thông tin tour",
      durationLabel: "Thời lượng",
      priceLabel: "Giá cố định",
      meetingPointLabel: "Điểm hẹn",
      experienceTypesLabel: "Loại trải nghiệm",
      areasLabel: "Khu vực",
      stopsLabel: "Điểm dừng",
      inclusionsLabel: "Bao gồm",
      exclusionsLabel: "Không bao gồm",
      cancellationPolicyLabel: "Chính sách",
      sourceLabel: "URL nguồn",
      attributionLabel: "Ghi công",
      verifiedLabel: "Xác minh",
      licenseLabel: "Giấy phép",
      noResults: "Không có tour demo phù hợp với bộ lọc này.",
      errorMessage: "Không thể tải danh mục tour demo.",
      retryableMessage: "Hãy thử tải lại danh mục tour demo.",
      correlationLabel: "Mã tham chiếu",
      disclosure: "Danh mục demo: nút đặt tour chỉ mở luồng thử nghiệm cục bộ. Chưa có đặt tour thực tế hay khoản tiền nào bị trừ.",
      bookLabel: "Đặt tour",
    },
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
      durationLabel: "Bạn có bao nhiêu phút?",
      durationHint: "Chọn từ 60 đến 720 phút.",
      areasLabel: "Bạn quan tâm khu vực nào?",
      areasHint: "Chọn một hoặc nhiều khu vực.",
      areaOptions: [
        { value: "demo-hcmc-district-1", label: "Quận 1 & trung tâm" },
        { value: "demo-hcmc-district-3", label: "Quận 3 & khu bảo tàng" },
        { value: "demo-hcmc-district-5", label: "Chợ Lớn & Quận 5" },
        { value: "demo-hcmc-thu-duc", label: "Thủ Đức" },
      ],
      budgetLabel: "Ngân sách cho cả nhóm",
      budgetHint: "Nhập một tổng ngân sách dương cho cả nhóm. USD sẽ được đổi sang cent trong amountMinor.",
      budgetCurrencyLabel: "Đơn vị tiền tệ",
      budgetCurrencyOptions: [
        { value: "VND", label: "Đồng Việt Nam (VND)" },
        { value: "USD", label: "Đô la Mỹ (USD)" },
      ],
      startDateLabel: "Ngày bắt đầu mong muốn",
      startDateHint: "Dùng ngày bạn sẽ đi du lịch.",
      startTimeLabel: "Thời gian bắt đầu mong muốn",
      timezoneHint: "Ngày và giờ bắt đầu dùng múi giờ Thành phố Hồ Chí Minh (Asia/Ho_Chi_Minh), UTC+07:00.",
      languageLabel: "Ngôn ngữ trải nghiệm",
      languageOptions: [
        { value: "en", label: "Tiếng Anh" },
        { value: "vi", label: "Tiếng Việt" },
      ],
      partySizeLabel: "Số người trong nhóm",
      partySizeHint: "Bao gồm cả trẻ em.",
      prioritiesLegend: "Điều gì nên dẫn dắt lịch trình?",
      priorities: [
        { key: "street_food", label: "Ẩm thực & hương vị đời thường" },
        { key: "history", label: "Lịch sử & văn hóa sống" },
        { key: "traditional_craft", label: "Làng nghề & người làm nghề" },
        { key: "traditional_market", label: "Chợ & đời sống khu phố" },
      ],
      paceLabel: "Nhịp độ mong muốn",
      paceOptions: [
        { value: "relaxed", label: "Thư thả và rộng rãi" },
        { value: "active", label: "Năng động và nhiều điểm" },
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
      validationMessage: "Hãy thêm ngày, giờ bắt đầu, số người từ 1 đến 20, ngân sách dương, ít nhất một khu vực và một ưu tiên trước khi xem trước yêu cầu.",
      previewMessage: "Chỉ là bản xem trước: lựa chọn của bạn vẫn ở trên trang và chưa được gửi đi.",
      confirmationMessage: "Lịch trình của bạn đã được xác nhận.",
      plannerLinkLabel: "Mở bản demo điều chỉnh mô phỏng riêng",
      plannerLinkDisclosure: "Lựa chọn trong biểu mẫu chưa được chuyển sang bản demo này. Chưa có request backend nào được tạo.",
      preview: {
        heading: "Đề xuất lịch trình của bạn",
        deterministicDisclosure:
          "Bản xem trước demo: xếp hạng tất định đang đóng vai trò AI mô phỏng. Không gọi mạng hoặc dịch vụ AI trả phí.",
        proposalOnly: "Chỉ là đề xuất — chưa có đặt tour hay xác nhận nào được thực hiện.",
        startLabel: "Bắt đầu",
        endLabel: "Kết thúc",
        visitDurationLabel: "Thời gian tham quan",
        travelDurationLabel: "Di chuyển trước điểm này",
        travelCostLabel: "Chi phí di chuyển",
        placeCostLabel: "Chi phí địa điểm",
        totalsHeading: "Tổng quan đề xuất",
        totalDurationLabel: "Tổng thời lượng",
        totalVisitLabel: "Thời gian tham quan",
        totalTravelLabel: "Thời gian di chuyển",
        totalCostLabel: "Chi phí cả nhóm",
        warningMessage: "Đề xuất này có thêm thời gian đệm giữa các điểm.",
        errorMessage: "Không thể tạo lịch trình từ bản demo.",
        retryableMessage: "Hãy kiểm tra lựa chọn và thử lại.",
        correlationLabel: "Mã tham chiếu",
      },
    },
  },
};

const plannerCopy: Record<Locale, PlannerCopy> = {
  en: {
    heading: "Your personalized route proposal",
    intro: "Review the sequence, activities, timing, and estimated group cost before asking for a refinement.",
    simulatedDisclosure: "Simulated proposal only — no backend authority, AI service, booking, or payment is connected.",
    proposalOnly: "This is a suggestion for discussion. It does not confirm or book a tour automatically.",
    revisionLabel: "Revision",
    currentRevisionLabel: "Current proposal",
    activityLabel: "Planned activity",
    startLabel: "Start",
    endLabel: "End",
    visitDurationLabel: "Visit duration",
    travelDurationLabel: "Travel before stop",
    costLabel: "Estimated cost",
    totalDurationLabel: "Total time",
    totalCostLabel: "Estimated group cost",
    warningsHeading: "Checks and warnings",
    revisionHistoryHeading: "Revision history",
    noHistoryLabel: "No refinements yet.",
    feedbackLabel: "What should we adjust?",
    feedbackPlaceholder: "For example: slow the pace and keep the museum stop.",
    refineLabel: "Create revised proposal",
    refiningLabel: "Creating revised proposal…",
    lockLabel: "Lock stop",
    unlockLabel: "Unlock stop",
    feedbackRequiredMessage: "Add a short adjustment request before creating a revision.",
    revisionCreatedMessage: "A new simulated proposal revision is ready for review.",
    staleRevisionMessage: "This proposal changed elsewhere. Refresh the latest revision before trying again.",
    refreshLabel: "Refresh latest proposal",
    revisionFeedbackLabel: "Traveler feedback",
    backHomeLabel: "Back to LocalLens home",
  },
  vi: {
    heading: "Đề xuất lịch trình cá nhân hóa",
    intro: "Xem trình tự, hoạt động, thời gian và chi phí nhóm dự kiến trước khi yêu cầu điều chỉnh.",
    simulatedDisclosure: "Chỉ là đề xuất mô phỏng — chưa có quyền backend, dịch vụ AI, đặt tour hay thanh toán nào được kết nối.",
    proposalOnly: "Đây là gợi ý để trao đổi. Hệ thống không tự xác nhận hoặc đặt tour.",
    revisionLabel: "Phiên bản",
    currentRevisionLabel: "Đề xuất hiện tại",
    activityLabel: "Hoạt động dự kiến",
    startLabel: "Bắt đầu",
    endLabel: "Kết thúc",
    visitDurationLabel: "Thời lượng tham quan",
    travelDurationLabel: "Di chuyển trước điểm này",
    costLabel: "Chi phí dự kiến",
    totalDurationLabel: "Tổng thời gian",
    totalCostLabel: "Chi phí nhóm dự kiến",
    warningsHeading: "Kiểm tra và cảnh báo",
    revisionHistoryHeading: "Lịch sử điều chỉnh",
    noHistoryLabel: "Chưa có lần điều chỉnh nào.",
    feedbackLabel: "Bạn muốn điều chỉnh điều gì?",
    feedbackPlaceholder: "Ví dụ: đi chậm hơn và giữ lại điểm bảo tàng.",
    refineLabel: "Tạo đề xuất đã điều chỉnh",
    refiningLabel: "Đang tạo đề xuất mới…",
    lockLabel: "Khóa điểm này",
    unlockLabel: "Mở khóa điểm này",
    feedbackRequiredMessage: "Hãy thêm yêu cầu điều chỉnh trước khi tạo phiên bản mới.",
    revisionCreatedMessage: "Đã tạo phiên bản đề xuất mô phỏng mới để bạn xem xét.",
    staleRevisionMessage: "Đề xuất đã thay đổi ở nơi khác. Hãy tải phiên bản mới nhất rồi thử lại.",
    refreshLabel: "Tải phiên bản mới nhất",
    revisionFeedbackLabel: "Phản hồi của khách",
    backHomeLabel: "Quay lại trang chủ LocalLens",
  },
};

const dictionaries = {
  en: { ...english, home: customerHomeCopy.en, planner: plannerCopy.en },
  vi: { ...vietnamese, home: customerHomeCopy.vi, planner: plannerCopy.vi },
} satisfies Record<Locale, Dictionary>;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
