# LocalLens Food Vendor and Meal Pricing Design

## Decision summary

LocalLens must not represent a food-market experience with one generic
`priceVndPerPerson` value. A market, a vendor/stall, and a menu item are
different entities with different hours, evidence, dietary properties and
prices. Market admission remains a separate zero-cost component when there is
no entrance fee; the itinerary adds one or more verified vendor/menu stops and
calculates their estimated food cost from the selected quantity.

The default MVP payment rule is `pay_at_vendor`: LocalLens displays and
validates the food estimate against the customer's budget, but Stripe Mock
charges only LocalLens's tour/guide/transport amount. The customer pays the
vendor directly. An `included_in_quote` mode is reserved for a later admin
workflow and is disabled until LocalLens can actually collect and reconcile
vendor money.

## Problem and goals

The current catalog stores one scalar `priceVndPerPerson` on a place and the
engine exposes it as `placeCostVnd`. This is suitable for a museum admission
or a company planning fee, but it cannot answer the questions required for a
food tour:

- Which exact stall or shop will the guest visit?
- Which dish or drink is recommended?
- How many portions are planned for the group?
- What is the price per serving and the estimated range for the group?
- Does the item match vegetarian, halal, allergy and mobility requirements?
- Is the selected vendor open at the scheduled time?
- Is the food paid at the stall or included in a LocalLens quote?

This design adds a versioned, evidence-backed food layer so that AI can
recommend concrete food stops without inventing vendors or prices. It keeps
the existing fixed-tour and non-food itinerary behavior intact by assigning
zero food cost to places without a food selection.

## Scope

Included:

- Market/venue records with their own admission and opening hours.
- Vendor/stall records linked to one market or food street.
- Menu-item records with exact prices or a bounded VND price range.
- Vendor and menu opening hours, dietary/allergen evidence and bilingual copy.
- Food selections in itinerary revisions and cost breakdowns.
- Budget and opening-hour validation using the selected vendor/menu records.
- Immutable catalog and itinerary snapshots so later price edits do not alter
  an existing plan, quote or booking.
- Customer UI that names the vendor, item, quantity, estimated food cost and
  who receives payment.

Out of scope for this MVP:

- Online vendor ordering, delivery, inventory, table reservations or vendor
  payouts.
- Real collection of vendor food money by Stripe.
- Automatic confirmation that a vendor will reserve a dish or table.
- User reviews or ratings as a source of sellability.
- AI web search for new vendors outside the approved LocalLens catalog.

## Domain model

### Market or food venue

The existing `places` record remains the public venue: for example, Chợ Bình
Tây or Hẻm 200 Xóm Chiếu. Its `priceVndPerPerson` continues to mean the
venue-level admission/company planning component only. For a market with free
entry it is `0`; it must not be overloaded with a guessed meal price.

The venue keeps its own address, opening hours, accessibility evidence and
status. `research_only` venues cannot be used as sellable food stops.

### Food vendor or stall

Each vendor is a child of exactly one venue. A vendor is the concrete place a
guest can visit, such as a named stall, shop, counter or food-court unit.
Required facts:

- stable slug and parent `place_id`;
- Vietnamese and English name, with English allowed to be an explicit
  transliteration or “English information not confirmed” label;
- location note such as gate, floor, aisle or nearby landmark;
- operating windows and date exceptions;
- service type (`stall`, `shop`, `food_court`, or `street_vendor`);
- supported dietary tags and allergen warnings, each with `supported`,
  `unsupported` or `unknown` status;
- seating and group-capacity note when relevant;
- source URL, verification date, attribution and `research_only`/`sellable`
  evidence status.

No vendor is returned to the AI or customer as a concrete recommendation until
its identity, current hours, menu evidence and access limitations have been
reviewed by an authorized human.

### Menu item

Each menu item belongs to one vendor. Required facts:

