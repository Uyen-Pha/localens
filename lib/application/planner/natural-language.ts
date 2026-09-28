import type { PersonalizationPriorityKey } from "@/lib/i18n/dictionaries";

export type NaturalLanguageAreaOption = Readonly<{
  value: string;
  label: string;
}>;

export type NaturalLanguageBudgetBasis = "group" | "per_person";

export type NaturalLanguageDraft = Readonly<{
  startDate?: string;
  startTime?: string;
  durationMinutes?: number;
  partySize?: number;
  budgetAmount?: string;
  budgetCurrency?: "VND" | "USD";
  budgetBasis?: NaturalLanguageBudgetBasis;
  areas: readonly string[];
  guideLanguage?: "en" | "vi";
  priorityWeights: Readonly<Record<PersonalizationPriorityKey, 0 | 1 | 2 | 3 | 4 | 5>>;
  pace?: "relaxed" | "balanced" | "active";
  dietaryRequirements: readonly string[];
  mobilityRequirements: readonly string[];
}>;

export type NaturalLanguageField =
  | "startDate"
  | "startTime"
  | "duration"
  | "partySize"
  | "budget"
  | "budgetBasis";

export type NaturalLanguageParseResult = Readonly<{
  draft: NaturalLanguageDraft;
  missing: readonly NaturalLanguageField[];
  matched: readonly string[];
}>;

