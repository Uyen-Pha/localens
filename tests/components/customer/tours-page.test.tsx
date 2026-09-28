import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FixedToursGrid } from "@/components/customer/fixed-tours-grid";
import ToursPage, { generateMetadata } from "@/app/[locale]/tours/page";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";

const originalRuntimeMode = process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME;

beforeEach(() => {
  // Exercise the real local composition without connecting to a hosted database.
  process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME = "demo";
});

afterEach(() => {
  cleanup();
  if (originalRuntimeMode === undefined) delete process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME;
  else process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME = originalRuntimeMode;
});

describe("localized fixed tours page", () => {
  it("keeps the browser title and Open Graph title aligned", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(metadata.title).toBe(metadata.openGraph?.title);
  });

  it("renders six approved compact tours with facts and detail links when no departure is available", async () => {
    render(await ToursPage({ params: Promise.resolve({ locale: "en" }) }));

    expect(await screen.findByRole("heading", { level: 1, name: "Fixed tours in Ho Chi Minh City" })).toBeInTheDocument();
    const cards = await screen.findAllByRole("article", {}, { timeout: 5_000 });
    expect(cards).toHaveLength(6);
    expect(screen.getByRole("status")).toHaveTextContent("06 journeys to discover");
    expect(screen.getAllByRole("note")[0]).toHaveTextContent(fixedTourRuntimeCopy("en").runtimeDisclosure);

    const expectedTours = [
      ["Saigon Heritage", "demo-heritage-and-market-morning", "4h 30m", "790,000"],
      ["Cholon Culture and Phu Binh Lantern Making", "demo-craft-and-tasting-afternoon", "9h", "1,990,000"],
      ["Saigon Fine Arts and Evening River Cruise", "demo-waterways-and-evening-stories", "5h 30m", "1,590,000"],
      ["Dạo Chợ Lớn: Chợ Bình Tây và bữa cơm địa phương", "ll-f04", "2h", "290,000"],
      ["Sài Gòn đời thường: Cà phê vợt và Tân Định", "ll-f05", "3h 30m", "490,000"],
      ["Củ Chi: Theo dấu lịch sử tại Bến Đình", "ll-f06", "7h 30m", "990,000"],
    ];
    for (const [index, [title, slug, duration, price]] of expectedTours.entries()) {
      const card = cards[index];
      expect(within(card).getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
      expect(card).toHaveTextContent(duration);
      expect(card).toHaveTextContent(price);
      expect(within(card).getByRole("img").getAttribute("alt")).toBeTruthy();
      for (const link of within(card).getAllByRole("link", { name: title })) {
        expect(link).toHaveAttribute("href", `/en/tours/detail?tour=${slug}`);
      }
      expect(within(card).getByRole("note")).toHaveTextContent("No departure scheduled yet");
      expect(card.querySelector(".runtime-tour__summary")?.textContent).toBeTruthy();
      // Expanded itinerary and source facts belong on the detail page.
      expect(card.querySelector("details")).toBeNull();
    }
    expect(document.querySelector(".demo-tour-grid")).toBeNull();
    expect(document.querySelector('a[href*="/booking/"]')).toBeNull();
  });

  it.each([
    { locale: "en" as const, search: "Search tours", keyword: "What would you like to explore?", language: "Content language", experience: "Experience", budget: "Budget / person (VND)", duration: "Duration", submit: "Search", reset: "Clear filters", title: "Saigon Heritage", empty: "No matching results" },
    { locale: "vi" as const, search: "Tìm kiếm tour", keyword: "Bạn muốn khám phá điều gì?", language: "Ngôn ngữ nội dung", experience: "Loại trải nghiệm", budget: "Ngân sách / khách (VND)", duration: "Thời lượng", submit: "Tìm kiếm", reset: "Xóa bộ lọc", title: "Dấu ấn Sài Gòn", empty: "Không có kết quả phù hợp" },
  ])("localizes the $locale search controls and applies keyword, budget, and reset actions", async (copy) => {
    render(await ToursPage({ params: Promise.resolve({ locale: copy.locale }) }));
    expect(await screen.findAllByRole("article", {}, { timeout: 5_000 })).toHaveLength(6);
    const search = screen.getByRole("search", { name: copy.search });
    expect(within(search).getByRole("combobox", { name: copy.language })).toHaveValue(copy.locale);
    expect(within(search).getByRole("combobox", { name: copy.experience })).toHaveValue("");
    expect(within(search).getByRole("combobox", { name: copy.duration })).toHaveValue("");

    fireEvent.change(within(search).getByRole("searchbox", { name: copy.keyword }), { target: { value: copy.locale === "vi" ? "Dinh Độc Lập" : "Saigon Heritage" } });
    fireEvent.click(within(search).getByRole("button", { name: copy.submit }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(screen.getByRole("heading", { level: 2, name: copy.title })).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { level: 2, name: copy.title })).getByRole("link")).toHaveAttribute(
      "href", `/${copy.locale}/tours/detail?tour=demo-heritage-and-market-morning`,
    );

    fireEvent.change(within(search).getByRole("combobox", { name: copy.budget }), { target: { value: "under300k" } });
    fireEvent.click(within(search).getByRole("button", { name: copy.submit }));
    expect(await screen.findByRole("heading", { name: copy.empty })).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);

    fireEvent.click(within(search).getByRole("button", { name: copy.reset }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(6));
    expect(within(search).getByRole("searchbox", { name: copy.keyword })).toHaveValue("");
    expect(within(search).getByRole("combobox", { name: copy.budget })).toHaveValue("");
  });

  it("keeps the fixed-tour grid and cards on the editorial class contract", () => {
    const dictionary = getDictionary("en");
    render(<FixedToursGrid locale="en" copy={dictionary.home} />);
    expect(document.querySelector(".tour-grid")).toHaveClass("tour-grid--editorial");
    for (const tour of dictionary.home.fixedTours) {
      expect(document.getElementById(tour.id)).toHaveClass("tour-card--editorial");
    }
  });
});