- bilingual item name and short description;
- `servingUnit` (`portion`, `bowl`, `piece`, `drink`, or `shared_set`);
- `priceVndMin` and `priceVndMax` as integer VND, where exact prices use the
  same value for both fields;
- portion quantity represented by one unit;
- dietary tags and allergen/cross-contact warnings;
- whether the item is currently available;
- source URL, verification date and evidence status.

An item with an unknown price, unknown mandatory dietary property or stale
availability remains research-only. The system never turns an unknown price
into zero.

### Food selection in an itinerary

An itinerary item may optionally contain a food selection:

```text
foodSelection = {
  vendorId,
  menuItemId,
  quantity,
  priceVndMin,
  priceVndMax,
  paymentMode: "pay_at_vendor",
  activity: "taste and discuss the selected dish"
}
```

`quantity` is a non-negative whole number of serving units for the whole group.
Shared dishes use a `shared_set` item rather than fractional quantities. The
selection stores the price range from the catalog snapshot; it does not read a
new live price after the itinerary is generated.

## Source-manifest shape

The canonical JSON source can keep the venue data readable for the manual
review workflow by adding a `foodVendors` array to a market/food-street place.
The shape is normalized when seeded into PostgreSQL:

```json
{
  "slug": "example-market",
  "foodVendors": [
    {
      "slug": "example-stall",
      "status": "research_only",
      "title": { "vi": "Tên quán/sạp", "en": "English name or unknown" },
      "locationNote": "Gate or aisle note",
      "serviceType": "stall",
      "hours": [{ "days": "Monday-Sunday", "opens": "16:00", "closes": "23:00" }],
      "support": {
        "vegetarian": "unknown",
        "halal": "unknown",
        "allergens": "unknown"
      },
      "menuItems": [
        {
          "slug": "example-dish",
          "title": { "vi": "Tên món", "en": "English name" },
          "servingUnit": "portion",
          "priceVndMin": 40000,
          "priceVndMax": 50000,
          "availability": "research_only",
          "dietary": { "vegetarian": "unsupported", "halal": "unknown" },
          "allergens": ["peanut"]
        }
      ],
      "sourceUrl": "https://example.invalid/review-source",
      "verifiedAt": "2026-08-28"
    }
  ]
}
```

The example is a shape only; it is not a real vendor or price and must not be
seeded as sellable data.

## PostgreSQL and snapshot design

The existing catalog migration (`20260823092000_catalog_snapshots.sql`) needs
new normalized tables. The base tables are writable only through the existing
catalog RPC owner; API roles read the published snapshot projection.

Base tables:

- `food_vendors(place_id, id, slug, status, service_type, location_note,
  source_url, verified_at, attribution, ...)`;
- `food_vendor_translations(food_vendor_id, locale, title, description)`;
- `food_vendor_supports(food_vendor_id, support_kind, requirement, status)`;
- `food_vendor_opening_hours(food_vendor_id, weekday, opens_at, closes_at)`;
- `food_vendor_opening_exceptions(...)` and its exception-window child;
- `food_items(food_vendor_id, id, slug, status, serving_unit,
  price_vnd_min, price_vnd_max, available, source_url, verified_at,
  attribution, ...)`;
- `food_item_translations(food_item_id, locale, title, description)`;
- `food_item_supports(food_item_id, support_kind, requirement, status)`.

Published catalog snapshots copy the exact vendor and item rows into matching
`catalog_snapshot_food_*` tables, including translations, supports and opening
windows. Snapshot rows carry both `catalog_snapshot_id` and the parent IDs so
foreign keys prevent a food selection from referencing a vendor or item outside
the catalog used to generate the plan. The public projection exposes only
published snapshot rows and decimal-safe string money values, following the
existing `catalog_snapshot_places_v` pattern.

The snapshot creator locks base venue and food tables in a fixed order before
copying them. A change to any vendor/menu fact creates a new catalog snapshot;
it never mutates an existing snapshot.

## Cost model and formulas

Every itinerary item exposes a breakdown:

