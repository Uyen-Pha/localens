// Illustrative artwork only: never represents a verified stop or vendor.
const tourImages: Record<string, { src: string; vi: string; en: string }> = {
  "ll-f04": {
    src: "/images/tours/ll-f04-binh-tay-market.png",
    vi: "Ảnh minh họa Chợ Bình Tây và ẩm thực địa phương", en: "Illustration of Binh Tay Market and local food",
  },
  "ll-f05": {
    src: "/images/tours/ll-f05-vot-coffee-tan-dinh.png",
    vi: "Ảnh minh họa cà phê vợt và Nhà thờ Tân Định", en: "Illustration of vot coffee and Tan Dinh Church",
  },
  "ll-f06": {
    src: "/images/tours/ll-f06-ben-dinh.png",
    vi: "Ảnh minh họa Địa đạo Bến Đình, Củ Chi", en: "Illustration of Ben Dinh Tunnels, Cu Chi",
  },
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

