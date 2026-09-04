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
  quotePendingMessage: string;
  quoteHeading: string;
  quoteMessage: string;
  quoteExpiresLabel: string;
  quoteValidityValue: string;
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
  runtimeDisclosure: string;
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
    heroImageAlt: string;
    heroInsetAlt: string;
    heroCoordinates: string;
    heroPrimaryCta: string;
    heroSecondaryCta: string;
    heroActionsLabel: string;
    heroNote: string;
    heroTrust: string;
    heroRoute: {
      ariaLabel: string;
      totalTimeLabel: string;
      perPersonLabel: string;
      modeLabel: string;
      modeValue: string;
      paceValue: string;
      dateValue: string;
      stopsLabel: string;
      disclosure: string;
    };
    heroStops: Array<{
      id: string;
      time: string;
      title: string;
      description: string;
      alt: string;
    }>;
    heroMapLabels: {
      north: string;
      central: string;
      district: string;
      river: string;
    };
    heroStampTop: string;
    heroStampLine1: string;
    heroStampLine2: string;
    discoveryEyebrow: string;
    discoveryTitle: string;
    discoveryIntro: string;
    experienceCategories: Array<{
      key: PersonalizationPriorityKey;
      title: string;
      imageAlt: string;
    }>;
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
      durationHoursLabel: string;
      durationMinutesLabel: string;
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
      runtimeLoadingMessage: string;
      runtimeUnavailableMessage: string;
      runtimeRetryLabel: string;
      runtimePlannerLinkLabel: string;
      runtimePlannerLinkDisclosure: string;
      runtimePlannerLinkStorageError: string;
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
    simulateSuccessLabel: string;
    simulateFailureLabel: string;
    failureHeading: string;
    failureMessage: string;
    cancelledHeading: string;
    expiredHeading: string;
    retryPaymentLabel: string;
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
    experiences?: string;
    privateJourneys?: string;
    ourCity?: string;
    tours?: string;
    personalizedTrip?: string;
    howItWorks?: string;
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
    eyebrow: "A day shaped around you",
    title: "Your Saigon, planned around you",
    subtitle: "Tell us your time, budget and interests. We’ll shape a route you can review and refine.",
    heroImageAlt: "Illustrated map of central Saigon with a suggested route",
    heroInsetAlt: "Ben Thanh Market clock tower in Ho Chi Minh City",
    heroCoordinates: "SAIGON · 10.8231° N · 106.6297° E",
    heroPrimaryCta: "Plan my Saigon day",
    heroSecondaryCta: "Browse ready-made tours",
    heroActionsLabel: "Choose your way into Saigon",
    heroNote: "Adjust places and timing until it feels perfect.",
    heroTrust: "Start with a clear plan, then review and refine it.",
    heroRoute: {
      ariaLabel: "Suggested Saigon day summary",
      totalTimeLabel: "Total time",
      perPersonLabel: "Est. per person",
      modeLabel: "Easy pace",
      modeValue: "Walking + local transport",
      paceValue: "Flexible start",
      dateValue: "Thu, 27 Aug 2026",
      stopsLabel: "Suggested Saigon day stops",
      disclosure: "Illustrative demo itinerary — not a quote, availability, or booking offer.",
    },
    heroStops: [
      {
        id: "market",
        time: "09:00",
        title: "Ben Thanh Market",
        description: "Explore the iconic market and local snacks.",
        alt: "Ben Thanh Market clock tower in Ho Chi Minh City",
      },
      {
        id: "palace",
        time: "11:15",
        title: "Independence Palace",
        description: "Step into history at an iconic landmark.",
        alt: "Independence Palace facade and lawn in Ho Chi Minh City",
      },
      {
        id: "food",
        time: "13:00",
        title: "Street-food stop",
        description: "Taste Saigon flavors like a local.",
        alt: "Vietnamese noodle bowl and iced coffee at a sidewalk table",
      },
    ],
    heroMapLabels: {
      north: "PHÚ NHUẬN",
      central: "BẾN NGHÉ",
      district: "DISTRICT 1",
      river: "SAIGON RIVER",
    },
    heroStampTop: "SGN",
    heroStampLine1: "seen",
    heroStampLine2: "slowly",
    discoveryEyebrow: "Choose your starting point",
    discoveryTitle: "Four ways into the city",
    discoveryIntro:
      "Follow a well-shaped route or tell us what you want to feel, taste, and understand.",
    experienceCategories: [
      {
        key: "street_food",
        title: "Street food",
        imageAlt: "",
      },
      {
        key: "history",
        title: "History",
        imageAlt: "",
      },
      {
        key: "traditional_craft",
        title: "Craft villages",
        imageAlt: "",
      },
      {
        key: "traditional_market",
        title: "Traditional markets",
        imageAlt: "",
      },
    ],
    fixedTours: [
      {
        id: "food",
        icon: "01",
        title: "Food & flavor",
        description: "Follow the small stools, family kitchens, and stories behind every bite.",
        detail: "Taste-led · 3–4 hours",
      },
      {
        id: "history",
        icon: "02",
        title: "History & culture",
        description: "Read the city through old streets, living traditions, and layered memories.",
        detail: "Story-led · Half day",
      },
      {
        id: "craft",
        icon: "03",
        title: "Craft & makers",
        description: "Meet the hands and patient rituals keeping local craft in motion.",
        detail: "Hands-on · Slow pace",
      },
      {
        id: "market",
        icon: "04",
        title: "Markets & local life",
        description: "See how the city wakes, trades, gathers, and makes room for one more guest.",
        detail: "Everyday · Morning routes",
      },
      {
        id: "local-life",
        icon: "05",
        title: "Local life",
        description: "Make space for ordinary rituals, neighborhood corners, and the people who give them meaning.",
        detail: "People-led · Unhurried",
      },
    ],
    fixedToursCta: "See all fixed tours",
    demoDisclosure:
      "Demo catalog: fixed tours use internal sample places. Booking links open a browser-only test flow; no production booking or charge is made.",
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
    trustEyebrow: "How your day takes shape",
    trustTitle: "How it works",
    trustIntro:
      "A simple three-step way to spend a day in Saigon.",
    trustItems: [
      {
        icon: "01",
        title: "Tell us about you",
        description: "Share your time, budget and interests.",
      },
      {
        icon: "02",
        title: "Get a simulated AI preview",
        description: "Review an illustrative route built from approved demo places.",
      },
      {
        icon: "03",
        title: "Review and refine",
        description: "Adjust places and timing until it feels perfect.",
      },
    ],
    personalizationEyebrow: "Your brief, your rhythm",
    personalizationTitle: "Tell us what a good day in the city feels like",
    personalizationIntro:
      "Start with a few practical details. This preview keeps your preferences on this page until the planning service is connected.",
    personalizationForm: {
      formLabel: "Personalized route preferences",
      durationLabel: "How much time do you have?",
      durationHoursLabel: "Hours",
      durationMinutesLabel: "Minutes",
      durationHint: "Enter hours first, then minutes. Total duration must be between 1 and 12 hours.",
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
      runtimeLoadingMessage: "Preparing the secure planner handoff…",
      runtimeUnavailableMessage: "The secure planner handoff is unavailable. Try again.",
      runtimeRetryLabel: "Try again",
      runtimePlannerLinkLabel: "Sign in to open the AI planner",
      runtimePlannerLinkDisclosure: "Your preferences are saved in this tab. Sign in with a demo customer account to generate and save an AI-assisted itinerary.",
      runtimePlannerLinkStorageError: "This browser could not save the secure planner handoff. Nothing was sent; try again when tab storage is available.",
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
    eyebrow: "Một ngày được thiết kế quanh bạn",
    title: "Sài Gòn của bạn, được thiết kế quanh bạn",
    subtitle: "Hãy cho chúng tôi biết thời gian, ngân sách và điều bạn quan tâm. Chúng tôi sẽ tạo một tuyến đường để bạn xem lại và điều chỉnh.",
    heroImageAlt: "Bản đồ minh họa khu trung tâm Sài Gòn với tuyến đường gợi ý",
    heroInsetAlt: "Tháp đồng hồ chợ Bến Thành tại Thành phố Hồ Chí Minh",
    heroCoordinates: "SÀI GÒN · 10.8231° B · 106.6297° Đ",
    heroPrimaryCta: "Lên kế hoạch ngày ở Sài Gòn",
    heroSecondaryCta: "Xem các tour có sẵn",
    heroActionsLabel: "Chọn cách khám phá Sài Gòn",
    heroNote: "Điều chỉnh điểm đến và thời gian đến khi lịch trình vừa ý.",
    heroTrust: "Bắt đầu với lịch trình rõ ràng, rồi xem lại và điều chỉnh theo ý bạn.",
    heroRoute: {
      ariaLabel: "Tóm tắt ngày khám phá Sài Gòn gợi ý",
      totalTimeLabel: "Tổng thời gian",
      perPersonLabel: "Ước tính mỗi người",
      modeLabel: "Nhịp độ thong thả",
      modeValue: "Đi bộ + phương tiện địa phương",
      paceValue: "Giờ bắt đầu linh hoạt",
      dateValue: "Thứ Năm, 27/08/2026",
      stopsLabel: "Các điểm dừng gợi ý trong ngày",
      disclosure: "Lịch trình minh họa — không phải báo giá, thông tin còn chỗ hay đề nghị đặt tour.",
    },
    heroStops: [
      {
        id: "market",
        time: "09:00",
        title: "Chợ Bến Thành",
        description: "Khám phá khu chợ biểu tượng và món ăn địa phương.",
        alt: "Tháp đồng hồ chợ Bến Thành tại Thành phố Hồ Chí Minh",
      },
      {
        id: "palace",
        time: "11:15",
        title: "Dinh Độc Lập",
        description: "Bước vào lịch sử tại một địa danh biểu tượng.",
        alt: "Mặt tiền và bãi cỏ Dinh Độc Lập tại Thành phố Hồ Chí Minh",
      },
      {
        id: "food",
        time: "13:00",
        title: "Điểm dừng ẩm thực đường phố",
        description: "Nếm hương vị Sài Gòn như một người địa phương.",
        alt: "Tô mì Việt Nam và cà phê đá trên bàn bên hè phố",
      },
    ],
    heroMapLabels: {
      north: "PHÚ NHUẬN",
      central: "BẾN NGHÉ",
      district: "QUẬN 1",
      river: "SÔNG SÀI GÒN",
    },
    heroStampTop: "SGN",
    heroStampLine1: "nhìn",
    heroStampLine2: "chậm lại",
    discoveryEyebrow: "Chọn cách bắt đầu",
    discoveryTitle: "Bốn cách bước vào thành phố",
    discoveryIntro:
      "Theo một lịch trình được thiết kế sẵn hoặc chia sẻ điều bạn muốn cảm nhận, nếm thử và tìm hiểu.",
    experienceCategories: [
      {
        key: "street_food",
        title: "Ẩm thực đường phố",
        imageAlt: "",
      },
      {
        key: "history",
        title: "Lịch sử",
        imageAlt: "",
      },
      {
        key: "traditional_craft",
        title: "Làng nghề",
        imageAlt: "",
      },
      {
        key: "traditional_market",
        title: "Chợ truyền thống",
        imageAlt: "",
      },
    ],
    fixedTours: [
      {
        id: "food",
        icon: "01",
        title: "Ẩm thực & hương vị",
        description: "Theo những quán nhỏ, căn bếp gia đình và câu chuyện sau mỗi món ăn.",
        detail: "Theo vị giác · 3–4 giờ",
      },
      {
        id: "history",
        icon: "02",
        title: "Lịch sử & văn hóa",
        description: "Đọc thành phố qua những con phố cũ, truyền thống sống động và ký ức nhiều lớp.",
        detail: "Theo câu chuyện · Nửa ngày",
      },
      {
        id: "craft",
        icon: "03",
        title: "Làng nghề & người làm nghề",
        description: "Gặp những đôi tay và nhịp sống bền bỉ giữ nghề địa phương tiếp tục chuyển động.",
        detail: "Trải nghiệm · Nhịp chậm",
      },
      {
        id: "market",
        icon: "04",
        title: "Chợ & đời sống địa phương",
        description: "Xem thành phố thức giấc, mua bán, gặp gỡ và đón thêm một vị khách.",
        detail: "Đời thường · Buổi sáng",
      },
      {
        id: "local-life",
        icon: "05",
        title: "Đời sống địa phương",
        description: "Dành chỗ cho những nhịp sinh hoạt thường ngày, góc phố và con người làm nên ý nghĩa của chúng.",
        detail: "Theo con người · Thong thả",
      },
    ],
    fixedToursCta: "Xem tất cả tour cố định",
    demoDisclosure:
      "Danh mục demo: các tour cố định dùng địa điểm mẫu nội bộ. Liên kết đặt tour mở quy trình thử nghiệm trong trình duyệt; không có booking production hay giao dịch thật.",
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
    trustEyebrow: "Lịch trình hình thành như thế nào",
    trustTitle: "Cách LocalLens hoạt động",
    trustIntro:
      "Ba bước đơn giản để tạo một ngày ở Sài Gòn theo cách của bạn.",
    trustItems: [
      {
        icon: "01",
        title: "Kể chúng tôi nghe về bạn",
        description: "Chia sẻ thời gian, ngân sách và điều bạn quan tâm.",
      },
      {
        icon: "02",
        title: "Nhận bản xem trước AI mô phỏng",
        description: "Xem một lịch trình minh họa từ các địa điểm demo đã duyệt.",
      },
      {
        icon: "03",
        title: "Xem lại và điều chỉnh",
        description: "Điều chỉnh điểm đến và thời gian đến khi lịch trình vừa ý.",
      },
    ],
    personalizationEyebrow: "Yêu cầu của bạn, nhịp điệu của bạn",
    personalizationTitle: "Hãy kể một ngày lý tưởng ở thành phố với bạn",
    personalizationIntro:
      "Bắt đầu từ vài thông tin thực tế. Bản xem trước này giữ lựa chọn trên trang cho đến khi dịch vụ lập kế hoạch được kết nối.",
    personalizationForm: {
      formLabel: "Tùy chọn lịch trình riêng",
      durationLabel: "Bạn có bao nhiêu thời gian?",
      durationHoursLabel: "Giờ",
      durationMinutesLabel: "Phút",
      durationHint: "Nhập giờ trước, rồi đến phút. Tổng thời lượng phải từ 1 đến 12 giờ.",
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
      runtimeLoadingMessage: "Đang chuẩn bị chuyển tiếp an toàn đến planner…",
      runtimeUnavailableMessage: "Không thể chuẩn bị chuyển tiếp an toàn đến planner. Hãy thử lại.",
      runtimeRetryLabel: "Thử lại",
      runtimePlannerLinkLabel: "Đăng nhập để mở planner AI",
      runtimePlannerLinkDisclosure: "Nhu cầu được lưu trong tab này. Hãy đăng nhập tài khoản khách hàng demo để AI tạo và lưu lịch trình.",
      runtimePlannerLinkStorageError: "Trình duyệt không thể lưu dữ liệu chuyển tiếp an toàn đến planner. Chưa có dữ liệu nào được gửi; hãy thử lại khi tab cho phép lưu trữ.",
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
    runtimeDisclosure: "The Supabase planner runtime is selected. This screen does not generate or save an itinerary yet.",
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
    requestQuoteDisclosure: "Only the signed-in demo customer can actively confirm this revision and open the local request step. Nothing is sent to a production backend.",
    requestQuoteStorageError: "This browser could not save the selected revision. The quote request link is unavailable.",
    backHomeLabel: "Back to LocalLens home",
  },
  vi: {
    heading: "Đề xuất lịch trình cá nhân hóa",
    intro: "Xem trình tự, hoạt động, thời gian và chi phí nhóm dự kiến trước khi yêu cầu điều chỉnh.",
    simulatedDisclosure: "Chỉ là đề xuất mô phỏng — nhu cầu chỉ nằm trong tab trình duyệt này; chưa có quyền backend, dịch vụ AI, đặt tour hay thanh toán nào được kết nối.",
    runtimeDisclosure: "Đang chọn runtime lập kế hoạch Supabase. Màn hình này chưa tạo hoặc lưu lịch trình.",
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
    requestQuoteDisclosure: "Chỉ khách hàng demo đang đăng nhập mới có thể chủ động xác nhận phiên bản này và mở bước gửi yêu cầu cục bộ. Không có dữ liệu nào được gửi đến backend production.",
    requestQuoteStorageError: "Trình duyệt không thể lưu phiên bản đã chọn. Liên kết yêu cầu báo giá không khả dụng.",
    backHomeLabel: "Quay lại trang chủ LocalLens",
  },
};