const DEFAULT_PRIORITY_WEIGHTS: Record<PersonalizationPriorityKey, 0 | 1 | 2 | 3 | 4 | 5> = {
  street_food: 0,
  history: 0,
  traditional_craft: 0,
  traditional_market: 0,
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function containsAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function parseDate(value: string): string | undefined {
  const numeric = value.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (numeric) {
    const [, day, month, year] = numeric;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    ) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  const iso = value.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, year, month, day] = iso;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    ) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  const monthNames: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const named = value.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/,
  );
  if (!named) return undefined;

  const [, monthName, day, year] = named;
  const month = monthNames[monthName];
  const date = new Date(Date.UTC(Number(year), month - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === month - 1 && date.getUTCDate() === Number(day)
    ? `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`
    : undefined;
}

function parseTime(value: string): string | undefined {
  const contextual = value.match(
    /(?:luc|at|vao luc|start(?:ing)?(?: at)?)\s*(\d{1,2})(?:[:h.](\d{2}))?\s*(sang|toi|am|pm)?/,
  );
  const colon = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const hourOnly = value.match(/\b([01]?\d|2[0-3])\s*(?:gio|h)\b/);
  const match = contextual ?? colon ?? hourOnly;
  if (!match) return undefined;

  const hour = Number(match[1]);
  const minute = contextual ? Number(match[2] ?? 0) : Number(match[2] ?? 0);
  const period = contextual?.[3];
  const normalizedHour = period === "pm" || period === "toi"
    ? hour < 12 ? hour + 12 : hour
    : period === "am" || period === "sang"
      ? hour === 12 ? 0 : hour
      : hour;
  if (normalizedHour > 23 || minute > 59) return undefined;
  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDuration(value: string): number | undefined {
  const matches = [...value.matchAll(/(\d+(?:[.,]\d+)?)\s*(gio|hours?|hrs?|h)\b/g)];
  const contextual = value.match(
    /(?:trong khoang|khoang|thoi luong|duration|for|about)\s*(\d+(?:[.,]\d+)?)\s*(?:gio|hours?|hrs?|h)\b/,
  );
  const raw = contextual?.[1] ?? matches.at(-1)?.[1];
  if (!raw) return undefined;
  const hours = Number(raw.replace(",", "."));
  if (!Number.isFinite(hours)) return undefined;
  const minutes = Math.round(hours * 60);
  return minutes >= 60 && minutes <= 720 ? minutes : undefined;
}

function parsePartySize(value: string): number | undefined {
  const match = value.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:nguoi|khach|people|guests?|travelers?|travellers?)\b/)
    ?? value.match(/\bgroup\s+of\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (!match) return undefined;
  const parsedNumber = Number(match[1]);
  const partySize = parsedNumber || {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  }[match[1]];
  if (partySize === undefined) return undefined;
  return partySize >= 1 && partySize <= 20 ? partySize : undefined;
}

function parseNumeric(raw: string): number | undefined {
  const compact = raw.replace(/\s/g, "");
  if (compact.includes(".") && compact.includes(",")) {
    return Number(compact.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) {
    return Number(compact.replace(/[.,]/g, ""));
  }
  return Number(compact.replace(",", "."));
}

function parseBudget(value: string): {
  amount?: string;
  currency?: "VND" | "USD";
  basis?: NaturalLanguageBudgetBasis;
} {
  const match = value.match(
    /(?:ngan sach|budget|chi phi)[^.;\n]*?(\d[\d.,]*)\s*(ty|billion|trieu|million|m|vnd|usd|\$|dong|d)?/,
  ) ?? value.match(/\b(\d[\d.,]*)\s*(ty|billion|trieu|million|m|vnd|usd|\$|dong|d)\b/);
  if (!match) return {};

  const raw = match[1];
  const unit = match[2] ?? "";
  let amount = parseNumeric(raw);
  if (amount === undefined || !Number.isFinite(amount) || amount <= 0) return {};

  if (unit === "ty" || unit === "billion") amount *= 1_000_000_000;
  if (unit === "trieu" || unit === "million" || unit === "m") amount *= 1_000_000;

  const currency: "VND" | "USD" = unit === "usd" || unit === "$" ? "USD" : "VND";
  const basis = containsAny(value, ["moi nguoi", "per person", "per guest", "/nguoi"])
    ? "per_person"
    : containsAny(value, ["tong", "total", "ca nhom", "whole group", "whole", "entire group", "group budget", "for the group"])
      ? "group"
      : undefined;

  return {
    amount: currency === "USD" ? String(Math.round(amount * 100) / 100) : String(Math.round(amount)),
    currency,
    basis,
  };
}

function parseAreas(value: string, options: readonly NaturalLanguageAreaOption[]): string[] {
  const groups = [
    ["cho lon", "binh tay", "quan 5", "district 5", "chinatown"],
    ["quan 1", "district 1", "central", "trung tam", "ben nghe", "saigon center"],
    ["quan 3", "district 3", "tan dinh", "ban co", "museum district"],
    ["thu duc", "thu duc"],
    ["tan binh", "bay hien"],
    ["cu chi"],
  ];
  const matchingGroups = groups.filter((group) => containsAny(value, group));
  const matched = options.filter((option) => {
    const optionText = normalize(`${option.value} ${option.label}`);
    return matchingGroups.some((group) => group.some((term) => optionText.includes(term)));
  });
  if (matched.length > 0) return matched.map((option) => option.value);

  // The product is scoped to Ho Chi Minh City. When the customer gives no
  // narrower area, let the catalog choose among all available city areas.
  return options.map((option) => option.value);
}

function parsePriorities(value: string): Record<PersonalizationPriorityKey, 0 | 1 | 2 | 3 | 4 | 5> {
  const priorities = { ...DEFAULT_PRIORITY_WEIGHTS };
  if (containsAny(value, ["am thuc", "an uong", "food", "street food", "foodie"])) priorities.street_food = 4;
  if (containsAny(value, ["lich su", "van hoa", "history", "culture", "museum"])) priorities.history = 4;
  if (containsAny(value, ["lang nghe", "thu cong", "craft", "makers"])) priorities.traditional_craft = 4;
  if (containsAny(value, ["cho truyen thong", "cho", "market", "neighborhood"])) priorities.traditional_market = 4;
  if (Object.values(priorities).every((weight) => weight === 0)) priorities.street_food = 3;
  return priorities;
}

function missingFields(draft: NaturalLanguageDraft): NaturalLanguageField[] {
  const missing: NaturalLanguageField[] = [];
  if (!draft.startDate) missing.push("startDate");
  if (!draft.startTime) missing.push("startTime");
  if (draft.durationMinutes === undefined) missing.push("duration");
  if (draft.partySize === undefined) missing.push("partySize");
  if (!draft.budgetAmount || !draft.budgetCurrency) missing.push("budget");
  if (draft.budgetAmount && !draft.budgetBasis) missing.push("budgetBasis");
  return missing;
}

export function parseNaturalLanguage(
  description: string,
  areaOptions: readonly NaturalLanguageAreaOption[],
): NaturalLanguageParseResult {
  const value = normalize(description);
  const date = parseDate(value);
  const time = parseTime(value);
  const durationMinutes = parseDuration(value);
  const partySize = parsePartySize(value);
  const budget = parseBudget(value);
  const areas = parseAreas(value, areaOptions);
  const guideLanguage = containsAny(value, ["tieng anh", "english", "english-speaking", "anglophone"])
    ? "en"
    : containsAny(value, ["tieng viet", "vietnamese"])
      ? "vi"
      : undefined;
  const dietaryRequirements = containsAny(value, ["an chay", "vegetarian", "vegan"]) ? ["vegetarian"] : containsAny(value, ["halal"]) ? ["halal"] : [];
  const mobilityRequirements = containsAny(value, ["step-free", "step free"])
    ? ["step-free"]
    : [];
  const pace = containsAny(value, ["it di bo", "less walking", "thu tha", "relaxed", "slow pace"])
    ? "relaxed"
    : containsAny(value, ["nang dong", "active", "full day"])
      ? "active"
      : "balanced";

  const draft: NaturalLanguageDraft = {
    startDate: date,
    startTime: time,
    durationMinutes,
    partySize,
    budgetAmount: budget.amount,
    budgetCurrency: budget.currency,
    budgetBasis: budget.basis,
    areas,
    guideLanguage,
    priorityWeights: parsePriorities(value),
    pace,
    dietaryRequirements,
    mobilityRequirements,
  };

  const matched: string[] = [];
  if (date) matched.push(`date:${date}`);
  if (time) matched.push(`time:${time}`);
  if (durationMinutes) matched.push(`duration:${durationMinutes}`);
  if (partySize) matched.push(`party:${partySize}`);
  if (budget.amount) matched.push(`budget:${budget.amount}`);
  if (guideLanguage) matched.push(`language:${guideLanguage}`);
  if (draft.priorityWeights.street_food > 0) matched.push("interest:street_food");
  if (draft.priorityWeights.history > 0) matched.push("interest:history");
  if (draft.priorityWeights.traditional_craft > 0) matched.push("interest:craft");
  if (draft.priorityWeights.traditional_market > 0) matched.push("interest:market");
  if (mobilityRequirements.length > 0) matched.push("mobility:low_walking");

  return { draft, missing: missingFields(draft), matched };
}
