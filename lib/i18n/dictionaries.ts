import english from "@/messages/en.json";
import vietnamese from "@/messages/vi.json";

import type { ExperienceType } from "@/lib/domain/itinerary/contracts";
import type { Locale } from "@/lib/i18n/config";

export type PersonalizationPriorityKey =
  | "street_food"
  | "history"
  | "traditional_craft"
  | "traditional_market";

export type CustomRequestCopy = {
  heading: string;
  intro: string;
  demoDisclosure: string;
  noBackendAuthDisclosure: string;
  missingPlanMessage: string;
  expiredPlanMessage: string;
  invalidPlanMessage: string;
  storageErrorMessage: string;
  stalePlanMessage: string;
  backToPlannerLabel: string;
  signInBoundaryHeading: string;
  signInBoundaryMessage: string;
  continueLocalDemoLabel: string;
  selectedRevisionHeading: string;
  revisionLabel: string;
  planIdLabel: string;
  totalDurationLabel: string;
  totalCostLabel: string;
  venueAdmissionLabel: string;
  foodEstimateLabel: string;
  travelCostTotalLabel: string;
  guideCostLabel: string;
  localLensPayableLabel: string;
  payAtVendorLabel: string;
  payAtVendorValue: string;
  foodNotSelectedLabel: string;
  foodCostUnavailableLabel: string;
  budgetWarningLabel: string;
  budgetWarningMessage: string;
  vendorLabel: string;
  menuItemLabel: string;
  locationNoteLabel: string;
  quantityLabel: string;
  servingUnitLabel: string;
  servingUnitValues: {
    portion: string;
    bowl: string;
    piece: string;
    drink: string;
    shared_set: string;
  };
  unitPriceLabel: string;
  estimatedRangeLabel: string;
  activityLabel: string;
  dietaryAllergenLabel: string;
  accessibilityWarningLabel: string;
  requestHeading: string;
  requestIntro: string;
  submitRequestLabel: string;
  adminReviewHeading: string;
  adminReviewPendingMessage: string;
  simulateQuoteLabel: string;
  quoteHeading: string;
  quoteMessage: string;
  quoteExpiresLabel: string;
  quoteTotalLabel: string;
  acceptQuoteLabel: string;
  quoteAcceptedMessage: string;
  openStripeMockLabel: string;
  stripeMockHeading: string;
  stripeMockMessage: string;
  noPaymentNetworkDisclosure: string;
  backHomeLabel: string;
};