- `admissionCostVnd`: the existing venue/place cost;
- `foodCostMinVnd` and `foodCostMaxVnd`: sum of selected item price bounds
  multiplied by group quantity;
- `travelCostVnd`: the existing directed travel amount;
- `guideCostVnd`: LocalLens guide component, zero for a self-guided draft;
- `payAtVendorVnd`: equal to the food estimate when payment mode is
  `pay_at_vendor`;
- `customerPayableVnd`: only components LocalLens actually collects through
  the current checkout flow.

For a selection, the authoritative formulas are:

```text
foodCostMinVnd = sum(priceVndMin * quantity)
foodCostMaxVnd = sum(priceVndMax * quantity)
groupCostMinVnd = admission + foodMin + travel + guide
groupCostMaxVnd = admission + foodMax + travel + guide
```

All arithmetic is integer VND. The hard budget check uses `groupCostMaxVnd`,
so a plan can never exceed the customer's stated budget merely because a vendor
charges the upper end of a documented range. The UI displays the range when
prices are ranged and explains that the final amount is paid at the stall.

For a venue with no selected food item, food cost is `0` and the UI says
“Food not selected” rather than implying that a meal is included. A market
with no sellable vendor/menu records cannot satisfy a request that requires a
street-food stop.

## AI and deterministic itinerary flow

1. The backend validates the customer request and filters venues, vendors and
   menu items using hard constraints: area, date, opening interval, status,
   language, mobility and dietary requirements.
2. Only allowlisted IDs for the filtered vendor/menu records are sent to the AI
   ranker. No raw PII, free-form dietary text or unapproved vendor is sent.
3. The deterministic scheduler places the venue and its selected food stop in
   chronological order. Vendor hours, not only market hours, must contain the
   food activity interval.
4. The deterministic cost calculator applies the upper price bound, group
   quantity and travel costs. The authoritative validator rejects an itinerary
   that exceeds time, opening-hour, dietary or budget constraints.
5. A generated revision returns each food stop with vendor name, item name,
   quantity, price range, payment mode and activity text. If no feasible
   verified food choice exists, the response explains why and never invents a
   recommendation.
6. Refinement may replace or remove an unlocked vendor/menu selection. Locked
   selections keep their vendor and item IDs and snapshot prices; a stale base
   revision still returns `STALE_REVISION`.

The AI remains a recommender. It cannot approve a vendor, change a price,
confirm availability, collect money or book a table.

## Quote, booking and payment behavior

The personalized quote snapshots the chosen vendor/item IDs, names, price
ranges, quantity, payment mode and evidence dates. The quote displays two
totals:

- **LocalLens payable**: the amount eligible for Stripe Mock checkout;
- **Pay directly at vendors**: the estimated food amount range.

The checkout request and webhook validate only the LocalLens payable amount and
currency. Food marked `pay_at_vendor` is never included in the Stripe amount.
If an administrator later enables `included_in_quote`, the quote must include
an exact menu price (not an open range), a collection policy and an explicit
inclusion line before checkout is allowed. This mode is not enabled in the
current MVP.

## Customer and admin UI behavior

Customer itinerary cards for food stops show:

- market name and exact vendor/stall name;
- location note and scheduled time;
- selected dish/drink, serving unit and group quantity;
- price per unit and estimated group range;
- dietary/allergen caveat and accessibility warning when unknown;
- “Pay at vendor” or “Included in LocalLens payment” label.

The total panel separates venue admission, food estimate, transport, guide
fee and LocalLens payable amount. A “food not selected” state is explicit.

Admin catalog screens provide a review queue for vendors and menu items. An
admin must verify identity/source, hours, price, menu availability, dietary and
access evidence before changing a record from `research_only` to `sellable`.
The existing human-approval rule remains unchanged: user-submitted facts are
evidence for review, not automatic publication.

## Error and fallback rules

- Unknown vendor/menu price: exclude from sellable recommendations and return a
  visible “food cost unavailable” warning.
