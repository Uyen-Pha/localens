import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const compositionHarness = vi.hoisted(() => ({
  results: [] as unknown[],
  loadPortalSurfaceComposition: vi.fn(async (): Promise<unknown> => {
    const next = compositionHarness.results.length > 1
      ? compositionHarness.results.shift()
      : compositionHarness.results[0];
    if (next instanceof Error) throw next;
    return next;
  }),
}));

const readOnlyApiHarness = vi.hoisted(() => ({
  createReadOnlyApi: vi.fn(),
  previewItinerary: vi.fn(),
}));

vi.mock("@/components/portals/portal-session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/portals/portal-session")>();
  return {
    ...original,
    loadPortalSurfaceComposition: compositionHarness.loadPortalSurfaceComposition,
  };
});

vi.mock("@/lib/application/api/read-only-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/application/api/read-only-api")>();
  return {
    ...original,
    createReadOnlyApi: (...args: Parameters<typeof original.createReadOnlyApi>) => {
      readOnlyApiHarness.createReadOnlyApi(...args);
      const api = original.createReadOnlyApi(...args);
      readOnlyApiHarness.previewItinerary.mockImplementation(api.previewItinerary);
      return {
        ...api,
        previewItinerary: readOnlyApiHarness.previewItinerary,
      };
    },
  };
});

import {
  buildPersonalizationRequest,
  parseBudgetAmountMinor,
  PersonalizationForm,
} from "@/components/customer/personalization-form";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  DEMO_PLANNER_SESSION_KEY,
  readPersonalizationRequest,
} from "@/lib/application/planner/personalization-session";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  compositionHarness.results = [{ mode: "demo", initialized: Promise.resolve() }];
  compositionHarness.loadPortalSurfaceComposition.mockClear();
  readOnlyApiHarness.createReadOnlyApi.mockClear();
  readOnlyApiHarness.previewItinerary.mockClear();
  window.sessionStorage.clear();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function chooseDemoMarketPriority(copy: {
  priorities: ReadonlyArray<{ key: string; label: string }>;
}) {
  const streetFood = copy.priorities.find((priority) => priority.key === "street_food");
  const traditionalMarket = copy.priorities.find((priority) => priority.key === "traditional_market");
  if (streetFood === undefined || traditionalMarket === undefined) {
    throw new Error("expected food and market priority controls");
  }
  fireEvent.change(screen.getByLabelText(streetFood.label), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText(traditionalMarket.label), { target: { value: "1" } });
}

function fillValidForm(
  copy: ReturnType<typeof getDictionary>["home"]["personalizationForm"],
  specialNeeds = "",
) {
  fireEvent.change(screen.getByLabelText(copy.startDateLabel), {
    target: { value: "2026-09-05" },
  });
  fireEvent.click(screen.getByLabelText(copy.areaOptions[0].label));
  if (specialNeeds) {
    fireEvent.change(screen.getByLabelText(copy.specialNeedsLabel), {
      target: { value: specialNeeds },
    });
  }
  chooseDemoMarketPriority(copy);
}

function runtimeComposition(initialized: Promise<void> = Promise.resolve()) {
  return {
    mode: "supabase",
    initialized,
    planner: {
      getSession: vi.fn(),
      recommend: vi.fn(),
      refine: vi.fn(),
      getPlan: vi.fn(),
    },
  };
}

async function waitUntilReady(copy: ReturnType<typeof getDictionary>["home"]["personalizationForm"]) {
  await waitFor(() => expect(screen.getByRole("button", { name: copy.submitLabel })).toBeEnabled());
}

