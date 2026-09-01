# LocalLens editorial asset provenance

This document records the source, intent, and reproducible processing contract for the Task 1 editorial images and the Task 8 photo replacements. The selected UI reference is kept separately at [`docs/design/references/localens-editorial-home-selected.png`](./references/localens-editorial-home-selected.png); it is used only as a visual reference and never as a crop source.

## Toolchain and rules

- Scratch generation: OpenAI image generation (Media Service API, image version `2.0.0`). Original mark sources and the earlier photo sources were generated on 2026-08-30; the Task 8 replacement photos were generated on 2026-08-31. The replacement PNGs are kept only under the ignored `.superpowers/sdd/2026-08-31-localens-design-assets-qa-fix/source-assets/` directory.
- Processing: `sharp@0.35.4`, with libvips `8.18.6`, on Node `v24.14.1`. The package is pinned in `package.json` and `pnpm-lock.yaml` with the lockfile integrity declared by the design spec.
- Photo command: `node scripts/process-editorial-assets.mjs photo <source.png> <output.webp> --width <px> --height <px>`; `fit: cover`, `position: attention`, WebP `quality: 82`, `effort: 6`, and no metadata-preserving operation.
- Mark command: `node scripts/process-editorial-assets.mjs mark <white-source.png> <output.webp> --color '<#RRGGBB>'`; `fit: contain` to `256 x 256`, inverse luminance to alpha, requested color applied to RGB, and lossless WebP output.
- Verification command: `node scripts/process-editorial-assets.mjs check` (the no-argument command resolves the six allowlisted outputs and avoids shell wildcard expansion). It verifies WebP decoding, exact dimensions, alpha bounds for marks, and the `900 KiB`/`500 KiB`/`80 KiB` limits.
- Comparison command: `node scripts/process-editorial-assets.mjs compare <same-size-left> <same-size-right> <comparison.png>`; it rejects mismatched dimensions and writes a lossless side-by-side PNG.

## Scratch sources and prompts

The generated source IDs below identify the original ImageGen outputs. The `*-source-flat.png` files are normalized copies used as mark inputs: they flatten the generated transparent canvas onto pure white and remove the source alpha channel, leaving the black one-color artwork with antialiased edges required by the processor.

### Hero artisan scene

- Generated replacement source: `.superpowers/sdd/2026-08-31-localens-design-assets-qa-fix/source-assets/saigon-artisan-hero-source.png` (1448 x 1086, RGB, SHA-256 `1B2824D5101323B98EF9FF2581704C44E86965A8817DE5E7C518428A86D4DE0C`), ImageGen output `01a054d2-14b0-7d62-ae8a-3c1bf4263bec/exec-ccb85257-c594-48d5-a19c-866d8b8dd7a7.png`.
- Prompt: “Use case: photorealistic-natural; Asset type: LocalLens editorial homepage hero source image; Input images: Image 1: full-page visual reference; use only for the warm editorial art direction and the hero photograph's composition, never reproduce the UI, text, buttons, borders, or screenshot framing; Primary request: Create an original documentary travel photograph closely matching the reference hero image: an elderly Vietnamese woman in Saigon quietly weaving a natural rattan or bamboo craft by hand at a traditional artisan workshop. She is the clear focal subject, shown in a natural three-quarter side profile, with weathered facial detail and hands actively working the fibers; her patterned dark indigo blouse and simple dark apron feel authentic and unstyled; Scene/backdrop: intimate Vietnamese craft workshop with woven baskets, handmade fibers, and softly textured wood or plaster in the background; keep the scene believable and uncluttered; Style/medium: photorealistic documentary editorial travel photography, candid and human, not an illustration, not a studio portrait; Composition/framing: horizontal 4:3 composition suitable for a 1600 x 1200 website hero; subject and weaving action occupy the right two-thirds like the reference; calmer softly lit workshop texture toward the left and center, with safe uncluttered edges; medium shot that preserves both face and hands; Lighting/mood: warm natural late-afternoon light filtering into the workshop, calm intimate reflective mood, gentle shadow detail, subtle film grain; Color palette: warm muted ivory, honey, aged wood, charcoal indigo, and restrained vermilion accents; softly desaturated editorial grade matching the reference; Materials/textures: visible natural fiber strands, worn textile, aged workshop surfaces, realistic skin texture and wrinkles, no glossy commercial retouching; Constraints: create a new original image; preserve the 4:3 horizontal framing; no UI, no screenshot, no text, no captions, no signs, no logos, no trademarks, no watermark; no extra people; no male subject; no pottery or ceramic vessel as the main activity; no surreal details.”
- Intended focal crop: horizontal documentary crop with the elderly woman and active rattan weaving toward the right two-thirds; workshop fibers and a softly lit, text-safe edge remain toward the left.
- Exact processing command:

  `node scripts/process-editorial-assets.mjs photo .superpowers/sdd/2026-08-31-localens-design-assets-qa-fix/source-assets/saigon-artisan-hero-source.png public/images/editorial/saigon-artisan-hero.webp --width 1600 --height 1200`

