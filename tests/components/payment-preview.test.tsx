import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaymentPreview } from "@/components/dev/payment-preview";
afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); });
it("counts down, preserves the deadline on remount and blocks payment at expiry", () => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", "/vi/payment-preview/?departure=d1700000-0000-4000-8000-000000000423&partySize=1");
  const first = render(<PaymentPreview locale="vi" />);
  expect(screen.getByRole("timer")).toHaveTextContent("15:00");
  act(() => vi.advanceTimersByTime(60000));
  expect(screen.getByRole("timer")).toHaveTextContent("14:00");
  first.unmount();
  render(<PaymentPreview locale="vi" />);
  expect(screen.getByRole("timer")).toHaveTextContent("14:00");
  act(() => vi.advanceTimersByTime(840000));
  expect(screen.getByRole("timer")).toHaveTextContent("00:00");
  expect(screen.getByRole("button", { name: /Thanh toán mô phỏng/ })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("đã hủy");
});
it("uses selected travelers to calculate the total and completes a simulated payment", async () => {
  window.history.replaceState({}, "", "/vi/payment-preview/?departure=d1700000-0000-4000-8000-000000000423&partySize=2");
  render(<PaymentPreview locale="vi" />);
  const pay = await screen.findByRole("button", { name: /Thanh toán mô phỏng/ });
  expect(pay.textContent).toContain("3.180.000");
  fireEvent.click(pay);
  expect(screen.getByRole("heading", { name: "Thanh toán mô phỏng thành công" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Thanh toán mô phỏng/ })).not.toBeInTheDocument();
});
it("blocks invalid departure and party size", async () => {
  window.history.replaceState({}, "", "/vi/payment-preview/?departure=invalid&partySize=-1");
  render(<PaymentPreview locale="vi" />);
  expect(await screen.findByRole("heading", { name: "Thông tin chuyến đi không hợp lệ" })).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