describe("PersonalizationForm", () => {
  it("exposes every planning preference in a labeled, grouped form", () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);

    expect(screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel })).toHaveClass(
      "personalization-form--editorial",
    );
    const durationGroup = screen.getByRole("group", {
      name: dictionary.home.personalizationForm.durationLabel,
    });
    const durationHours = within(durationGroup).getByLabelText(
      dictionary.home.personalizationForm.durationHoursLabel,
    );
    const durationMinutes = within(durationGroup).getByLabelText(
      dictionary.home.personalizationForm.durationMinutesLabel,
    );
    expect(durationHours).toHaveAttribute("name", "durationHours");
    expect(durationHours).toHaveAttribute("min", "0");
    expect(durationHours).toHaveAttribute("max", "12");
    expect(durationMinutes).toHaveAttribute("name", "durationAdditionalMinutes");
    expect(durationMinutes).toHaveAttribute("min", "0");
    expect(durationMinutes).toHaveAttribute("max", "45");
    expect(durationMinutes).toHaveAttribute("step", "15");
    expect(durationHours.compareDocumentPosition(durationMinutes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("group", { name: dictionary.home.personalizationForm.areasLabel })).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.budgetLabel)).toHaveAttribute(
      "name",
      "budgetAmount",
    );
    expect(screen.getByLabelText(dictionary.home.personalizationForm.budgetCurrencyLabel)).toHaveAttribute(
      "name",
      "budgetCurrency",
    );
    expect(screen.getByLabelText(dictionary.home.personalizationForm.startDateLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.startTimeLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.languageLabel)).toHaveAttribute("name", "guideLanguage");
    expect(screen.getByLabelText(dictionary.home.personalizationForm.partySizeLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.paceLabel)).toHaveAttribute("name", "pace");
    expect(screen.getByLabelText(dictionary.home.personalizationForm.dietLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.mobilityLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.specialNeedsLabel)).toHaveAttribute(
      "maxlength",
      "1000",
    );

    for (const option of dictionary.home.personalizationForm.dietOptions) {
      expect(screen.getByRole("option", { name: option.label })).toHaveValue(option.value);
    }
    for (const option of dictionary.home.personalizationForm.mobilityOptions) {
      expect(screen.getByRole("option", { name: option.label })).toHaveValue(option.value);
    }
    expect(dictionary.home.personalizationForm.dietOptions.map((option) => option.value)).toEqual([
      "none",
      "halal",
      "vegetarian",
    ]);
    expect(dictionary.home.personalizationForm.mobilityOptions.map((option) => option.value)).toEqual([
      "none",
      "step-free",
    ]);
    expect(screen.getByText(dictionary.home.personalizationForm.dietaryUnsupportedNote)).toBeInTheDocument();
    expect(screen.getByText(dictionary.home.personalizationForm.mobilityUnsupportedNote)).toBeInTheDocument();

    const priorityGroup = screen.getByRole("group", {
      name: dictionary.home.personalizationForm.prioritiesLegend,
    });
    expect(priorityGroup).toBeInTheDocument();
    for (const priority of dictionary.home.personalizationForm.priorities) {
      expect(screen.getByLabelText(priority.label)).toHaveAttribute(
        "name",
        `priorityWeights.${priority.key}`,
      );
      expect(screen.getByLabelText(priority.label)).toHaveAttribute("min", "0");
      expect(screen.getByLabelText(priority.label)).toHaveAttribute("max", "5");
    }
    expect(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[0].label)).toHaveAttribute("value", "demo-hcmc-district-1");
    expect(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[1].label)).toHaveAttribute("value", "demo-hcmc-district-3");
  });

  it("requires a date, time, and at least one area before showing the local preview", async () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);
    await waitUntilReady(dictionary.home.personalizationForm);
    const form = screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel });

    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent(
      dictionary.home.personalizationForm.validationMessage,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.startTimeLabel), {
      target: { value: "09:00" },
    });
    fireEvent.click(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[0].label));
    chooseDemoMarketPriority(dictionary.home.personalizationForm);
    fireEvent.submit(form);

    expect(screen.getByRole("status")).toHaveTextContent(
      dictionary.home.personalizationForm.previewMessage,
    );
    expect(screen.queryByText(dictionary.home.personalizationForm.confirmationMessage)).not.toBeInTheDocument();
  });

  it("rejects split duration totals outside the one-to-twelve-hour range", async () => {
    const dictionary = getDictionary("en");
    const copy = dictionary.home.personalizationForm;

    render(<PersonalizationForm copy={copy} />);
    await waitUntilReady(copy);
    const form = screen.getByRole("form", { name: copy.formLabel });
    fireEvent.change(screen.getByLabelText(copy.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.click(screen.getByLabelText(copy.areaOptions[0].label));
    chooseDemoMarketPriority(copy);

    fireEvent.change(screen.getByLabelText(copy.durationHoursLabel), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(copy.durationMinutesLabel), {
      target: { value: "45" },
    });
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent(copy.validationMessage);

    fireEvent.change(screen.getByLabelText(copy.durationHoursLabel), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText(copy.durationMinutesLabel), {
      target: { value: "15" },
    });
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent(copy.validationMessage);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("maps controls to the itinerary request contract with an explicit HCMC offset", () => {
    const formData = new FormData();
    formData.set("startDate", "2026-09-05");
    formData.set("startTime", "09:00");
    formData.set("durationHours", "4");
    formData.set("durationAdditionalMinutes", "15");
    formData.append("areas", "district-1");
    formData.set("budgetAmount", "123.45");
    formData.set("budgetCurrency", "USD");
    formData.set("partySize", "2");
    formData.set("guideLanguage", "vi");
    formData.set("priorityWeights.street_food", "5");
    formData.set("priorityWeights.history", "2");
    formData.set("priorityWeights.traditional_craft", "1");
    formData.set("priorityWeights.traditional_market", "0");
    formData.set("pace", "active");

    expect(buildPersonalizationRequest(formData)).toMatchObject({
      startAt: "2026-09-05T09:00:00+07:00",
      durationMinutes: 255,
      areas: ["district-1"],
      budget: { currency: "USD", amountMinor: 12345 },
      partySize: 2,
      guideLanguage: "vi",
      priorityWeights: {
        street_food: 5,
        history: 2,
        traditional_craft: 1,
        traditional_market: 0,
      },
      pace: "active",
      specialNeeds: "",
    });
  });

  it("renders a deterministic itinerary proposal after a valid preview submit", async () => {
    const dictionary = getDictionary("en");
    const previewCopy = dictionary.home.personalizationForm.preview;

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);
    await waitUntilReady(dictionary.home.personalizationForm);
    const form = screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel });
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.click(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[0].label));
    chooseDemoMarketPriority(dictionary.home.personalizationForm);
    fireEvent.submit(form);

    expect(screen.getByRole("region", { name: previewCopy.heading })).toBeInTheDocument();
    expect(screen.getByText(previewCopy.deterministicDisclosure)).toBeInTheDocument();
    expect(screen.getByText(previewCopy.proposalOnly)).toBeInTheDocument();
    expect(screen.getByText(previewCopy.totalsHeading)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: previewCopy.heading })).toHaveFocus();
  });

  it("keeps the server and pre-hydration render browser-independent", () => {
    const copy = getDictionary("en").home.personalizationForm;

    const markup = renderToString(<PersonalizationForm copy={copy} locale="en" />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("disabled");
    expect(markup).toContain(copy.runtimeLoadingMessage);
    expect(compositionHarness.loadPortalSurfaceComposition).not.toHaveBeenCalled();
    expect(readOnlyApiHarness.createReadOnlyApi).not.toHaveBeenCalled();
  });

  it.each([
    [
      "en" as const,
      "Your preferences are saved in this tab. Sign in with a demo customer account to generate and save an AI-assisted itinerary.",
      "Sign in to open the AI planner",
      "/en/sign-in?returnTo=%2Fen%2Fplanner%2F",
    ],
    [
      "vi" as const,
      "Nhu cầu được lưu trong tab này. Hãy đăng nhập tài khoản khách hàng demo để AI tạo và lưu lịch trình.",
      "Đăng nhập để mở planner AI",
      "/vi/sign-in?returnTo=%2Fvi%2Fplanner%2F",
    ],
  ])("stores a tab-local %s handoff without invoking demo or runtime planning", async (
    locale,
    disclosure,
    linkLabel,
    href,
  ) => {
    const copy = getDictionary(locale).home.personalizationForm;
    const composition = runtimeComposition();
    compositionHarness.results = [composition];
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const specialNeeds = "Quiet route; do not expose this note.";
    window.sessionStorage.setItem(DEMO_PLANNER_SESSION_KEY, "stale demo preview");

    render(<PersonalizationForm copy={copy} locale={locale} />);
    await waitUntilReady(copy);
    fillValidForm(copy, specialNeeds);
    fireEvent.submit(screen.getByRole("form", { name: copy.formLabel }));

    const link = await screen.findByRole("link", { name: linkLabel });
    expect(link).toHaveAttribute("href", href);
    expect(screen.getByText(disclosure)).toBeInTheDocument();
    expect(readPersonalizationRequest()).toMatchObject({ specialNeeds });
    expect(screen.queryByRole("region", { name: copy.preview.heading })).not.toBeInTheDocument();
    expect(screen.queryByText(copy.preview.deterministicDisclosure)).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(DEMO_PLANNER_SESSION_KEY)).toBeNull();
    expect(document.body).not.toHaveTextContent(specialNeeds);
    expect(link.getAttribute("href")).not.toContain(specialNeeds);
    expect(readOnlyApiHarness.createReadOnlyApi).not.toHaveBeenCalled();
    expect(readOnlyApiHarness.previewItinerary).not.toHaveBeenCalled();
    expect(composition.planner.recommend).not.toHaveBeenCalled();
    expect(composition.planner.refine).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("waits for hydration and composition initialization while guarding duplicate submits", async () => {
    const copy = getDictionary("en").home.personalizationForm;
    const initialization = deferred<void>();
    compositionHarness.results = [runtimeComposition(initialization.promise)];
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<PersonalizationForm copy={copy} locale="en" />);
    const form = screen.getByRole("form", { name: copy.formLabel });
    const submit = screen.getByRole("button", { name: copy.submitLabel });
    fillValidForm(copy);

    expect(submit).toBeDisabled();
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(readOnlyApiHarness.previewItinerary).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(compositionHarness.loadPortalSurfaceComposition).toHaveBeenCalledOnce();

    await act(async () => {
      initialization.resolve();
      await initialization.promise;
    });
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it("fails closed on rejected composition and retries without falling back to demo", async () => {
    const copy = getDictionary("en").home.personalizationForm;
    compositionHarness.results = [new Error("invalid runtime"), runtimeComposition()];

    render(<PersonalizationForm copy={copy} locale="en" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The secure planner handoff is unavailable. Try again.",
    );
    expect(readOnlyApiHarness.previewItinerary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: copy.submitLabel })).toBeEnabled();
    });
    expect(compositionHarness.loadPortalSurfaceComposition).toHaveBeenCalledTimes(2);
  });

  it("retries the cached demo composition through its initialization boundary", async () => {
    const copy = getDictionary("en").home.personalizationForm;
    const initialized = Promise.reject<void>(new Error("storage unavailable"));
    void initialized.catch(() => undefined);
    const retryInitialization = vi.fn(async () => undefined);
    const cachedComposition = {
      mode: "demo" as const,
      initialized,
      retryInitialization,
    };
    compositionHarness.results = [cachedComposition];

    render(<PersonalizationForm copy={copy} locale="en" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The secure planner handoff is unavailable. Try again.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByRole("button", { name: copy.submitLabel })).toBeEnabled());
    expect(compositionHarness.loadPortalSurfaceComposition).toHaveBeenCalledTimes(2);
    expect(retryInitialization).toHaveBeenCalledOnce();
    expect(readOnlyApiHarness.createReadOnlyApi).toHaveBeenCalledOnce();
  });

  it.each([
    ["malformed composition", () => ({ mode: "unexpected", initialized: Promise.resolve() })],
    ["rejected initialization", () => {
      const initialized = Promise.reject<void>(new Error("offline"));
      void initialized.catch(() => undefined);
      return runtimeComposition(initialized);
    }],
  ])("fails closed on %s", async (_case, createComposition) => {
    const copy = getDictionary("en").home.personalizationForm;
    compositionHarness.results = [createComposition()];

    render(<PersonalizationForm copy={copy} locale="en" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The secure planner handoff is unavailable. Try again.",
    );
    expect(screen.getByRole("button", { name: copy.submitLabel })).toBeDisabled();
    expect(readOnlyApiHarness.previewItinerary).not.toHaveBeenCalled();
  });

  it("fails closed in Supabase mode when the tab-local handoff cannot be saved", async () => {
    const copy = getDictionary("en").home.personalizationForm;
    compositionHarness.results = [runtimeComposition()];
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    render(<PersonalizationForm copy={copy} locale="en" />);
    await waitFor(() => expect(screen.getByRole("button", { name: copy.submitLabel })).toBeEnabled());
    fillValidForm(copy);
    fireEvent.submit(screen.getByRole("form", { name: copy.formLabel }));

    expect(screen.getByRole("alert")).toHaveTextContent(copy.runtimePlannerLinkStorageError);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: copy.preview.heading })).not.toBeInTheDocument();
    expect(readOnlyApiHarness.previewItinerary).not.toHaveBeenCalled();
  });

  it("reveals a separate simulated planner CTA only after the local preview exists", async () => {
    const dictionary = getDictionary("en");
    const copy = dictionary.home.personalizationForm;

    render(<PersonalizationForm copy={copy} locale="en" />);
    await waitUntilReady(copy);
    expect(screen.queryByRole("link", { name: copy.plannerLinkLabel })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(copy.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.click(screen.getByLabelText(copy.areaOptions[0].label));
    chooseDemoMarketPriority(copy);
    fireEvent.submit(screen.getByRole("form", { name: copy.formLabel }));

    expect(screen.getByRole("link", { name: copy.plannerLinkLabel }).getAttribute("href"))
      .toMatch(/^\/en\/planner\/?$/);
    expect(screen.getByText(copy.plannerLinkDisclosure)).toBeInTheDocument();
  });

  it("stores the submitted preferences for the separate planner demo after preview", async () => {
    const dictionary = getDictionary("en");
    const copy = dictionary.home.personalizationForm;

    render(<PersonalizationForm copy={copy} locale="en" />);
    await waitUntilReady(copy);
    fireEvent.change(screen.getByLabelText(copy.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.change(screen.getByLabelText(copy.startTimeLabel), {
      target: { value: "10:30" },
    });
    fireEvent.change(screen.getByLabelText(copy.durationHoursLabel), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText(copy.durationMinutesLabel), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(copy.partySizeLabel), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText(copy.specialNeedsLabel), {
      target: { value: "Prefer a quiet route." },
    });
    fireEvent.click(screen.getByLabelText(copy.areaOptions[0].label));
    chooseDemoMarketPriority(copy);
    fireEvent.submit(screen.getByRole("form", { name: copy.formLabel }));

    expect(readPersonalizationRequest()).toMatchObject({
      startAt: "2026-09-05T10:30:00+07:00",
      durationMinutes: 240,
      partySize: 4,
      areas: [copy.areaOptions[0].value],
      specialNeeds: "Prefer a quiet route.",
    });
  });

  it("does not show a planner CTA when the tab handoff cannot be saved", async () => {
    const dictionary = getDictionary("en");
    const copy = dictionary.home.personalizationForm;
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    try {
      render(<PersonalizationForm copy={copy} locale="en" />);
      await waitUntilReady(copy);
      fireEvent.change(screen.getByLabelText(copy.startDateLabel), { target: { value: "2026-09-05" } });
      fireEvent.click(screen.getByLabelText(copy.areaOptions[0].label));
      chooseDemoMarketPriority(copy);
      fireEvent.submit(screen.getByRole("form", { name: copy.formLabel }));

      expect(screen.queryByRole("link", { name: copy.plannerLinkLabel })).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(copy.plannerLinkStorageError);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("blocks a preview when party size, budget, or every priority weight is invalid", async () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);
    await waitUntilReady(dictionary.home.personalizationForm);
    const form = screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel });
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.click(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[0].label));
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.partySizeLabel), {
      target: { value: "0" },
    });
    for (const priority of dictionary.home.personalizationForm.priorities) {
      fireEvent.change(screen.getByLabelText(priority.label), { target: { value: "0" } });
    }
    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent(
      dictionary.home.personalizationForm.validationMessage,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses whole VND minor units and cents for USD", () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);
    const amount = screen.getByLabelText(dictionary.home.personalizationForm.budgetLabel);
    expect(amount).toHaveAttribute("step", "1");
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.budgetCurrencyLabel), {
      target: { value: "USD" },
    });
    expect(amount).toHaveAttribute("step", "0.01");
  });

  it("maps USD decimals to exact positive cents and rejects sub-cent or fractional VND", () => {
    const formData = new FormData();
    formData.set("startDate", "2026-09-05");
    formData.set("startTime", "09:00");
    formData.set("durationHours", "3");
    formData.set("durationAdditionalMinutes", "0");
    formData.set("areas", "demo-hcmc-district-1");
    formData.set("budgetCurrency", "USD");
    formData.set("budgetAmount", "1.01");

    expect(buildPersonalizationRequest(formData).budget.amountMinor).toBe(101);
    expect(parseBudgetAmountMinor("USD", "90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseBudgetAmountMinor("USD", "90071992547409.92")).toBeNull();

    for (const invalidAmount of ["1.001", "0.001"]) {
      formData.set("budgetAmount", invalidAmount);
      expect(() => buildPersonalizationRequest(formData)).toThrow(/budget/i);
    }

    formData.set("budgetCurrency", "VND");
    formData.set("budgetAmount", "1000.5");
    expect(() => buildPersonalizationRequest(formData)).toThrow(/budget/i);
  });
});
