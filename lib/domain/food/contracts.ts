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
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