const customRequestCopy: Record<Locale, CustomRequestCopy> = {
  en: {
    heading: "Request a review and quote",
    intro: "Send this selected itinerary revision to the next local-demo step for review.",
    demoDisclosure: "Local demo only: the selected revision is synchronized to browser demo portals after customer sign-in. No production backend, authentication, AI service, Stripe network, card details, or real charge is connected.",
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
    requestIntro: "This submits the selected revision to the browser demo portal for an administrator review; it does not call a production backend or create a real booking.",
    submitRequestLabel: "Submit local demo request",
    adminReviewHeading: "Admin review pending (simulated)",
    adminReviewPendingMessage: "Your browser demo request is pending administrator review. The seeded demo admin can now review it.",
    simulateQuoteLabel: "Check for an issued quote",
    quotePendingMessage: "The request is approved, but an administrator has not issued a quote yet.",
    quoteHeading: "Mock quote",
    quoteMessage: "This amount is the administrator-issued demo quote and remains immutable in this local flow.",
    quoteExpiresLabel: "Quote validity",
    quoteValidityValue: "48 hours (mock)",
    quoteTotalLabel: "Quote total",
    acceptQuoteLabel: "Accept this mock quote",
    quoteAcceptedMessage: "You explicitly accepted the mock quote. Payment has not started.",
    openStripeMockLabel: "Open Stripe Test/Mock action",
    stripeMockHeading: "Stripe Test/Mock boundary",
    stripeMockMessage: "A real product would now open Stripe Checkout. This prototype completes a simulated checkout in the browser demo portal only.",
    noPaymentNetworkDisclosure: "No Stripe network request, card detail, real charge, or webhook was made; this checkout only updates browser demo state.",
    backHomeLabel: "Back to LocalLens home",
  },
  vi: {
    heading: "Yêu cầu xem xét và báo giá",
    intro: "Gửi phiên bản lịch trình đã chọn sang bước demo tiếp theo để xem xét.",
    demoDisclosure: "Chỉ là demo cục bộ: sau khi khách hàng đăng nhập demo, phiên bản đã chọn được đồng bộ sang cổng demo trong trình duyệt. Chưa kết nối backend production, xác thực, dịch vụ AI, mạng Stripe, thông tin thẻ hay giao dịch thật.",
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
    requestIntro: "Thao tác này gửi phiên bản đã chọn vào cổng demo trong trình duyệt để quản trị viên xem xét; không gọi backend production và không tạo booking thật.",
    submitRequestLabel: "Gửi yêu cầu demo cục bộ",
    adminReviewHeading: "Đang chờ admin xem xét (mô phỏng)",
    adminReviewPendingMessage: "Yêu cầu demo trong trình duyệt đang chờ quản trị viên xem xét. Quản trị viên demo đã nhận được yêu cầu.",
    simulateQuoteLabel: "Kiểm tra báo giá đã phát hành",
    quotePendingMessage: "Yêu cầu đã được duyệt nhưng quản trị viên chưa phát hành báo giá.",
    quoteHeading: "Báo giá mô phỏng",
    quoteMessage: "Số tiền này là báo giá demo do quản trị viên phát hành và không đổi trong flow cục bộ này.",
    quoteExpiresLabel: "Thời hạn báo giá",
    quoteValidityValue: "48 giờ (mô phỏng)",
    quoteTotalLabel: "Tổng báo giá",
    acceptQuoteLabel: "Chấp nhận báo giá mô phỏng",
    quoteAcceptedMessage: "Bạn đã chủ động chấp nhận báo giá mô phỏng. Chưa bắt đầu thanh toán.",
    openStripeMockLabel: "Mở thao tác Stripe Test/Mock",
    stripeMockHeading: "Biên giới Stripe Test/Mock",
    stripeMockMessage: "Sản phẩm thật sẽ mở Stripe Checkout. Prototype này chỉ hoàn tất thanh toán mô phỏng trong cổng demo trên trình duyệt.",
    noPaymentNetworkDisclosure: "Không có request mạng Stripe, thông tin thẻ, giao dịch thật hay webhook; thao tác này chỉ cập nhật trạng thái demo trong trình duyệt.",
    backHomeLabel: "Quay lại trang chủ LocalLens",
  },
};

const dictionaries = {
  en: {
    ...english,
    home: customerHomeCopy.en,
    planner: plannerCopy.en,
    customRequest: customRequestCopy.en,
    navigation: {
      primary: english.navigation.primary,
      tours: "Tours",
      personalizedTrip: "Personalized trip",
      howItWorks: "How it works",
      experiences: "Experiences",
      privateJourneys: "Private journeys",
      ourCity: "Our city",
      signIn: english.navigation.signIn,
      skipToContent: english.navigation.skipToContent,
    },
  },
  vi: {
    ...vietnamese,
    home: customerHomeCopy.vi,
    planner: plannerCopy.vi,
    customRequest: customRequestCopy.vi,
    navigation: {
      primary: vietnamese.navigation.primary,
      tours: "Tour",
      personalizedTrip: "Hành trình cá nhân hóa",
      howItWorks: "Cách hoạt động",
      experiences: "Trải nghiệm",
      privateJourneys: "Hành trình riêng",
      ourCity: "Thành phố của chúng ta",
      signIn: vietnamese.navigation.signIn,
      skipToContent: vietnamese.navigation.skipToContent,
    },
  },
} satisfies Record<Locale, Dictionary>;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
