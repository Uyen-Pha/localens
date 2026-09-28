import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlannerSurface } from "@/components/customer/planner-surface";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import { readPersonalizationRequest } from "@/lib/application/planner/personalization-session";
import { savePersonalizationRequest } from "@/lib/application/planner/personalization-session";
import { researchInput, researchReady, revisionId, requestId } from '../../fixtures/research-recovery';

const mocks = vi.hoisted(() => ({
  loadPortalSurfaceComposition: vi.fn(),
}));

vi.mock("@/components/portals/portal-session", () => ({
  loadPortalSurfaceComposition: mocks.loadPortalSurfaceComposition,
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  mocks.loadPortalSurfaceComposition.mockReset();
});

const copy = getDictionary("vi").planner;
const DYNAMIC_IMPORT_TIMEOUT_MS = 5_000;
const DYNAMIC_IMPORT_TEST_TIMEOUT_MS = 10_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function demoComposition(): DemoPortalComposition {
  return {
    mode: "demo",
    initialized: Promise.resolve(),
  } as DemoPortalComposition;
}

function supabaseComposition(): SupabasePortalShell {
  return {
    mode: "supabase",
    initialized: Promise.resolve(),
    planner: {
      getSession: async () => null,
      recommend: async () => ({
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          messageKey: "planner.service_unavailable",
          retryable: true,
          correlationId: "00000000-0000-4000-8000-000000000000",
        },
      }),
      refine: async () => ({
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          messageKey: "planner.service_unavailable",
          retryable: true,
          correlationId: "00000000-0000-4000-8000-000000000000",
        },
      }),
      getPlan: async () => ({
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          messageKey: "planner.service_unavailable",
          retryable: true,
          correlationId: "00000000-0000-4000-8000-000000000000",
        },
      }),
    },
  } as unknown as SupabasePortalShell;
}

