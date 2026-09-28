import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NaturalLanguagePersonalizationForm } from "@/components/customer/natural-language-personalization-form";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { readPersonalizationState } from "@/lib/application/planner/personalization-session";

const mocks = vi.hoisted(() => ({
  loadPortalSurfaceComposition: vi.fn(async () => ({
    mode: "demo" as const,
    initialized: Promise.resolve(),
  })),
}));

vi.mock("@/components/portals/portal-session", () => ({
  loadPortalSurfaceComposition: mocks.loadPortalSurfaceComposition,
}));

afterEach(() => {
  cleanup();
  mocks.loadPortalSurfaceComposition.mockClear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("NaturalLanguagePersonalizationForm", () => {
  it.each([[1.5, 90], [11, 660]])("accepts and confirms a %s-hour description using the shared duration range", async (hours, minutes) => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-10-01T00:00:00Z'));
    render(<NaturalLanguagePersonalizationForm locale="vi" copy={getDictionary('vi').home.personalizationForm}
      composition={{mode:'supabase', initialized:Promise.resolve()}}
      areaOptionsOverride={[{value:'central',label:'Trung tâm'}]} />);
    fireEvent.change(screen.getByRole('textbox', {name:'Mô tả nhu cầu chuyến đi'}), {target:{value:`Tôi muốn đi 2 người lúc 9 giờ ngày 10/10/2027, trong khoảng ${hours} giờ, tổng ngân sách 4 triệu đồng, thích lịch sử.`}});
    const analyze = screen.getByRole('button', {name:'Phân tích nhu cầu'});
    await waitFor(() => expect(analyze).toBeEnabled());
    fireEvent.click(analyze);
    const duration = screen.getByLabelText('Thời lượng (giờ)') as HTMLInputElement;
    expect(duration).toHaveValue(hours);
    expect(duration.checkValidity()).toBe(true);
    expect(readPersonalizationState().status).not.toBe('ok');
    fireEvent.click(screen.getByRole('button', {name:'Tạo lịch trình gợi ý'}));
    const saved = readPersonalizationState();
    expect(saved.status).toBe('ok');
    if (saved.status === 'ok') expect(saved.request).toMatchObject({durationMinutes:minutes,areas:['central'],budget:{currency:'VND',amountMinor:4000000}});
  });

  it("shows the natural-language entry and manual-form option by default", async () => {
    const copy = getDictionary("vi").home.personalizationForm;

    render(
      <NaturalLanguagePersonalizationForm
        locale="vi"
        copy={copy}
        onSwitchToManual={() => undefined}
      />,
    );

    expect(await screen.findByRole("textbox", { name: "Mô tả nhu cầu chuyến đi" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Phân tích nhu cầu" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tự nhập chi tiết" })).toBeVisible();
  });
});
