# LocalLens editorial asset provenance

This document records the source, intent, and reproducible processing contract for the Task 1 editorial images. The selected UI reference is kept separately at [`docs/design/references/localens-editorial-home-selected.png`](./references/localens-editorial-home-selected.png); it is never used as a crop source.

## Toolchain and rules

- Scratch generation: OpenAI image generation (Media Service API, image version `2.0.0`), generated on 2026-08-30. The generated PNGs are kept only under the ignored `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/` directory.
- Processing: `sharp@0.35.4`, with libvips `8.18.6`, on Node `v24.14.1`. The package is pinned in `package.json` and `pnpm-lock.yaml` with the lockfile integrity declared by the design spec.
- Photo command: `node scripts/process-editorial-assets.mjs photo <source.png> <output.webp> --width <px> --height <px>`; `fit: cover`, `position: attention`, WebP `quality: 82`, `effort: 6`, and no metadata-preserving operation.
- Mark command: `node scripts/process-editorial-assets.mjs mark <white-source.png> <output.webp> --color '<#RRGGBB>'`; `fit: contain` to `256 x 256`, inverse luminance to alpha, requested color applied to RGB, and lossless WebP output.
- Verification command: `node scripts/process-editorial-assets.mjs check` (the no-argument command resolves the six allowlisted outputs and avoids shell wildcard expansion). It verifies WebP decoding, exact dimensions, alpha bounds for marks, and the `900 KiB`/`500 KiB`/`80 KiB` limits.
- Comparison command: `node scripts/process-editorial-assets.mjs compare <same-size-left> <same-size-right> <comparison.png>`; it rejects mismatched dimensions and writes a lossless side-by-side PNG.

## Scratch sources and prompts

The generated source IDs below identify the original ImageGen outputs. The `*-source-flat.png` files are normalized copies used as mark inputs: they flatten the generated transparent canvas onto pure white and remove the source alpha channel, leaving the black one-color artwork with antialiased edges required by the processor.

### Hero artisan scene

- Original generated source: `source-assets/saigon-artisan-hero-source.png` (1448 x 1086), ImageGen output `01a05119-259a-7901-96b2-97a92faec860/exec-3f10b4b9-416f-4745-8da7-373264eb5573.png`.
- Native replacement attempt: `source-assets/saigon-artisan-hero-source-native-attempt.png` (1448 x 1086), ImageGen edit/upscale output `01a05119-259a-7901-96b2-97a92faec860/exec-1cf65e14-f7ad-44e1-8043-0af54b3cbd02.png`; it was inspected and rejected because both decoded dimensions do not meet the native `1600 x 1200` minimum. It was not used for production output.
- Prompt: “Create an original documentary editorial travel photograph for a Vietnamese city travel guide: a Saigon artisan at a quiet traditional craft workshop, warm ivory and vermilion atmosphere, natural afternoon light, calm local detail, horizontal 4:3 composition, artisan and key texture placed toward the right third, generous uncluttered safe edges for overlay text, no words, no logos, no watermark, no UI mockup. This is a scratch source image that will be saved and processed later.”
- Intended focal crop: horizontal documentary crop with the artisan and red lacquer vessel held toward the right third; the quiet wall and floor at left are intentionally text-safe.
- Production status: the prior Task 1 WebP remains unchanged in this fix round because ImageGen did not provide an accepted native source. Its earlier ad-hoc upscale intermediate is not an accepted source-size solution and is intentionally not documented as compliant provenance; replacing this output remains the I1 blocker.
- Prior output: `1600 x 1200`, `111,502` bytes, SHA-256 `7C7333849604BBA6D6406A660833125588EF4168D999A55CCDDC5D486A286A18`.
- Alt text: meaningful image, localized concise copy — EN “Artisan shaping a red lacquer vessel in Saigon”; VI “Nghệ nhân tạo hình bình sơn mài đỏ ở Sài Gòn”.

### Architecture inset

- Generated source: `source-assets/saigon-post-office-inset-source.png` (1086 x 1448), ImageGen output `01a05119-259a-7901-96b2-97a92faec860/exec-8737a612-6fc4-436c-b99e-910252ae5a60.png`.
- Prompt: “Create an original documentary editorial travel photograph for a Vietnamese city travel guide: a vertical architectural detail of Saigon Central Post Office, warm aged yellow facade, arched windows, quiet late-afternoon light, culturally specific and calm, vertical 3:4 composition, no people close-up, no words, no logos, no watermark, no UI mockup. This is a scratch source image that will be saved and processed later.”
- Intended focal crop: vertical architectural detail; the arched facade and aged yellow surface remain central so it reads as a supporting landmark inset.
- Exact processing command:

  `node scripts/process-editorial-assets.mjs photo .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/saigon-post-office-inset-source.png public/images/editorial/saigon-post-office-inset.webp --width 720 --height 960`

- Output: `720 x 960`, `137,254` bytes, SHA-256 `8508B2EFFB42E2CFAAD156DA39E030DDCD562A4124F1BBA07743BE8A5A0D2049`.
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

No production image was downloaded from the web or cropped from the selected UI reference. The only committed image inputs are the six final WebP files; all generated and normalized PNG intermediates remain ignored scratch sources.