describe("PlannerSurface", () => {
  it('connects the authenticated research planner to request submission', async () => {
    savePersonalizationRequest(researchInput);
    const submit = vi.fn(async () => requestId);
    mocks.loadPortalSurfaceComposition.mockResolvedValue({ ...supabaseComposition(), researchPlanner: vi.fn(async () => researchReady), researchRequests: { submit }, session: { getSession: async () => ({ role: 'customer', userId: 'customer-a' }) } });
    render(<PlannerSurface locale="vi" copy={copy} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục yêu cầu đã lưu' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tôi đồng ý với lịch trình này.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận & Gửi yêu cầu' }));
    await screen.findByText('Trạng thái: Chờ duyệt');
    expect(submit).toHaveBeenCalledExactlyOnceWith(revisionId);
  });
  it("preserves description and manual values when switching input modes", async () => {
    mocks.loadPortalSurfaceComposition.mockResolvedValue(demoComposition());
    render(<PlannerSurface locale="vi" copy={copy} />);
    const description = await screen.findByRole("textbox", { name: "Mô tả nhu cầu chuyến đi" });
    fireEvent.change(description, { target: { value: "Hai người thích lịch sử, đi ngày 10/10/2027." } });
    fireEvent.click(screen.getByRole("button", { name: "Tự nhập chi tiết" }));
    const partyLabel = getDictionary("vi").home.personalizationForm.partySizeLabel;
    fireEvent.change(screen.getByRole("spinbutton", { name: partyLabel }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Quay lại nhập câu mô tả/ }));
    expect(screen.getByRole("textbox", { name: "Mô tả nhu cầu chuyến đi" })).toHaveValue("Hai người thích lịch sử, đi ngày 10/10/2027.");
    expect(screen.queryByRole("spinbutton", { name: partyLabel })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tự nhập chi tiết" }));
    expect(screen.getByRole("spinbutton", { name: partyLabel })).toHaveValue(4);
  });

  it("offers compact preference chips and expandable areas without changing the group-budget contract", async () => {
    mocks.loadPortalSurfaceComposition.mockResolvedValue(demoComposition());
    render(<PlannerSurface locale="vi" copy={copy} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tự nhập chi tiết" }));
    const formCopy = getDictionary("vi").home.personalizationForm;
    const history = screen.getByRole("checkbox", { name: formCopy.priorities.find(p => p.key === "history")!.label });
    fireEvent.click(history);
    const form = history.closest("form")!;
    expect(new FormData(form).get("priorityWeights.history")).toBe("3");
    expect(new FormData(form).get("budgetAmount")).toBe("1000000");
    expect(screen.getByText("Tùy chọn nâng cao").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/Khu vực ·/).closest("details")).not.toHaveAttribute("open");
  });

  it("keeps compact keyboard navigation in the same order as the visible form", async () => {
    mocks.loadPortalSurfaceComposition.mockResolvedValue(demoComposition());
    render(<PlannerSurface locale="vi" copy={copy} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tự nhập chi tiết" }));
    const form = screen.getByRole("form", { name: getDictionary("vi").home.personalizationForm.formLabel });
    const fields = [...form.querySelectorAll('input:not([type="hidden"]), select')].slice(0, 8);
    expect(fields.map(field => field.getAttribute("name") || field.getAttribute("aria-label"))).toEqual([
      "startDate", "Giờ bắt đầu", "Phút bắt đầu", "durationHours", "durationAdditionalMinutes", "partySize", "budgetDisplay", "budgetCurrency",
    ]);
    const pace = screen.getByRole("group", { name: "Nhịp độ mong muốn" });
    const areas = screen.getByText(/Khu vực ·/);
    expect(pace.compareDocumentPosition(areas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not show an empty itinerary before a request has been generated", async () => {
    mocks.loadPortalSurfaceComposition.mockResolvedValue(demoComposition());
    render(<PlannerSurface locale="vi" copy={copy} />);
    await screen.findByText(copy.simulatedDisclosure);
    expect(screen.queryByRole("region", { name: getDictionary("vi").home.personalizationForm.preview.heading })).not.toBeInTheDocument();
  });

  it("reveals required areas, then hands compact input to the existing runtime with unchanged units", async () => {
    const composition = supabaseComposition();
    Object.assign(composition, { personalizationAreas: { listAreas: async () => [
      { value: "district-1", label: "Khu trung tâm", slug: "district-1", areaId: "area-1", snapshotId: "snapshot-1" },
    ] } });
    mocks.loadPortalSurfaceComposition.mockResolvedValue(composition);
    render(<PlannerSurface locale="vi" copy={copy} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tự nhập chi tiết" }));
    const submit = screen.getByRole("button", { name: "Tạo lịch trình gợi ý" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Ngày bắt đầu mong muốn"), { target: { value: "2030-10-10" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Giờ bắt đầu" }), { target: { value: "14" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Số người trong nhóm" }), { target: { value: "4" } });
    fireEvent.click(submit);
    expect(screen.getByText(/Khu vực ·/).closest("details")).toHaveAttribute("open");
    expect(readPersonalizationRequest()).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Khu trung tâm" }));
    fireEvent.click(submit);
    expect(readPersonalizationRequest()).toMatchObject({
      startAt: "2030-10-10T14:00:00+07:00", durationMinutes: 180,
      partySize: 4, areas: ["district-1"], budget: { currency: "VND", amountMinor: 1000000 },
    });
    fireEvent.click(screen.getByRole("button", { name: /Quay lại nhập câu mô tả/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tự nhập chi tiết" }));
    expect(screen.getByRole("spinbutton", { name: "Số người trong nhóm" })).toHaveValue(4);
  });

  it("renders the existing deterministic planner in demo mode", async () => {
    mocks.loadPortalSurfaceComposition.mockResolvedValue(demoComposition());

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByText(copy.simulatedDisclosure, {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
  }, DYNAMIC_IMPORT_TEST_TIMEOUT_MS);

  it("renders the Supabase planner with the runtime disclosure", async () => {
    mocks.loadPortalSurfaceComposition.mockResolvedValue(supabaseComposition());

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByText(copy.runtimeDisclosure, {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
  }, DYNAMIC_IMPORT_TEST_TIMEOUT_MS);

  it("keeps an unavailable composition recoverable through a user-triggered retry", async () => {
    mocks.loadPortalSurfaceComposition
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(supabaseComposition());

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByRole("alert", {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText(copy.runtimeDisclosure, {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
    expect(mocks.loadPortalSurfaceComposition).toHaveBeenCalledTimes(2);
  }, DYNAMIC_IMPORT_TEST_TIMEOUT_MS);

  it("fails closed when composition initialization rejects", async () => {
    const composition = supabaseComposition();
    Object.assign(composition, { initialized: Promise.reject(new Error("initialization failed")) });
    mocks.loadPortalSurfaceComposition.mockResolvedValue(composition);

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByRole("alert", {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
    expect(screen.queryByText(copy.runtimeDisclosure)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.simulatedDisclosure)).not.toBeInTheDocument();
  }, DYNAMIC_IMPORT_TEST_TIMEOUT_MS);

  it("ignores a late composition completion after unmount", async () => {
    const compositionLoad = deferred<SupabasePortalShell>();
    mocks.loadPortalSurfaceComposition.mockReturnValue(compositionLoad.promise);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { container, unmount } = render(<PlannerSurface locale="vi" copy={copy} />);

      unmount();
      await act(async () => {
        compositionLoad.resolve(supabaseComposition());
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container).toBeEmptyDOMElement();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
