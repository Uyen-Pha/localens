// Illustrative artwork only: never represents a verified stop or vendor.
const tourImages: Record<string, { src: string; vi: string; en: string }> = {
  "demo-craft-and-tasting-afternoon": {
    src: "/images/editorial/saigon-artisan-hero.webp",
    vi: "Minh họa nghệ nhân đan giỏ mây", en: "Illustration of an artisan weaving a rattan basket",
  },
  "demo-heritage-and-market-morning": {
    src: "/images/green/ben-thanh-market.webp",
    vi: "Chợ Bến Thành, ảnh minh họa văn hóa chợ Sài Gòn", en: "Ben Thanh Market, illustrating Saigon market culture",
  },
  "demo-waterways-and-evening-stories": {
    src: "/images/green/street-food.webp",
    vi: "Ẩm thực đường phố, ảnh minh họa nhịp sống Sài Gòn", en: "Street food, illustrating everyday life in Saigon",
  },
};
const defaultImage = {
  src: "/images/green/ben-thanh-market.webp",
  vi: "Chợ Bến Thành, ảnh minh họa Thành phố Hồ Chí Minh", en: "Ben Thanh Market, an illustrative view of Ho Chi Minh City",
};


export function tourIllustration(slug: string) {
  return tourImages[slug] ?? defaultImage;
}

