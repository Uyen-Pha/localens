"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  ADMIN_REVIEW_PAGE_SIZE,
  loadAdminFoodReviewQueue,
  reviewFoodCatalogItem,
  submitFoodCatalogReview,
  type AdminReviewQueueClient,
  type AdminFoodReviewRow,
  type ReviewFoodCatalogItemInput,
} from "@/lib/infrastructure/supabase/catalog-review-adapter";
import type { Locale } from "@/lib/domain/data/contracts";
import { parsePublicEnv } from "@/lib/env/public";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type CatalogReviewViewerRole = "admin" | "customer" | "unknown";

export type CatalogReviewQueueProps = {
  locale: Locale;
  rows?: ReadonlyArray<AdminFoodReviewRow>;
  viewerRole?: CatalogReviewViewerRole;
  onReview?: (input: ReviewFoodCatalogItemInput) => Promise<unknown> | unknown;
  hasMore?: boolean;
  onLoadMore?: () => Promise<unknown> | unknown;
  loading?: boolean;
};

type Checklist = ReviewFoodCatalogItemInput["checklist"];
type EvidenceField = keyof Checklist;

const CHECKLIST_FIELDS: ReadonlyArray<{ key: EvidenceField; en: string; vi: string }> = [
  { key: "source", en: "Source and attribution", vi: "Nguồn và ghi công" },
  { key: "bilingualName", en: "Bilingual name", vi: "Tên song ngữ" },
  { key: "location", en: "Location note", vi: "Ghi chú vị trí" },
  { key: "hours", en: "Hours and exceptions", vi: "Giờ mở cửa và ngoại lệ" },
  { key: "price", en: "Price evidence", vi: "Bằng chứng giá" },
  { key: "availability", en: "Availability", vi: "Tình trạng phục vụ" },
  { key: "dietaryAllergen", en: "Dietary and allergen evidence", vi: "Dị ứng và chế độ ăn" },
  { key: "mobility", en: "Mobility evidence", vi: "Bằng chứng tiếp cận" },
];

const INITIAL_CHECKLIST: Checklist = {
  source: false,
  bilingualName: false,
  location: false,
  hours: false,
  price: false,
  availability: false,
  dietaryAllergen: false,
  mobility: false,
};

function missing(locale: Locale): string {
  return locale === "vi" ? "chưa xác minh" : "not verified";
}