- Production status: Task 8 replacement regenerated from the generator-native source directly; visual inspection confirmed the elderly woman/weaving subject and right-weighted composition against the selected reference; no crop or screenshot fragment, ad-hoc Sharp upscale, or intermediate source was used.
- Output: `1600 x 1200`, `169,626` bytes, SHA-256 `C2BA7060BC813763C4CD8A2C13301A15BEF6732526BB775B0CB96BAD397CEADE`.
- Alt text: meaningful image, localized concise copy — EN “Elderly artisan weaving a rattan basket in Saigon”; VI “Nghệ nhân lớn tuổi đan giỏ mây ở Sài Gòn”.

### Architecture inset

- Generated replacement source: `.superpowers/sdd/2026-08-31-localens-design-assets-qa-fix/source-assets/saigon-post-office-inset-source.png` (1086 x 1448, RGB, SHA-256 `07C3452996423CBFA90BDB6BEB8CDDA230D8455CB417972803B28255F7AC059D`), ImageGen output `01a054d2-14b0-7d62-ae8a-3c1bf4263bec/exec-0fd28eef-b460-4ab2-92ba-5769a14c3f6c.png`.
- Prompt: “Use case: photorealistic-natural; Asset type: LocalLens editorial homepage architectural inset source image; Input images: Image 1: full-page visual reference; use only for the warm editorial art direction and the inset's landmark subject, never reproduce the UI, text, buttons, borders, or screenshot framing; Primary request: Create an original documentary travel photograph of Saigon Central Post Office as a tight vertical architectural detail: a single ornate colonial arch and the round clock nested inside it, with aged yellow ochre facade, carved white ornament, and dark green metal grille. The arch and clock must be immediately recognizable and fill most of the frame; Scene/backdrop: close architectural surface of the landmark facade, minimal surrounding context; no broad exterior, no long perspective view, no street scene; Style/medium: photorealistic documentary editorial travel photography, crisp but natural, culturally specific and calm, not an illustration; Composition/framing: vertical 3:4 composition suitable for a 720 x 960 website inset; tight crop from slightly below eye level, centered on the arch and clock, facade edges close to the frame, enough margin to read the arch shape; architectural detail only; Lighting/mood: warm quiet late-afternoon daylight, soft directional shadows that reveal relief carving, restrained editorial contrast; Color palette: warm muted ochre yellow, cream stone, charcoal green, soft gray clock face, restrained vermilion warmth matching the reference; Materials/textures: realistic aged plaster, carved ornament, weathered paint, patinated metal grille, fine masonry detail; Constraints: create a new original image; preserve the tight vertical architectural detail framing; no UI, no screenshot, no readable words, no signs, no logos, no trademarks, no watermark; no broad exterior, no full building, no trees, no sky, no street, no close-up people, no extra landmarks.”
- Intended focal crop: tight vertical architectural detail; the single ornate arch and clock fill the frame while aged yellow facade, carved relief, and dark grille remain legible as a supporting landmark inset.
- Exact processing command:

  `node scripts/process-editorial-assets.mjs photo .superpowers/sdd/2026-08-31-localens-design-assets-qa-fix/source-assets/saigon-post-office-inset-source.png public/images/editorial/saigon-post-office-inset.webp --width 720 --height 960`

