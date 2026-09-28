import { AdminAccountsError, type AdminAccount, type AdminAccountsPort } from "@/lib/application/admin-accounts";

const people = [
  ["Nguyễn Minh Anh", "minhanh", "guide"],
  ["Trần Quốc Bảo", "bao.tran", "customer"],
  ["Phạm Thị Lan", "lan.pham", "guide"],
  ["Nguyễn Văn Dũng", "dung.nguyen", "customer"],
  ["Trần Mai Khanh", "khanh.tran", "customer"],
  ["Lê Hoàng", "hoang.le", "guide"],
  ["Phạm Minh Tuấn", "tuan.pham", "customer"],
  ["Võ Thảo Vy", "vy.vo", "customer"],
  ["Lương Gia Như", "nhu.luong", "guide"],
  ["Đặng Ngọc Linh", "linh.dang", "customer"],
  ["Bùi Thanh Hà", "ha.bui", "customer"],
  ["Đỗ Hải Nam", "nam.do", "guide"],
  ["Nguyễn Hà My", "my.nguyen", "customer"],
  ["Trần Khánh Toàn", "toan.tran", "guide"],
  ["Phan Gia Hân", "han.phan", "customer"],
  ["Đinh Quốc Việt", "viet.dinh", "customer"],
  ["Võ Minh Khoa", "khoa.vo", "customer"],
  ["Hoàng Ngọc Mai", "mai.hoang", "customer"],
  ["Trương Anh Thư", "thu.truong", "customer"],
  ["Nguyễn Phúc Long", "long.nguyen", "customer"],
  ["Lê Thanh Tâm", "tam.le", "customer"],
  ["Huỳnh Bảo Ngọc", "ngoc.huynh", "customer"],
  ["Phạm Đức Thịnh", "thinh.pham", "customer"],
  ["Cao Mỹ Linh", "linh.cao", "customer"],
  ["Nguyễn Thành Đạt", "dat.nguyen", "customer"],
  ["Đào Ngọc Yến", "yen.dao", "customer"],
  ["Trần Gia Bảo", "bao.tran2", "customer"],
  ["Mai Hoàng Nam", "nam.mai", "customer"],
  ["Bùi Quang Huy", "huy.bui", "customer"],
  ["Vũ Khánh An", "an.vu", "customer"],
] as const;

/** Fictional, per-instance demo state. No authentication or cloud account is created. */
export function createDemoAdminAccountsPort(): AdminAccountsPort {
  const accounts: AdminAccount[] = people.map(([name, email, role], index) => {
    const locked = [2, 4, 7, 15, 23].includes(index);
    return {
      id: `demo-account-${index + 1}`,
      name,
      email: `${email}@locallens.example`,
      phone: `090000${String(index + 1).padStart(4, "0")}`,
      role,
      status: locked ? "locked" : "active",
      createdAt: new Date(Date.UTC(2026, 8, 26 - index, 1)).toISOString(),
      ...(locked ? { lockReason: "Tạm khóa để kiểm tra thông tin tài khoản (dữ liệu minh họa)." } : {}),
      history: [{
        id: `demo-history-${index + 1}`,
        title: ["Dấu ấn Sài Gòn", "Sắc màu Chợ Lớn và trải nghiệm làm đèn Phú Bình", "Mỹ thuật Sài Gòn và du ngoạn sông chiều tối"][index % 3],
        date: "2026-09-20",
        status: role === "guide" ? "Đã phân công" : "Đã xác nhận",
      }],
    };
  });

  return {
    async list() {
      return accounts.map(account => ({ ...account, history: account.history.map(item => ({ ...item })), ...(account.audit ? { audit: account.audit.map(item => ({ ...item })) } : {}) }));
    },
    async createGuide(input) {
      const name = input.name.trim();
      const email = input.email.trim().toLowerCase();
      const phone = input.phone.trim();
      if (!name) throw new AdminAccountsError("Vui lòng nhập họ và tên.", "name");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdminAccountsError("Email không hợp lệ.", "email");
      if (accounts.some(account => account.email.toLowerCase() === email)) throw new AdminAccountsError("Email đã tồn tại trong hệ thống.", "email");
      if (!/^(?:0[35789]\d{8}|\+84[35789]\d{8})$/.test(phone)) throw new AdminAccountsError("Số điện thoại Việt Nam không hợp lệ.", "phone");
      if (input.password.length < 8) throw new AdminAccountsError("Mật khẩu phải có ít nhất 8 ký tự.", "password");
      const at = new Date().toISOString();
      accounts.unshift({ id: `demo-created-${crypto.randomUUID()}`, name, email, phone, role: "guide", status: "active", createdAt: at, history: [], audit: [{ id: crypto.randomUUID(), action: "Tạo tài khoản", at }] });
    },
    async setLocked(id, locked, reason) {
      const account = accounts.find(item => item.id === id);
      if (!account) throw new AdminAccountsError("Không tìm thấy tài khoản.");
      if (locked && !reason?.trim()) throw new AdminAccountsError("Vui lòng nhập lý do khóa tài khoản.", "reason");
      account.status = locked ? "locked" : "active";
      if (locked) account.lockReason = reason!.trim();
      else delete account.lockReason;
      account.audit ??= [];
      account.audit.push({ id: crypto.randomUUID(), action: locked ? "Khóa tài khoản" : "Mở khóa tài khoản", at: new Date().toISOString(), ...(locked ? { reason: reason!.trim() } : {}) });
    },
  };
}