function hasText(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function valueOrMissing(value: string | null, locale: Locale): string {
  return hasText(value) ? value : missing(locale);
}

function bilingualValue(value: { en: string | null; vi: string | null }, locale: Locale): string {
  return `${valueOrMissing(value.en, locale)} / ${valueOrMissing(value.vi, locale)}`;
}

function provenanceComplete(value: {
  sourceUrl: string | null;
  verifiedAt: string | null;
  attribution: string | null;
}): boolean {
  return hasText(value.sourceUrl) && hasText(value.verifiedAt) && hasText(value.attribution);
}

function supportComplete(value: Record<string, string>): boolean {
  const statuses = Object.values(value);
  return statuses.length > 0 && statuses.every((status) => status === "supported" || status === "unsupported");
}

function exceptionEvidenceComplete(value: AdminFoodReviewRow["vendor"]["openingExceptions"]): boolean {
  return value.every((entry) => entry.closed ? entry.windows.length === 0 : entry.windows.length > 0);
}

function allergenEvidenceComplete(row: AdminFoodReviewRow): boolean {
  if (!supportComplete(row.item.allergenSupport)) return false;
  return row.item.allergens.every((allergen) => {
    const status = row.item.allergenSupport[allergen];
    return status === "supported" || status === "unsupported";
  });
}

function evidenceChecks(row: AdminFoodReviewRow): Checklist {
  return {
    source: provenanceComplete(row.vendor) && provenanceComplete(row.item),
    bilingualName:
      hasText(row.vendor.title.en) && hasText(row.vendor.title.vi)
      && hasText(row.item.title.en) && hasText(row.item.title.vi),
    location: hasText(row.vendor.locationNote),
    hours: row.vendor.openingHours.length > 0 && exceptionEvidenceComplete(row.vendor.openingExceptions),
    price: row.item.priceVndMin !== null && row.item.priceVndMax !== null && hasText(row.item.portionDescription),
    availability: row.item.available === true,
    dietaryAllergen:
      supportComplete(row.vendor.dietarySupport)
      && supportComplete(row.item.dietarySupport)
      && allergenEvidenceComplete(row),
    mobility: supportComplete(row.vendor.mobilitySupport),
  };
}

function supportLabel(status: string | undefined, locale: Locale): string {
  if (status === "supported") return locale === "vi" ? "được hỗ trợ" : "supported";
  if (status === "unsupported") return locale === "vi" ? "không hỗ trợ" : "unsupported";
  return missing(locale);
}

function supportSummary(value: Record<string, string>, locale: Locale): string {
  const entries = Object.entries(value);
  if (entries.length === 0) return missing(locale);
  return entries.map(([requirement, status]) => `${requirement}: ${supportLabel(status, locale)}`).join(", ");
}

function hoursSummary(row: AdminFoodReviewRow, locale: Locale): string {
  if (row.vendor.openingHours.length === 0) return missing(locale);
  const hours = row.vendor.openingHours
    .map((entry) => `${entry.weekday}: ${entry.opensAt}–${entry.closesAt}`)
    .join(", ");
  const exceptions = row.vendor.openingExceptions.length === 0
    ? (locale === "vi" ? "không có ngoại lệ được ghi nhận" : "no recorded exceptions")
    : row.vendor.openingExceptions.map((entry) => (
      `${entry.localDate}: ${entry.closed ? (locale === "vi" ? "đóng cửa" : "closed") : entry.windows.map((window) => `${window.opensAt}–${window.closesAt}`).join(", ")}`
    )).join(", ");
  return `${hours}; ${exceptions}`;
}

function priceSummary(row: AdminFoodReviewRow, locale: Locale): string {
  if (row.item.priceVndMin === null || row.item.priceVndMax === null) return missing(locale);
  return `${row.item.priceVndMin}–${row.item.priceVndMax} VND`;
}

function sourceLink(value: string | null, locale: Locale): ReactNode {
  return !hasText(value) ? missing(locale) : <a href={value}>{value}</a>;
}

function titleFor(row: AdminFoodReviewRow, locale: Locale): string {
  return locale === "vi"
    ? valueOrMissing(row.item.title.vi, locale)
    : valueOrMissing(row.item.title.en, locale);
}

function defaultReview(): Promise<never> {
  // A queue without a server callback must never present a local validation
  // result as an audit write. The real page wires this action to the guarded
  // RPC once an authenticated admin session is available.
  return Promise.reject(new Error("guarded review RPC is not configured"));
}

function resolvedError(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const error = (value as Record<string, unknown>).error;
  return error !== null && error !== undefined;
}

function ReviewCard({
  locale,
  row,
  onReview,
}: {
  locale: Locale;
  row: AdminFoodReviewRow;
  onReview: (input: ReviewFoodCatalogItemInput) => Promise<unknown> | unknown;
}) {
  const checks = useMemo(() => evidenceChecks(row), [row]);
  const rowContentKey = useMemo(() => JSON.stringify(row), [row]);
  const [checklist, setChecklist] = useState<Checklist>(INITIAL_CHECKLIST);
  const [rejectionNote, setRejectionNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setChecklist(INITIAL_CHECKLIST);
    setRejectionNote("");
    setMessage(null);
  }, [rowContentKey]);
  const allConfirmed = Object.values(checklist).every(Boolean);
  const remainsResearchOnly = row.item.status === "research_only" && row.vendor.status !== "temporarily_closed";
  const canApprove = remainsResearchOnly && Object.values(checks).every(Boolean) && allConfirmed && !submitting;
  const canReject = rejectionNote.trim().length > 0 && !submitting;

  function updateChecklist(key: EvidenceField, checked: boolean) {
    setChecklist((current) => ({ ...current, [key]: checked }));
    setMessage(null);
  }

  function submit(decision: ReviewFoodCatalogItemInput["decision"]) {
    const input: ReviewFoodCatalogItemInput = {
      itemId: row.itemId,
      vendorId: row.vendorId,
      decision,
      checklist,
      rejectionNote: decision === "research_only" ? rejectionNote.trim() : null,
    };
    const validation = reviewFoodCatalogItem(input);
    if (!validation.ok) {
      setMessage(locale === "vi" ? "Không thể gửi quyết định này." : "This review cannot be submitted.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const result = onReview(input);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        void Promise.resolve(result)
          .then((resolved) => {
            if (resolvedError(resolved)) throw new Error("review RPC returned an error");
            setMessage(locale === "vi" ? "Đã ghi nhận quyết định." : "Review decision recorded.");
          })
          .catch(() => setMessage(locale === "vi" ? "Không thể ghi nhận quyết định." : "The review could not be recorded."))
          .finally(() => setSubmitting(false));
      } else {
        if (resolvedError(result)) throw new Error("review RPC returned an error");
        setMessage(locale === "vi" ? "Đã ghi nhận quyết định." : "Review decision recorded.");
        setSubmitting(false);
      }
    } catch {
      setMessage(locale === "vi" ? "Không thể ghi nhận quyết định." : "The review could not be recorded.");
      setSubmitting(false);
    }
  }

  const labels = locale === "vi"
    ? {
      vendor: "Nhà cung cấp / Vendor",
      vendorDescription: "Mô tả nhà cung cấp / Vendor description",
      description: "Mô tả / Description",
      location: "Vị trí / Location",
      hours: "Giờ mở cửa / Hours",
      price: "Giá / Price",
      portion: "Khẩu phần / Portion",
      availability: "Tình trạng / Availability",
      dietary: "Chế độ ăn / Dietary",
      allergens: "Dị nguyên / Allergens",
      mobility: "Tiếp cận / Mobility",
      source: "Nguồn / Source",
      attribution: "Ghi công / Attribution",
      verified: "Xác minh lúc / Verified",
      status: "Trạng thái / Status",
      history: "Lịch sử duyệt / Review history",
      noHistory: "Chưa có lịch sử duyệt",
      rejection: "Ghi chú từ chối / Rejection note",
      reject: "Giữ nghiên cứu / Keep research-only",
      approve: "Duyệt bán được / Approve sellable",
    }
    : {
      vendor: "Vendor / Nhà cung cấp",
      vendorDescription: "Vendor description / Mô tả nhà cung cấp",
      description: "Description / Mô tả",
      location: "Location / Vị trí",
      hours: "Hours / Giờ mở cửa",
      price: "Price / Giá",
      portion: "Portion / Khẩu phần",
      availability: "Availability / Tình trạng",
      dietary: "Dietary / Chế độ ăn",
      allergens: "Allergens / Dị nguyên",
      mobility: "Mobility / Tiếp cận",
      source: "Source / Nguồn",
      attribution: "Attribution / Ghi công",
      verified: "Verified / Xác minh lúc",
      status: "Status / Trạng thái",
      history: "Review history / Lịch sử duyệt",
      noHistory: "No review history / Chưa có lịch sử duyệt",
      rejection: "Rejection note / Ghi chú từ chối",
      reject: "Keep research-only / Giữ nghiên cứu",
      approve: "Approve sellable / Duyệt bán được",
    };

  return (
    <article className="admin-catalog-review-card" aria-label={titleFor(row, locale)}>
      <header>
        <p className="eyebrow">{row.vendor.slug}</p>
        <h2>{titleFor(row, locale)}</h2>
        <p>{bilingualValue(row.item.title, locale)}</p>
        <p>
          {labels.vendor}: <span>{valueOrMissing(row.vendor.title.en, locale)}</span> / <span>{valueOrMissing(row.vendor.title.vi, locale)}</span>
        </p>
      </header>

      <dl className="admin-catalog-review-card__facts">
        <div><dt>{labels.vendorDescription}</dt><dd>{bilingualValue(row.vendor.description, locale)}</dd></div>
        <div><dt>{labels.description}</dt><dd>{bilingualValue(row.item.description, locale)}</dd></div>
        <div><dt>{labels.location}</dt><dd>{valueOrMissing(row.vendor.locationNote, locale)}</dd></div>
        <div><dt>{labels.hours}</dt><dd>{hoursSummary(row, locale)}</dd></div>
        <div><dt>{labels.price}</dt><dd>{priceSummary(row, locale)}</dd></div>
        <div><dt>{labels.portion}</dt><dd>{valueOrMissing(row.item.portionDescription, locale)}</dd></div>
        <div><dt>{labels.availability}</dt><dd>{row.item.available === null ? missing(locale) : row.item.available ? (locale === "vi" ? "đang phục vụ" : "available") : (locale === "vi" ? "không phục vụ" : "unavailable")}</dd></div>
        <div><dt>{labels.dietary}</dt><dd>{supportSummary(row.item.dietarySupport, locale)}</dd></div>
        <div><dt>{labels.allergens}</dt><dd>{row.item.allergens.length === 0 ? missing(locale) : row.item.allergens.join(", ")} ({supportSummary(row.item.allergenSupport, locale)})</dd></div>
        <div><dt>{labels.mobility}</dt><dd>{supportSummary(row.vendor.mobilitySupport, locale)}</dd></div>
        <div><dt>{labels.vendor}: {labels.source}</dt><dd>{sourceLink(row.vendor.sourceUrl, locale)}</dd></div>
        <div><dt>{labels.vendor}: {labels.attribution}</dt><dd>{valueOrMissing(row.vendor.attribution, locale)}</dd></div>
        <div><dt>{labels.vendor}: {labels.verified}</dt><dd>{valueOrMissing(row.vendor.verifiedAt, locale)}</dd></div>
        <div><dt>{labels.source}</dt><dd>{sourceLink(row.item.sourceUrl, locale)}</dd></div>
        <div><dt>{labels.attribution}</dt><dd>{valueOrMissing(row.item.attribution, locale)}</dd></div>
        <div><dt>{labels.verified}</dt><dd>{valueOrMissing(row.item.verifiedAt, locale)}</dd></div>
        <div><dt>{labels.status}</dt><dd>{row.vendor.status} / {row.item.status}</dd></div>
        <div><dt>{labels.history}</dt><dd>{row.auditHistory.length === 0 ? labels.noHistory : (
          <ul>{row.auditHistory.map((entry) => <li key={entry.eventId}>{entry.decision}: <span>{entry.rejectionNote ?? (entry.decision === "rejected" ? missing(locale) : (locale === "vi" ? "đã duyệt" : "approved"))}</span> ({entry.reviewedAt})</li>)}</ul>
        )}</dd></div>
      </dl>

      <fieldset className="admin-catalog-review-card__checklist" disabled={submitting}>
        <legend>{locale === "vi" ? "Xác nhận bằng chứng / Confirm evidence" : "Confirm evidence / Xác nhận bằng chứng"}</legend>
        {CHECKLIST_FIELDS.map((field) => (
          <label key={field.key}>
            <input
              type="checkbox"
              checked={checklist[field.key]}
              onChange={(event) => updateChecklist(field.key, event.target.checked)}
            />
            <span>{locale === "vi" ? `${field.vi} / ${field.en}` : `${field.en} / ${field.vi}`}</span>
          </label>
        ))}
      </fieldset>

      <label className="admin-catalog-review-card__rejection">
        <span>{labels.rejection}</span>
        <textarea
          value={rejectionNote}
          onChange={(event) => { setRejectionNote(event.target.value); setMessage(null); }}
          maxLength={1000}
          aria-label={labels.rejection}
          placeholder={missing(locale)}
        />
      </label>

      <div className="admin-catalog-review-card__actions">
        {Object.values(checks).every(Boolean) ? (
          <button type="button" className="button" disabled={!canApprove} onClick={() => submit("sellable")}>
            {labels.approve}
          </button>
        ) : null}
        <button type="button" className="button button--secondary" disabled={!canReject} onClick={() => submit("research_only")}>
          {labels.reject}
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </article>
  );
}

