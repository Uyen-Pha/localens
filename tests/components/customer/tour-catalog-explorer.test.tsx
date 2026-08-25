import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  TourCatalogExplorer,
  type TourCatalogError,
} from "@/components/customer/tour-catalog-explorer";
import { createReadOnlyApi } from "@/lib/application/api/read-only-api";
import { getDictionary } from "@/lib/i18n/dictionaries";

afterEach(cleanup);

describe("TourCatalogExplorer", () => {
  it("uses the read-only API filter contract for keyword and area filtering", async () => {
    const dictionary = getDictionary("en");
    const catalogResult = createReadOnlyApi().listTours("en");
    if (!catalogResult.ok) throw new Error("expected demo catalog");

    render(
      <TourCatalogExplorer
        locale="en"
        copy={dictionary.home.tourCatalog}
        areaOptions={dictionary.home.tourCatalog.areaOptions}
        initialCatalog={catalogResult.value}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Markets and Street Food" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(dictionary.home.tourCatalog.keywordLabel), {
      target: { value: "CHO LON" },
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Cho Lon Craft Traditions" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 2, name: "Markets and Street Food" })).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(dictionary.home.tourCatalog.areaLabel), {
      target: { value: "demo-hcmc-district-5" },
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Cho Lon Craft Traditions" })).toBeInTheDocument();
    });
  });

  it("renders localized empty and API error states", async () => {
    const dictionary = getDictionary("vi");
    const catalogResult = createReadOnlyApi().listTours("vi");
    if (!catalogResult.ok) throw new Error("expected demo catalog");
    const error: TourCatalogError = {
      retryable: true,
      correlationId: "11111111-1111-4111-8111-111111111111",
    };

    render(
      <TourCatalogExplorer
        locale="vi"
        copy={dictionary.home.tourCatalog}
        areaOptions={dictionary.home.tourCatalog.areaOptions}
        initialCatalog={catalogResult.value}
      />,
    );
    fireEvent.change(screen.getByLabelText(dictionary.home.tourCatalog.areaLabel), {
      target: { value: "demo-hcmc-thu-duc" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(dictionary.home.tourCatalog.noResults);

    cleanup();
    render(
      <TourCatalogExplorer
        locale="vi"
        copy={dictionary.home.tourCatalog}
        areaOptions={dictionary.home.tourCatalog.areaOptions}
        initialCatalog={null}
        initialError={error}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(dictionary.home.tourCatalog.errorMessage);
    expect(screen.getByRole("alert")).toHaveTextContent(error.correlationId);
    expect(screen.getByRole("button", { name: dictionary.home.tourCatalog.retryLabel })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: dictionary.home.tourCatalog.retryLabel }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Chợ địa phương và ẩm thực đường phố" })).toBeInTheDocument();
    });
  });
});