export type PlannerCopy = {
  heading: string;
  intro: string;
  simulatedDisclosure: string;
  proposalOnly: string;
  preferencesHeading: string;
  preferenceDateLabel: string;
  preferenceDurationLabel: string;
  preferenceBudgetLabel: string;
  preferenceAreasLabel: string;
  preferenceLanguageLabel: string;
  preferencePartySizeLabel: string;
  preferencePrioritiesLabel: string;
  preferencePaceLabel: string;
  preferenceDietaryLabel: string;
  preferenceMobilityLabel: string;
  preferenceSpecialNeedsLabel: string;
  preferenceNoneLabel: string;
  preferenceLanguageEnglish: string;
  preferenceLanguageVietnamese: string;
  preferencePaceRelaxed: string;
  preferencePaceActive: string;
  timezoneLabel: string;
  noProposalLabel: string;
  defaultFixtureLabel: string;
  handoffExpiredLabel: string;
  handoffInvalidLabel: string;
  handoffStorageErrorLabel: string;
  backToPersonalizationLabel: string;
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
  venueAdmissionLabel: string;
  foodEstimateLabel: string;
  travelCostTotalLabel: string;
  guideCostLabel: string;
  localLensPayableLabel: string;
  payAtVendorLabel: string;
  payAtVendorValue: string;
  foodNotSelectedLabel: string;
  foodCostUnavailableLabel: string;
  budgetWarningLabel: string;
  budgetWarningMessage: string;
  vendorLabel: string;
  menuItemLabel: string;
  locationNoteLabel: string;
  quantityLabel: string;
  servingUnitLabel: string;
  servingUnitValues: {
    portion: string;
    bowl: string;
    piece: string;
    drink: string;
    shared_set: string;
  };
  unitPriceLabel: string;
  estimatedRangeLabel: string;
  dietaryAllergenLabel: string;
  accessibilityWarningLabel: string;
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
  requestQuoteLabel: string;
  requestQuoteDisclosure: string;
  requestQuoteStorageError: string;
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
      dietaryUnsupportedNote: string;
      mobilityLabel: string;
      mobilityOptions: Array<{ value: string; label: string }>;
      mobilityUnsupportedNote: string;
      specialNeedsLabel: string;
      specialNeedsHint: string;
      submitLabel: string;
      validationMessage: string;
      previewMessage: string;
      confirmationMessage: string;
      plannerLinkLabel: string;
      plannerLinkDisclosure: string;
      plannerLinkStorageError: string;
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
        venueAdmissionLabel: string;
        foodEstimateLabel: string;
        travelCostTotalLabel: string;
        guideCostLabel: string;
        localLensPayableLabel: string;
        payAtVendorLabel: string;
        payAtVendorValue: string;
        foodNotSelectedLabel: string;
        foodCostUnavailableLabel: string;
        budgetWarningLabel: string;
        budgetWarningMessage: string;
        vendorLabel: string;
        menuItemLabel: string;
        locationNoteLabel: string;
        quantityLabel: string;
        servingUnitLabel: string;
        servingUnitValues: {
          portion: string;
          bowl: string;
          piece: string;
          drink: string;
          shared_set: string;
        };
        unitPriceLabel: string;
        estimatedRangeLabel: string;
        activityLabel: string;
        dietaryAllergenLabel: string;
        accessibilityWarningLabel: string;
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
  customRequest: CustomRequestCopy;
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
        { value: "halal", label: "Halal" },
        { value: "vegetarian", label: "Vegetarian" },
      ],
      dietaryUnsupportedNote: "Demo matching currently supports Halal and vegetarian only; describe other allergies or diets in special requests.",
      mobilityLabel: "Mobility needs",
      mobilityOptions: [
        { value: "none", label: "No special requirement" },
        { value: "step-free", label: "Need step-free options" },
      ],
      mobilityUnsupportedNote: "Demo matching currently supports step-free access only; describe walking limits in special requests.",
      specialNeedsLabel: "Anything else we should plan around?",
      specialNeedsHint: "Optional — tell us about accessibility, celebrations, or a must-see detail.",
      submitLabel: "Preview my route brief",
      validationMessage: "Add a start date, start time, group size from 1 to 20, a positive budget, at least one area, and at least one priority before previewing your brief.",
      previewMessage: "Preview only: your preferences stay on this page and are not sent yet.",
      confirmationMessage: "Your route is confirmed.",
      plannerLinkLabel: "Open the separate simulated refinement demo",
      plannerLinkDisclosure: "Your preferences are passed only through this browser tab to the simulated planner. No backend request is created.",
      plannerLinkStorageError: "This browser could not save the handoff for the simulated planner. The planner link is unavailable; your local preview is still shown.",
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
        venueAdmissionLabel: "Venue/admission",
        foodEstimateLabel: "Food estimate",
        travelCostTotalLabel: "Travel",
        guideCostLabel: "Guide",
        localLensPayableLabel: "LocalLens payable",
        payAtVendorLabel: "Pay at vendor",
        payAtVendorValue: "Pay directly at vendors",
        foodNotSelectedLabel: "Food not selected",
        foodCostUnavailableLabel: "Food cost unavailable",
        budgetWarningLabel: "Budget warning",
        budgetWarningMessage: "The upper-bound estimate exceeds your budget.",
        vendorLabel: "Vendor/stall",
        menuItemLabel: "Menu item",
        locationNoteLabel: "Location",
        quantityLabel: "Quantity",
        servingUnitLabel: "Serving unit",
        servingUnitValues: { portion: "portion", bowl: "bowl", piece: "piece", drink: "drink", shared_set: "shared set" },
        unitPriceLabel: "Price per unit",
        estimatedRangeLabel: "Estimated group range",
        activityLabel: "Activity",
        dietaryAllergenLabel: "Dietary/allergen caveat",
        accessibilityWarningLabel: "Accessibility/vendor warning",
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
        { value: "halal", label: "Halal" },
        { value: "vegetarian", label: "Ăn chay" },
      ],
      dietaryUnsupportedNote: "Bản demo hiện chỉ đối chiếu Halal và ăn chay; hãy ghi dị ứng hoặc chế độ khác trong yêu cầu đặc biệt.",
      mobilityLabel: "Nhu cầu di chuyển",
      mobilityOptions: [
        { value: "none", label: "Không có yêu cầu đặc biệt" },
        { value: "step-free", label: "Cần lựa chọn không bậc thang" },
      ],
      mobilityUnsupportedNote: "Bản demo hiện chỉ đối chiếu lối đi không bậc; hãy ghi giới hạn đi bộ trong yêu cầu đặc biệt.",
      specialNeedsLabel: "Có điều gì khác cần lưu ý?",
      specialNeedsHint: "Không bắt buộc — hãy chia sẻ nhu cầu tiếp cận, dịp đặc biệt hoặc điều nhất định phải xem.",
      submitLabel: "Xem trước yêu cầu lịch trình",
      validationMessage: "Hãy thêm ngày, giờ bắt đầu, số người từ 1 đến 20, ngân sách dương, ít nhất một khu vực và một ưu tiên trước khi xem trước yêu cầu.",
      previewMessage: "Chỉ là bản xem trước: lựa chọn của bạn vẫn ở trên trang và chưa được gửi đi.",
      confirmationMessage: "Lịch trình của bạn đã được xác nhận.",
      plannerLinkLabel: "Mở bản demo điều chỉnh mô phỏng riêng",
      plannerLinkDisclosure: "Nhu cầu chỉ được chuyển qua phiên của tab trình duyệt này đến planner mô phỏng. Chưa có request backend nào được tạo.",
      plannerLinkStorageError: "Trình duyệt không thể lưu dữ liệu chuyển sang planner mô phỏng. Liên kết planner đã được ẩn; bản xem trước cục bộ vẫn hiển thị.",
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
        venueAdmissionLabel: "Phí địa điểm/vé vào cửa",
        foodEstimateLabel: "Ước tính đồ ăn",
        travelCostTotalLabel: "Di chuyển",
        guideCostLabel: "Hướng dẫn viên",
        localLensPayableLabel: "Khoản trả cho LocalLens",
        payAtVendorLabel: "Thanh toán tại điểm bán",
        payAtVendorValue: "Tự thanh toán trực tiếp cho các điểm bán",
        foodNotSelectedLabel: "Chưa chọn món ăn",
        foodCostUnavailableLabel: "Chưa có thông tin chi phí đồ ăn",
        budgetWarningLabel: "Cảnh báo ngân sách",
        budgetWarningMessage: "Ước tính ở mức cao nhất vượt quá ngân sách của bạn.",
        vendorLabel: "Nhà bán hàng/quầy",
        menuItemLabel: "Món trong thực đơn",
        locationNoteLabel: "Vị trí",
        quantityLabel: "Số lượng",
        servingUnitLabel: "Đơn vị phần",
        servingUnitValues: { portion: "phần", bowl: "tô", piece: "miếng", drink: "ly", shared_set: "set dùng chung" },
        unitPriceLabel: "Giá mỗi đơn vị",
        estimatedRangeLabel: "Khoảng ước tính cho cả nhóm",
        activityLabel: "Hoạt động",
        dietaryAllergenLabel: "Lưu ý chế độ ăn/dị ứng",
        accessibilityWarningLabel: "Cảnh báo tiếp cận/điểm bán",
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
    simulatedDisclosure: "Simulated proposal only — form preferences stay in this browser tab; no backend authority, AI service, booking, or payment is connected.",
    proposalOnly: "This is a suggestion for discussion. It does not confirm or book a tour automatically.",
    preferencesHeading: "Preferences received from your form",
    preferenceDateLabel: "Date and start time (Ho Chi Minh City, UTC+07:00)",
    preferenceDurationLabel: "Requested duration",
    preferenceBudgetLabel: "Budget",
    preferenceAreasLabel: "Areas",
    preferenceLanguageLabel: "Guide language",
    preferencePartySizeLabel: "Group size",
    preferencePrioritiesLabel: "Experience priorities",
    preferencePaceLabel: "Pace",
    preferenceDietaryLabel: "Dietary needs",
    preferenceMobilityLabel: "Mobility needs",
    preferenceSpecialNeedsLabel: "Special requests",
    preferenceNoneLabel: "None specified",
    preferenceLanguageEnglish: "English",
    preferenceLanguageVietnamese: "Vietnamese",
    preferencePaceRelaxed: "Relaxed",
    preferencePaceActive: "Active",
    timezoneLabel: "Ho Chi Minh City time (UTC+07:00)",
    noProposalLabel: "No proposal is available for these constraints.",
    defaultFixtureLabel: "Default demo route shown because no personalization handoff was found in this browser tab.",
    handoffExpiredLabel: "This personalization handoff expired. No personalized proposal was loaded; please return to the form.",
    handoffInvalidLabel: "This personalization handoff is invalid or incomplete. No personalized proposal was loaded; please return to the form.",
    handoffStorageErrorLabel: "This browser could not read the personalization handoff. No personalized proposal was loaded; please return to the form.",
    backToPersonalizationLabel: "Return to personalization form",
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
    venueAdmissionLabel: "Venue/admission",
    foodEstimateLabel: "Food estimate",
    travelCostTotalLabel: "Travel",
    guideCostLabel: "Guide",
    localLensPayableLabel: "LocalLens payable",
    payAtVendorLabel: "Pay at vendor",
    payAtVendorValue: "Pay directly at vendors",
    foodNotSelectedLabel: "Food not selected",
    foodCostUnavailableLabel: "Food cost unavailable",
    budgetWarningLabel: "Budget warning",
    budgetWarningMessage: "The upper-bound estimate exceeds your budget.",
    vendorLabel: "Vendor/stall",
    menuItemLabel: "Menu item",
    locationNoteLabel: "Location",
    quantityLabel: "Quantity",
    servingUnitLabel: "Serving unit",
    servingUnitValues: { portion: "portion", bowl: "bowl", piece: "piece", drink: "drink", shared_set: "shared set" },
    unitPriceLabel: "Price per unit",
    estimatedRangeLabel: "Estimated group range",
    dietaryAllergenLabel: "Dietary/allergen caveat",
    accessibilityWarningLabel: "Accessibility/vendor warning",
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
    requestQuoteLabel: "Request a quote for this revision",
    requestQuoteDisclosure: "This opens a local custom-request demo. It does not sign you in, contact admin, or book a tour.",
    requestQuoteStorageError: "This browser could not save the selected revision. The quote request link is unavailable.",
    backHomeLabel: "Back to LocalLens home",
  },
  vi: {
    heading: "Đề xuất lịch trình cá nhân hóa",
    intro: "Xem trình tự, hoạt động, thời gian và chi phí nhóm dự kiến trước khi yêu cầu điều chỉnh.",
    simulatedDisclosure: "Chỉ là đề xuất mô phỏng — nhu cầu chỉ nằm trong tab trình duyệt này; chưa có quyền backend, dịch vụ AI, đặt tour hay thanh toán nào được kết nối.",
    proposalOnly: "Đây là gợi ý để trao đổi. Hệ thống không tự xác nhận hoặc đặt tour.",
    preferencesHeading: "Nhu cầu đã nhận từ biểu mẫu",
    preferenceDateLabel: "Ngày và giờ bắt đầu (Thành phố Hồ Chí Minh, UTC+07:00)",
    preferenceDurationLabel: "Thời lượng yêu cầu",
    preferenceBudgetLabel: "Ngân sách",
    preferenceAreasLabel: "Khu vực",
    preferenceLanguageLabel: "Ngôn ngữ hướng dẫn",
    preferencePartySizeLabel: "Số người",
    preferencePrioritiesLabel: "Ưu tiên trải nghiệm",
    preferencePaceLabel: "Nhịp độ",
    preferenceDietaryLabel: "Nhu cầu ăn uống",
    preferenceMobilityLabel: "Nhu cầu di chuyển",
    preferenceSpecialNeedsLabel: "Yêu cầu đặc biệt",
    preferenceNoneLabel: "Chưa nêu",
    preferenceLanguageEnglish: "Tiếng Anh",
    preferenceLanguageVietnamese: "Tiếng Việt",
    preferencePaceRelaxed: "Thư thả",
    preferencePaceActive: "Năng động",
    timezoneLabel: "Giờ Thành phố Hồ Chí Minh (UTC+07:00)",
    noProposalLabel: "Không có đề xuất phù hợp với các điều kiện này.",
    defaultFixtureLabel: "Đang hiển thị lịch trình demo mặc định vì không tìm thấy dữ liệu cá nhân hóa trong tab trình duyệt này.",
    handoffExpiredLabel: "Dữ liệu cá nhân hóa đã hết hạn. Không tải đề xuất cá nhân hóa; hãy quay lại biểu mẫu.",
    handoffInvalidLabel: "Dữ liệu cá nhân hóa không hợp lệ hoặc chưa đủ. Không tải đề xuất cá nhân hóa; hãy quay lại biểu mẫu.",
    handoffStorageErrorLabel: "Trình duyệt không thể đọc dữ liệu cá nhân hóa. Không tải đề xuất cá nhân hóa; hãy quay lại biểu mẫu.",
    backToPersonalizationLabel: "Quay lại biểu mẫu cá nhân hóa",
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
    venueAdmissionLabel: "Phí địa điểm/vé vào cửa",
    foodEstimateLabel: "Ước tính đồ ăn",
    travelCostTotalLabel: "Di chuyển",
    guideCostLabel: "Hướng dẫn viên",
    localLensPayableLabel: "Khoản trả cho LocalLens",
    payAtVendorLabel: "Thanh toán tại điểm bán",
    payAtVendorValue: "Tự thanh toán trực tiếp cho các điểm bán",
    foodNotSelectedLabel: "Chưa chọn món ăn",
    foodCostUnavailableLabel: "Chưa có thông tin chi phí đồ ăn",
    budgetWarningLabel: "Cảnh báo ngân sách",
    budgetWarningMessage: "Ước tính ở mức cao nhất vượt quá ngân sách của bạn.",
    vendorLabel: "Nhà bán hàng/quầy",
    menuItemLabel: "Món trong thực đơn",
    locationNoteLabel: "Vị trí",
    quantityLabel: "Số lượng",
    servingUnitLabel: "Đơn vị phần",
    servingUnitValues: { portion: "phần", bowl: "tô", piece: "miếng", drink: "ly", shared_set: "set dùng chung" },
    unitPriceLabel: "Giá mỗi đơn vị",
    estimatedRangeLabel: "Khoảng ước tính cho cả nhóm",
    dietaryAllergenLabel: "Lưu ý chế độ ăn/dị ứng",
    accessibilityWarningLabel: "Cảnh báo tiếp cận/điểm bán",
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
    requestQuoteLabel: "Yêu cầu báo giá cho phiên bản này",
    requestQuoteDisclosure: "Đây là demo yêu cầu cá nhân hóa cục bộ. Không đăng nhập, liên hệ admin hay đặt tour nào được thực hiện.",
    requestQuoteStorageError: "Trình duyệt không thể lưu phiên bản đã chọn. Liên kết yêu cầu báo giá không khả dụng.",
    backHomeLabel: "Quay lại trang chủ LocalLens",
  },
};