export function CatalogReviewQueue({
  locale,
  rows = [],
  viewerRole = "unknown",
  onReview = defaultReview,
  hasMore = false,
  onLoadMore,
  loading = false,
}: CatalogReviewQueueProps) {
  const isAdmin = viewerRole === "admin";
  const copy = locale === "vi"
    ? {
      heading: "Duyệt danh mục món ăn",
      intro: "Kiểm tra bằng chứng nhà cung cấp và món ăn trước khi cho phép hiển thị như dữ liệu có thể bán.",
      required: "Cần đăng nhập quản trị viên",
      empty: "Không có mục đang chờ duyệt.",
      loading: "Đang tải hàng đợi duyệt…",
      loadMore: "Tải thêm / Load more",
      loadingMore: "Đang tải…",
      loadFailed: "Không thể tải hàng đợi duyệt.",
    }
    : {
      heading: "Food catalog review",
      intro: "Check vendor and menu evidence before allowing a row to become sellable catalog data.",
      required: "Admin sign-in required",
      empty: "No catalog items are waiting for review.",
      loading: "Loading review queue…",
      loadMore: "Load more / Tải thêm",
      loadingMore: "Loading…",
      loadFailed: "The review queue could not be loaded.",
    };

  return (
    <section className="admin-catalog-review" aria-labelledby="food-catalog-review-title">
      <div className="section-heading">
        <p className="eyebrow">Admin / Quản trị</p>
        <h1 id="food-catalog-review-title">{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>
      {loading ? <p role="status">{copy.loading}</p> : null}
      {!loading && !isAdmin ? <p role="alert">{copy.required}</p> : null}
      {!loading && isAdmin && rows.length === 0 ? <p role="status">{copy.empty}</p> : null}
      {isAdmin ? rows.map((row) => <ReviewCard key={row.itemId} locale={locale} row={row} onReview={onReview} />) : null}
      {!loading && isAdmin && hasMore && onLoadMore ? (
        <button type="button" className="button button--secondary" onClick={() => void onLoadMore()}>
          {copy.loadMore}
        </button>
      ) : null}
    </section>
  );
}

type LiveQueueState = {
  status: "loading" | "ready" | "forbidden" | "error";
  rows: AdminFoodReviewRow[];
  page: number;
  hasMore: boolean;
};

/** Client-connected route boundary: Supabase owns session, role, queue and writes. */
export function CatalogReviewLiveQueue({ locale }: { locale: Locale }) {
  const [client, setClient] = useState<AdminReviewQueueClient | null>(null);
  const [state, setState] = useState<LiveQueueState>({ status: "loading", rows: [], page: 0, hasMore: false });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    try {
      const env = parsePublicEnv({
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      });
      setClient(createBrowserSupabaseClient(env) as unknown as AdminReviewQueueClient);
    } catch {
      setState((current) => ({ ...current, status: "error" }));
    }
  }, []);

  const loadPage = useCallback(async (page: number, append: boolean) => {
    if (!client) return;
    if (append) setLoadingMore(true);
    const result = await loadAdminFoodReviewQueue(client, { page, pageSize: ADMIN_REVIEW_PAGE_SIZE });
    if (!result.ok) {
      setState((current) => ({ ...current, status: "error" }));
      setLoadingMore(false);
      return;
    }
    if (result.value.viewerRole === "admin") {
      setState((current) => ({
        status: "ready",
        rows: append ? [...current.rows, ...result.value.rows] : result.value.rows,
        page: result.value.page,
        hasMore: result.value.hasMore,
      }));
    } else {
      setState({ status: "forbidden", rows: [], page: result.value.page, hasMore: false });
    }
    setLoadingMore(false);
  }, [client]);

  useEffect(() => {
    if (client) void loadPage(0, false);
  }, [client, loadPage]);

  const copy = locale === "vi" ? "Không thể tải hàng đợi duyệt." : "The review queue could not be loaded.";
  if (state.status === "error") {
    return (
      <>
        <CatalogReviewQueue locale={locale} rows={[]} viewerRole="unknown" loading={false} />
        <p role="alert">{copy}</p>
      </>
    );
  }

  const onReview = client
    ? (input: ReviewFoodCatalogItemInput) => submitFoodCatalogReview(client, input)
    : undefined;
  const onLoadMore = client && state.hasMore && !loadingMore
    ? () => loadPage(state.page + 1, true)
    : undefined;

  return (
    <>
      <CatalogReviewQueue
        locale={locale}
        rows={state.rows}
        viewerRole={state.status === "ready" ? "admin" : state.status === "forbidden" ? "customer" : "unknown"}
        onReview={onReview}
        hasMore={state.hasMore}
        onLoadMore={onLoadMore}
        loading={state.status === "loading" || loadingMore}
      />
    </>
  );
}
