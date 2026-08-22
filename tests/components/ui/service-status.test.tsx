import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ServiceStatus,
  type ServiceStatusState,
} from "@/components/ui/service-status";

const labels: Record<ServiceStatusState, string> = {
  available: "Available",
  degraded: "Limited service",
  unavailable: "Unavailable",
};

afterEach(cleanup);

describe("ServiceStatus", () => {
  it.each([
    ["available", "Available"],
    ["degraded", "Limited service"],
    ["unavailable", "Unavailable"],
  ] as const)("shows the localized %s label and a decorative icon", (state, label) => {
    render(<ServiceStatus state={state} labels={labels} />);

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByTestId("service-status-icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText(label).closest("[data-state]")).toHaveAttribute(
      "data-state",
      state,
    );
  });

  it("announces degraded and unavailable states without relying on color", () => {
    for (const state of ["degraded", "unavailable"] as const) {
      const { unmount } = render(
        <ServiceStatus state={state} labels={labels} />,
      );

      expect(screen.getByRole("status")).toHaveTextContent(labels[state]);
      unmount();
    }
  });
});