- Production status: Task 8 replacement regenerated from the generator-native source directly; visual inspection confirmed the tight arch/clock detail and no broad exterior against the selected reference; no crop or screenshot fragment, ad-hoc Sharp upscale, or intermediate source was used.
- Output: `720 x 960`, `103,718` bytes, SHA-256 `1C4B3513BE0D2C7B7B7311D2D3B90EE8B8A095474C18DF287816587919553ED8`.
- Alt text: meaningful image, localized concise copy — EN “Arched facade of Saigon Central Post Office”; VI “Mặt tiền mái vòm Bưu điện Trung tâm Sài Gòn”.

### Street-food mark

- Generated source: `source-assets/category-street-food-source.png` (1254 x 1254 RGBA), ImageGen output `01a05119-259a-7901-96b2-97a92faec860/exec-4525d3b7-1995-4dbb-9547-62399bf78652.png`.
- White-source normalization: `node --input-type=module -e "import sharp from 'sharp'; await sharp('.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-street-food-source.png').flatten({background:'#ffffff'}).removeAlpha().png().toFile('.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-street-food-source-flat.png')"`.
- Prompt: “Create an original flat editorial illustration scratch source for a Vietnamese city travel guide: a simple hand-inked black one-color emblem of a steaming street-food bowl with chopsticks, centered, pure white background, clean bold lines with natural antialiased edges, no gray shading, no text, no border, no color, no logo, exactly square composition. This PNG is intended for later luminance-to-alpha conversion.”
- Intended focal crop: centered bowl, steam, and chopsticks with breathing room on every edge.
- Exact processing command: `node scripts/process-editorial-assets.mjs mark .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-street-food-source-flat.png public/images/editorial/category-street-food.webp --color '#791312'`.
- Output: `256 x 256`, `24,322` bytes, SHA-256 `889D6DA15BE5B3E795553B47725FF6D1A3FF84CDB17C6510451D120B12A8F907`; alpha contains both transparent and opaque pixels.
- Alt text: decorative category mark, empty alt text (`alt=""`).

### History mark

- Generated source: `source-assets/category-history-source.png` (1254 x 1254 RGBA), ImageGen output `01a05119-259a-7901-96b2-97a92faec860/exec-662d3e50-d598-47f5-bed4-923c4e68ebfc.png`.
- White-source normalization: `node --input-type=module -e "import sharp from 'sharp'; await sharp('.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-history-source.png').flatten({background:'#ffffff'}).removeAlpha().png().toFile('.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-history-source-flat.png')"`.
- Prompt: “Create an original flat editorial illustration scratch source for a Vietnamese city travel guide: a simple hand-inked black one-color emblem of an old colonial clock tower and arched doorway representing history, centered, pure white background, clean bold lines with natural antialiased edges, no gray shading, no text, no border, no color, no logo, exactly square composition. This PNG is intended for later luminance-to-alpha conversion.”
- Intended focal crop: centered clock tower and arched doorway with an even square margin.
- Exact processing command: `node scripts/process-editorial-assets.mjs mark .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-history-source-flat.png public/images/editorial/category-history.webp --color '#17345F'`.
- Output: `256 x 256`, `25,470` bytes, SHA-256 `CF721BF6CC39E5F3F2BE844D07EED73669CEC5F8B586BDA92F808A405B36A510`; alpha contains both transparent and opaque pixels.
- Alt text: decorative category mark, empty alt text (`alt=""`).

### Craft-village mark

- Generated source: `source-assets/category-craft-source.png` (1254 x 1254 RGBA), ImageGen output `01a05119-259a-7901-96b2-97a92faec860/exec-e791f6c9-4a7e-4984-99b8-f8b213567bd8.png`.
- White-source normalization: `node --input-type=module -e "import sharp from 'sharp'; await sharp('.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-craft-source.png').flatten({background:'#ffffff'}).removeAlpha().png().toFile('.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-craft-source-flat.png')"`.
- Prompt: “Create an original flat editorial illustration scratch source for a Vietnamese city travel guide: a simple hand-inked black one-color emblem of a traditional woven bamboo basket and textile pattern representing craft villages, centered, pure white background, clean bold lines with natural antialiased edges, no gray shading, no text, no border, no color, no logo, exactly square composition. This PNG is intended for later luminance-to-alpha conversion.”
- Intended focal crop: centered woven basket and textile detail with a balanced square margin.
- Exact processing command: `node scripts/process-editorial-assets.mjs mark .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-craft-source-flat.png public/images/editorial/category-craft.webp --color '#B56E00'`.
- Output: `256 x 256`, `35,930` bytes, SHA-256 `7B426EDA8E5455B798F820B56A57B46448C6927B541EE594086458794EC9B39B`; alpha contains both transparent and opaque pixels.
- Alt text: decorative category mark, empty alt text (`alt=""`).