const customRequestCopy: Record<Locale, CustomRequestCopy> = {
  en: {
    heading: "Request a review and quote",
    intro: "Send this selected itinerary revision to the next local-demo step for review.",
    demoDisclosure: "Local prototype only: no backend, authentication, admin workspace, AI service, Stripe network, booking, or payment is connected.",
    noBackendAuthDisclosure: "Production would require sign-in before submitting a custom request. This prototype has no auth service and will only continue when you explicitly choose the local demo.",
    missingPlanMessage: "No selected planner revision was found in this browser tab. Nothing was submitted.",
    expiredPlanMessage: "The selected planner revision expired. Nothing was submitted.",
    invalidPlanMessage: "The selected planner revision is invalid or incomplete. Nothing was submitted.",
    storageErrorMessage: "This browser could not read the selected planner revision. Nothing was submitted.",
    stalePlanMessage: "The selected revision no longer matches the current personalization handoff. Nothing was submitted.",
    backToPlannerLabel: "Back to planner",
    signInBoundaryHeading: "Sign-in required in production",
    signInBoundaryMessage: "A real product would authenticate you here before sending a request to an admin. No sign-in succeeds in this local prototype.",
    continueLocalDemoLabel: "Continue in local demo",
    selectedRevisionHeading: "Selected itinerary revision",
    revisionLabel: "Revision",
    planIdLabel: "Plan ID",
    totalDurationLabel: "Estimated duration",
    totalCostLabel: "Estimated group cost",
    venueAdmissionLabel: "Venue/admission",
    foodEstimateLabel: "Food estimate",
    travelCostTotalLabel: "Travel",
    guideCostLabel: "Guide",
    localLensPayableLabel: "LocalLens payable",
    payAtVendorLabel: "Pay at vendor",
    payAtVendorValue: "Pay directly at vendors",
    foodNotSelectedLabel: "Food not selected",
    foodCostUnavailableLabel: "Food cost unavailable",
    budgetWarningLabel: "Budget warning",
    budgetWarningMessage: "The upper-bound estimate exceeds your budget.",
    vendorLabel: "Vendor/stall",
    menuItemLabel: "Menu item",
    locationNoteLabel: "Location",
    quantityLabel: "Quantity",
    servingUnitLabel: "Serving unit",
    servingUnitValues: { portion: "portion", bowl: "bowl", piece: "piece", drink: "drink", shared_set: "shared set" },
    unitPriceLabel: "Price per unit",
    estimatedRangeLabel: "Estimated group range",
    activityLabel: "Activity",
    dietaryAllergenLabel: "Dietary/allergen caveat",
    accessibilityWarningLabel: "Accessibility/vendor warning",
    requestHeading: "Submit for local admin review",
    requestIntro: "This action only changes local screen state; it does not contact an admin or create a booking.",
    submitRequestLabel: "Submit local demo request",
    adminReviewHeading: "Admin review pending (simulated)",
    adminReviewPendingMessage: "Your local demo request is marked pending review. No admin received it.",
    simulateQuoteLabel: "Simulate a 48-hour quote",
    quoteHeading: "Mock quote",
    quoteMessage: "This amount is derived from the selected revision snapshot and is immutable in this local flow.",
    quoteExpiresLabel: "Quote validity",
    quoteTotalLabel: "Quote total",
    acceptQuoteLabel: "Accept this mock quote",
    quoteAcceptedMessage: "You explicitly accepted the mock quote. Payment has not started.",
    openStripeMockLabel: "Open Stripe Test/Mock action",
    stripeMockHeading: "Stripe Test/Mock boundary",
    stripeMockMessage: "A real product would now open Stripe Checkout. This prototype only records that you chose the mock action.",
    noPaymentNetworkDisclosure: "No Stripe network request, card charge, webhook, or booking confirmation was made.",
    backHomeLabel: "Back to LocalLens home",
  },
  vi: {
    heading: "Yêu cầu xem xét và báo giá",
    intro: "Gửi phiên bản lịch trình đã chọn sang bước demo tiếp theo để xem xét.",
    demoDisclosure: "Chỉ là prototype cục bộ: chưa kết nối backend, xác thực, không gian admin, dịch vụ AI, mạng Stripe, đặt tour hay thanh toán.",
    noBackendAuthDisclosure: "Sản phẩm thật sẽ yêu cầu đăng nhập trước khi gửi yêu cầu cá nhân hóa cho admin. Prototype này không có dịch vụ xác thực và chỉ tiếp tục khi bạn chủ động chọn demo cục bộ.",
    missingPlanMessage: "Không tìm thấy phiên bản lịch trình đã chọn trong tab trình duyệt này. Chưa gửi gì cả.",
    expiredPlanMessage: "Phiên bản lịch trình đã chọn đã hết hạn. Chưa gửi gì cả.",
    invalidPlanMessage: "Phiên bản lịch trình đã chọn không hợp lệ hoặc chưa đủ. Chưa gửi gì cả.",
    storageErrorMessage: "Trình duyệt không thể đọc phiên bản lịch trình đã chọn. Chưa gửi gì cả.",
    stalePlanMessage: "Phiên bản đã chọn không còn khớp với dữ liệu cá nhân hóa hiện tại. Chưa gửi gì cả.",
    backToPlannerLabel: "Quay lại planner",
    signInBoundaryHeading: "Sản phẩm thật sẽ yêu cầu đăng nhập",
    signInBoundaryMessage: "Sản phẩm thật sẽ xác thực bạn ở đây trước khi gửi yêu cầu cho admin. Prototype cục bộ này không đăng nhập thành công.",
    continueLocalDemoLabel: "Tiếp tục trong demo cục bộ",
    selectedRevisionHeading: "Phiên bản lịch trình đã chọn",
    revisionLabel: "Phiên bản",
    planIdLabel: "Mã lịch trình",
    totalDurationLabel: "Thời lượng dự kiến",
    totalCostLabel: "Chi phí nhóm dự kiến",
    venueAdmissionLabel: "Phí địa điểm/vé vào cửa",
    foodEstimateLabel: "Ước tính đồ ăn",
    travelCostTotalLabel: "Di chuyển",
    guideCostLabel: "Hướng dẫn viên",
    localLensPayableLabel: "Khoản trả cho LocalLens",
    payAtVendorLabel: "Thanh toán tại điểm bán",
    payAtVendorValue: "Tự thanh toán trực tiếp cho các điểm bán",
    foodNotSelectedLabel: "Chưa chọn món ăn",
    foodCostUnavailableLabel: "Chưa có thông tin chi phí đồ ăn",
    budgetWarningLabel: "Cảnh báo ngân sách",
    budgetWarningMessage: "Ước tính ở mức cao nhất vượt quá ngân sách của bạn.",
    vendorLabel: "Nhà bán hàng/quầy",
    menuItemLabel: "Món trong thực đơn",
    locationNoteLabel: "Vị trí",
    quantityLabel: "Số lượng",
    servingUnitLabel: "Đơn vị phần",
    servingUnitValues: { portion: "phần", bowl: "tô", piece: "miếng", drink: "ly", shared_set: "set dùng chung" },
    unitPriceLabel: "Giá mỗi đơn vị",
    estimatedRangeLabel: "Khoảng ước tính cho cả nhóm",
    activityLabel: "Hoạt động",
    dietaryAllergenLabel: "Lưu ý chế độ ăn/dị ứng",
    accessibilityWarningLabel: "Cảnh báo tiếp cận/điểm bán",
    requestHeading: "Gửi để admin demo xem xét",
    requestIntro: "Thao tác này chỉ đổi trạng thái trên màn hình cục bộ; không liên hệ admin và không tạo đặt tour.",
    submitRequestLabel: "Gửi yêu cầu demo cục bộ",
    adminReviewHeading: "Đang chờ admin xem xét (mô phỏng)",
    adminReviewPendingMessage: "Yêu cầu demo cục bộ đã được đánh dấu chờ xem xét. Chưa có admin nào nhận được yêu cầu.",
    simulateQuoteLabel: "Mô phỏng báo giá 48 giờ",
    quoteHeading: "Báo giá mô phỏng",
    quoteMessage: "Số tiền này lấy từ bản chụp phiên bản đã chọn và không đổi trong flow cục bộ này.",
    quoteExpiresLabel: "Thời hạn báo giá",
    quoteTotalLabel: "Tổng báo giá",
    acceptQuoteLabel: "Chấp nhận báo giá mô phỏng",
    quoteAcceptedMessage: "Bạn đã chủ động chấp nhận báo giá mô phỏng. Chưa bắt đầu thanh toán.",
    openStripeMockLabel: "Mở thao tác Stripe Test/Mock",
    stripeMockHeading: "Biên giới Stripe Test/Mock",
    stripeMockMessage: "Sản phẩm thật sẽ mở Stripe Checkout ở đây. Prototype này chỉ ghi nhận bạn đã chọn thao tác mô phỏng.",
    noPaymentNetworkDisclosure: "Không có request mạng Stripe, trừ tiền, webhook hay xác nhận đặt tour nào được thực hiện.",
    backHomeLabel: "Quay lại trang chủ LocalLens",
  },
};

const dictionaries = {
  en: { ...english, home: customerHomeCopy.en, planner: plannerCopy.en, customRequest: customRequestCopy.en },
  vi: { ...vietnamese, home: customerHomeCopy.vi, planner: plannerCopy.vi, customRequest: customRequestCopy.vi },
} satisfies Record<Locale, Dictionary>;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
