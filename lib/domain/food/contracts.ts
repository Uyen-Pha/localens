import { z } from "zod";

export type FoodServiceType =
  | "stall"
  | "shop"
  | "food_court"
  | "street_vendor";
export type ServingUnit =
  | "portion"
  | "bowl"
  | "piece"
  | "drink"
  | "shared_set";
export type FoodPaymentMode = "pay_at_vendor" | "included_in_quote";
export type FoodStatus = "research_only" | "sellable" | "temporarily_closed";
export type SupportStatus = "supported" | "unsupported" | "unknown";

const safeInteger = z.number().int().finite().safe();
const nonNegativeSafeInteger = safeInteger.nonnegative();
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !controlCharacterPattern.test(value), {
    message: "identifiers cannot contain control characters",
  });

const textSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => !controlCharacterPattern.test(value), {
    message: "text cannot contain control characters",
  });

export const bilingualLabelSchema = z
  .object({
    en: textSchema,
    vi: textSchema,
  })
  .strict();

export const foodServiceTypeSchema = z.enum([
  "stall",
  "shop",
  "food_court",
  "street_vendor",
]);
export const servingUnitSchema = z.enum([
  "portion",
  "bowl",
  "piece",
  "drink",
  "shared_set",
]);
export const foodPaymentModeSchema = z.enum([
  "pay_at_vendor",
  "included_in_quote",
]);
export const foodStatusSchema = z.enum([
  "research_only",
  "sellable",
  "temporarily_closed",
]);
export const supportStatusSchema = z.enum([
  "supported",
  "unsupported",
  "unknown",
]);

const supportRecordSchema = z.record(
  z.string().trim().min(1).max(80),
  supportStatusSchema,
);

const weekdaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isRealCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function minutesOf(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function hasOverlappingWindows(
  windows: readonly { opensAt: string; closesAt: string }[],
): boolean {
  const dayMinutes = 24 * 60;
  const intervals: Array<[number, number]> = [];
  for (const window of windows) {
    const start = minutesOf(window.opensAt);
    const end = minutesOf(window.closesAt);
    if (end > start) {
      intervals.push([start, end]);
    } else {
      intervals.push([start, dayMinutes], [0, end]);
    }
  }
  intervals.sort(([a], [b]) => a - b);
  return intervals.some((interval, index) => {
    const previous = intervals[index - 1];
    return previous !== undefined && interval[0] < previous[1];
  });
}

function hasOverlappingWeeklyWindows(
  windows: readonly {
    weekday: number;
    opensAt: string;
    closesAt: string;
  }[],
): boolean {
  const weekMinutes = 7 * 24 * 60;
  const segments: Array<[number, number]> = [];
  for (const window of windows) {
    const opensAt = minutesOf(window.opensAt);
    const closesAt = minutesOf(window.closesAt);
    const duration =
      closesAt > opensAt
        ? closesAt - opensAt
        : closesAt + 24 * 60 - opensAt;
    const start = window.weekday * 24 * 60 + opensAt;
    const end = start + duration;
    if (end <= weekMinutes) {
      segments.push([start, end]);
    } else {
      segments.push([start, weekMinutes], [0, end - weekMinutes]);
    }
  }
  segments.sort(([startA], [startB]) => startA - startB);
  return segments.some((segment, index) => {
    const previous = segments[index - 1];
    return previous !== undefined && segment[0] < previous[1];
  });
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const openingWindowSchema = z
  .object({
    weekday: weekdaySchema,
    opensAt: timeSchema,
    closesAt: timeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.opensAt === value.closesAt) {
      context.addIssue({
        code: "custom",
        message: "opening and closing times cannot be equal",
        path: ["closesAt"],
      });
    }
  });

const openingExceptionWindowSchema = z
  .object({ opensAt: timeSchema, closesAt: timeSchema })
  .strict()
  .superRefine((value, context) => {
    if (value.opensAt === value.closesAt) {
      context.addIssue({
        code: "custom",
        message: "opening and closing times cannot be equal",
        path: ["closesAt"],
      });
    }
  });

const openingExceptionSchema = z
  .object({
    localDate: z.string().refine(isRealCalendarDate, {
      message: "must be a real YYYY-MM-DD calendar date",
    }),
    closed: z.boolean(),
    windows: z.array(openingExceptionWindowSchema).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.closed && value.windows.length > 0) {
      context.addIssue({
        code: "custom",
        message: "closed exceptions cannot contain opening windows",
        path: ["windows"],
      });
    }
    if (!value.closed && hasOverlappingWindows(value.windows)) {
      context.addIssue({
        code: "custom",
        message: "exception windows cannot overlap",
        path: ["windows"],
      });
    }
  });