- Unknown mandatory dietary or mobility support: never treat it as supported.
- Vendor closed at the proposed time: reject the food stop and rerun ranking or
  return `NO_FEASIBLE_ITINERARY`.
- Price range makes the upper bound exceed budget: reject the selection even if
  the lower bound fits.
- Vendor/menu changed after generation: existing plans remain valid against
  their snapshot; new plans use the newest published snapshot.
- AI timeout, quota exhaustion or malformed IDs: deterministic ranking uses
  the already-filtered vendor/menu IDs.

## Files and contracts affected by the future implementation plan

The implementation plan must cover these boundaries without mixing them into
the venue evidence workflow:

- `data/sources/hcmc-places.v1.json`: add reviewed `foodVendors` and
  `menuItems`; keep unknown facts explicit and recompute source hashes.
- `lib/domain/itinerary/contracts.ts`: add strict vendor/menu candidates,
  food selections, item cost breakdown and totals while preserving zero-food
  compatibility for museums and heritage stops.
- `lib/domain/itinerary/candidate-filter.ts`, `scheduler.ts`, `validator.ts`
  and `repair.ts`: filter, schedule, cost and refine concrete food selections.
- `lib/infrastructure/supabase/catalog-adapter.ts`: map snapshot vendor/menu
  projections with strict field allowlists and safe integer money parsing.
- `supabase/migrations/20260823092000_catalog_snapshots.sql` plus a new
  migration: create base/snapshot food tables, RLS, append-only guards,
  snapshot-copy logic and public projection views.
- Planner and preview components: render vendor/menu detail and separated
  totals; never label a generic market price as a meal.
- Quote/checkout adapters and tests: exclude `pay_at_vendor` food from Stripe
  amounts and retain the snapshot in quote/booking records.
- Unit and database tests: price-range arithmetic, quantity, dietary filtering,
  vendor opening hours, snapshot immutability, RLS, stale refinement and
  Stripe-amount separation.

## Acceptance criteria

- A market with free entry and one verified menu selection shows admission
  `0 VND`, a named vendor/item, quantity, food estimate and separate payment
  responsibility.
- The planner cannot return a market as a food stop without a concrete
  sellable vendor and menu item.
- A ranged price uses the upper bound for the hard budget check and displays
  the lower/upper estimate to the customer.
- A vendor closed at the proposed time is rejected even if the parent market is
  open.
- Vegetarian, halal, allergen and mobility requirements reject unknown support.
- Refinement can replace an unlocked food selection and preserves a locked one.
- Existing museum/heritage itineraries still calculate zero food cost without
  changing their admission behavior.
- Stripe Mock receives only LocalLens payable components; pay-at-vendor food is
  never charged or presented as paid.
- Published snapshot rows and accepted quotes preserve the exact vendor, menu,
  quantity, price range and evidence used at generation time.
- No user-supplied vendor or price becomes `sellable` without human approval.

## Task 12 implementation notes (verified 2026-08-31)

- The real-route Playwright suite verifies approved EN/VI vendor and menu names,
  whole-group quantity, unit and group price ranges, `pay_at_vendor` display,
  research-only fail-closed behavior, locked-food refinement, and zero-food
  museum admission.
- A strictly validated planner snapshot seam is available only when
  `NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES=1`; fixture catalog facts live only under
  `tests/e2e/`. The normal route ignores the session key when the flag is off,
  and malformed snapshots fail closed.
- Pay-at-vendor food contributes to the displayed group estimate but not
  `customerPayableVnd` or the Stripe Mock screen. The mock screen intentionally
  has no charge amount. External/static servers must be built and started with
  the fixture flag for this acceptance harness; normal production builds keep
  it off.
- PostgreSQL, RLS, locking, and concurrency runtime behavior remain unverified
  when the Supabase CLI/runtime gate is unavailable. In this checkout,
  `pnpm db:verify` reports `SUPABASE_CLI_NOT_FOUND`; static and unit evidence do
  not replace that gate.