### Traditional-market mark

- Generated source: `source-assets/category-market-source.png` (1254 x 1254 RGBA), ImageGen output `01a05119-259a-7901-96b2-97a92faec860/exec-f4cb95a2-f748-4bfa-936a-a3294ec83a3d.png`.
- White-source normalization: `node --input-type=module -e "import sharp from 'sharp'; await sharp('.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-market-source.png').flatten({background:'#ffffff'}).removeAlpha().png().toFile('.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-market-source-flat.png')"`.
- Prompt: “Create an original flat editorial illustration scratch source for a Vietnamese city travel guide: a simple hand-inked black one-color emblem of a traditional market awning with a woven shopping basket and small hanging scales, centered, pure white background, clean bold lines with natural antialiased edges, no gray shading, no text, no border, no color, no logo, exactly square composition. This PNG is intended for later luminance-to-alpha conversion.”
- Intended focal crop: centered market awning, basket, and hanging scales with a balanced square margin.
- Exact processing command: `node scripts/process-editorial-assets.mjs mark .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/category-market-source-flat.png public/images/editorial/category-market.webp --color '#17345F'`.
- Output: `256 x 256`, `29,474` bytes, SHA-256 `0033C4022046BCA16DFADCD4B956211B7A7E4972A4B35F8E16658F89D59AA7EC`; alpha contains both transparent and opaque pixels.
- Alt text: decorative category mark, empty alt text (`alt=""`).

No production image was downloaded from the web or cropped from a selected UI reference. Generated and normalized PNG intermediates remain outside the production asset paths; the application consumes final WebP assets only.

## Green-home route map overlay

- Generated source: `C:\Users\Admin\.codex\generated_images\01a024a9-db76-7981-82da-d2abc4e6f409\exec-c72b2085-5756-4c76-b8ab-ac0be04ca19e.png` (built-in ImageGen), `1563 x 1006`, SHA-256 `1A7599F2B8E94B35A608EA9B1D20EBE980E542C4DD01F5E9D7938A80026DD7A5`. Input 1 was the existing `public/images/green/saigon-map.webp` edit target; input 2 was the locked `docs/design/references/localens-green-home-selected.png` art-direction reference.
- Prompt: “Use case: precise-object-edit; Asset type: LocalLens homepage map background; Preserve Image 1's map, river, roads, pale watercolor texture, landmarks, crop, and composition. Add only one clean dark forest-green itinerary route line across central District 1, with exactly three small circular waypoint nodes matching the route style visible in Image 2. The route begins around upper-central/right, bends downward through the center, and ends near lower-central; keep the right river and all landmarks visible. Use a restrained hand-drawn map overlay, smooth solid line with a short dashed final segment, dark forest green `#093d32`. Change only the route overlay; no labels, text, numbers, arrows, pins, cards, icons, UI chrome, watermark, new buildings, or altered visual density.”
- Exact processing command: `node -e "const sharp=require('sharp'); sharp('C:\\Users\\Admin\\.codex\\generated_images\\01a024a9-db76-7981-82da-d2abc4e6f409\\exec-c72b2085-5756-4c76-b8ab-ac0be04ca19e.png').resize(1200,740,{fit:'cover',position:'centre'}).webp({quality:88}).toFile('public/images/green/saigon-map-route.webp')"`.
- Output: `public/images/green/saigon-map-route.webp`, `1200 x 740`, `110,498` bytes, SHA-256 `C1E0EE7ECF4E78D92A52FB8A48F6C94D4EBF73504ABCF5BDB245513256569E7F`.
- Production status: visually inspected after processing; the map remains text-free and the route overlay is baked into the bitmap rather than approximated with CSS/SVG art. Final same-viewport page QA remains blocked until the authorized Playwright capture.