export const foodMenuItemSchema = z
  .object({
    id: idSchema,
    vendorId: idSchema,
    slug: idSchema,
    title: bilingualLabelSchema,
    description: bilingualLabelSchema,
    servingUnit: servingUnitSchema,
    priceVndMin: nonNegativeSafeInteger,
    priceVndMax: nonNegativeSafeInteger,
    portionDescription: textSchema,
    dietarySupport: supportRecordSchema,
    allergens: z.array(idSchema).max(32),
    available: z.boolean(),
    status: foodStatusSchema,
    verifiedAt: textSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.priceVndMin > value.priceVndMax) {
      context.addIssue({
        code: "custom",
        message: "minimum food price cannot exceed maximum food price",
        path: ["priceVndMax"],
      });
    }
    if (new Set(value.allergens).size !== value.allergens.length) {
      context.addIssue({
        code: "custom",
        message: "allergens must be unique",
        path: ["allergens"],
      });
    }
  });

export const foodVendorSchema = z
  .object({
    id: idSchema,
    placeId: idSchema,
    slug: idSchema,
    title: bilingualLabelSchema,
    description: bilingualLabelSchema,
    locationNote: textSchema,
    serviceType: foodServiceTypeSchema,
    capacityNote: textSchema,
    dietarySupport: supportRecordSchema,
    mobilitySupport: supportRecordSchema,
    openingHours: z.array(openingWindowSchema).max(28),
    openingExceptions: z.array(openingExceptionSchema).max(366),
    status: foodStatusSchema,
    menuItems: z.array(foodMenuItemSchema).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const menuItemIds = value.menuItems.map((item) => item.id);
    if (new Set(menuItemIds).size !== menuItemIds.length) {
      context.addIssue({
        code: "custom",
        message: "menu item IDs must be unique within a vendor",
        path: ["menuItems"],
      });
    }
    const menuSlugs = value.menuItems.map((item) => item.slug);
    if (new Set(menuSlugs).size !== menuSlugs.length) {
      context.addIssue({
        code: "custom",
        message: "menu item slugs must be unique within a vendor",
        path: ["menuItems"],
      });
    }
    value.menuItems.forEach((item, index) => {
      if (item.vendorId !== value.id) {
        context.addIssue({
          code: "custom",
          message: "menu item vendorId must match its parent vendor id",
          path: ["menuItems", index, "vendorId"],
        });
      }
    });
    if (hasOverlappingWeeklyWindows(value.openingHours)) {
      context.addIssue({
        code: "custom",
        message: "opening windows cannot overlap",
        path: ["openingHours"],
      });
    }
    const dates = value.openingExceptions.map((exception) => exception.localDate);
    if (!unique(dates)) {
      context.addIssue({
        code: "custom",
        message: "opening exception dates must be unique",
        path: ["openingExceptions"],
      });
    }
  });

export interface FoodQuotePolicy {
  readonly allowIncludedInQuote: boolean;
}

export const MVP_FOOD_QUOTE_POLICY: FoodQuotePolicy = Object.freeze({
  allowIncludedInQuote: false,
});

export function createFoodSelectionSchema(
  policy: FoodQuotePolicy = MVP_FOOD_QUOTE_POLICY,
) {
  return z
    .object({
      vendorId: idSchema,
      menuItemId: idSchema,
      quantity: nonNegativeSafeInteger,
      priceVndMin: nonNegativeSafeInteger,
      priceVndMax: nonNegativeSafeInteger,
      paymentMode: foodPaymentModeSchema,
      activity: textSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (value.priceVndMin > value.priceVndMax) {
        context.addIssue({
          code: "custom",
          message: "minimum food price cannot exceed maximum food price",
          path: ["priceVndMax"],
        });
      }
      if (
        value.paymentMode === "included_in_quote" &&
        policy.allowIncludedInQuote !== true
      ) {
        context.addIssue({
          code: "custom",
          message: "included food requires an enabled quote policy",
          path: ["paymentMode"],
        });
      }
    });
}

export const foodSelectionSchema = createFoodSelectionSchema();

export type FoodVendorCandidate = z.infer<typeof foodVendorSchema>;
export type FoodMenuItemCandidate = z.infer<typeof foodMenuItemSchema>;
export type FoodSelection = z.infer<typeof foodSelectionSchema>;

export const BilingualLabelSchema = bilingualLabelSchema;
export const FoodServiceTypeSchema = foodServiceTypeSchema;
export const ServingUnitSchema = servingUnitSchema;
export const FoodPaymentModeSchema = foodPaymentModeSchema;
export const FoodStatusSchema = foodStatusSchema;
export const FoodSupportStatusSchema = supportStatusSchema;
export const FoodVendorSchema = foodVendorSchema;
export const FoodMenuItemSchema = foodMenuItemSchema;
export const FoodVendorCandidateSchema = foodVendorSchema;
export const FoodMenuItemCandidateSchema = foodMenuItemSchema;
export const FoodSelectionSchema = foodSelectionSchema;
