import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RegistrationForm } from "@/components/portals/registration-form";
import { RegistrationError } from "@/lib/application/portal/registration";

afterEach(cleanup);
function fill() {
  fireEvent.change(screen.getByLabelText("Họ và tên"), { target: { value: "Tour Tester" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "traveler@example.test" } });
  fireEvent.change(screen.getByLabelText("Mật khẩu", { exact: true }), { target: { value: "TestPassword42" } });
  fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), { target: { value: "TestPassword42" } });
}
it("rejects invalid input and mismatched passwords before calling registration", () => {
  const register = vi.fn();
  render(<RegistrationForm locale="vi" port={{ register }} navigate={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
  expect(screen.getAllByRole("alert")).toHaveLength(4);
  fill();
  fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), { target: { value: "other" } });
  fireEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
  expect(screen.getByRole("alert")).toHaveTextContent("không khớp");
  expect(register).not.toHaveBeenCalled();
});
it("creates an account once and redirects to sign in", async () => {
  const register = vi.fn().mockResolvedValue({ emailConfirmationRequired: false });
  const navigate = vi.fn();
  render(<RegistrationForm locale="vi" port={{ register }} navigate={navigate} />);
  fill();
  const button = screen.getByRole("button", { name: "Đăng ký" });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/vi/sign-in/?registered=1"));
  expect(register).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Mật khẩu", { exact: true })).toHaveValue("");
});
it("reports duplicate email and lets the customer correct it", async () => {
  const register = vi.fn().mockRejectedValue(new RegistrationError("EMAIL_EXISTS"));
  render(<RegistrationForm locale="vi" port={{ register }} navigate={vi.fn()} />);
  fill(); fireEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Email này đã được đăng ký");
  expect(screen.getByLabelText("Email")).toHaveFocus();
  expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", expect.stringMatching(/^\/vi\/sign-in\/?$/));
});
it("cancels without sending or retaining the form values", () => {
  const register = vi.fn(); const navigate = vi.fn();
  render(<RegistrationForm locale="vi" port={{ register }} navigate={navigate} />);
  fill(); fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
  expect(register).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith("/vi/");
  expect(screen.getByLabelText("Email")).toHaveValue("");
});
