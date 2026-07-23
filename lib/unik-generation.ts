import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";

const RAILWAY_FALLBACK = "https://4regn-sms-production.up.railway.app/generate";
const GARMENTS = new Set(["tee", "hoodie"]);
const COLOURS = new Set(["black", "white"]);
const SUBJECTS = new Set(["artist", "personal"]);
const STYLES = new Set([
  "TOUR_POSTER", "BOOTLEG", "EDITORIAL", "CHROME", "GIANT_FACE", "BLING_ERA", "PAPER_CUT", "VTG_BOOTLEG",
  "TOON_DRIP", "CHROME_COLLAGE", "I_LOVE_MY",
]);

// Styles that require an exact photo count rather than the default 1-5
// range. GIANT_FACE and TOON_DRIP each build one portrait from a single
// reference; CHROME_COLLAGE and I_LOVE_MY are fixed five-photo collages
// with a specific slot for each photo.
const EXACT_PHOTO_COUNT: Record<string, number> = {
  GIANT_FACE: 1,
  TOON_DRIP: 1,
  CHROME_COLLAGE: 5,
  I_LOVE_MY: 5,
};

// These three styles are engineered around exact MULTIPLY/LIGHTEN garment
// compositing (the generated background must be pure #FFFFFF or #000000
// so it disappears under that blend mode) -- so their mockup should use
// "lighten" for black garments rather than the "screen" the original 8
// styles use. Left untouched for every other style to avoid changing how
// already-shipped mockups render.
const LIGHTEN_BLEND_STYLES = new Set(["TOON_DRIP", "CHROME_COLLAGE", "I_LOVE_MY"]);

// I_LOVE_MY's subject field ("girlfriend", "my best friend", "I love my dog")
// is cleaned the same way on the client before it's sent as `name`, but the
// server re-applies it since client input is never trusted as-is.
export function cleanSubjectLabel(raw: unknown): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^i\s+love\s+my\s+/i, "")
    .replace(/^my\s+/i, "")
    .trim();
}

export type UnikGenerationInput = {
  garment: "tee" | "hoodie";
  colour: "black" | "white";
  subject: "artist" | "personal";
  style: string;
  name: string;
  tagline: string;
  size: string;
  photos: string[];
};

function text(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

export function parseGenerationInput(body: unknown): UnikGenerationInput {
  if (!body || typeof body !== "object") throw new Error("Invalid generation request");
  const source = body as Record<string, unknown>;
  const garment = text(source.garment, 20).toLowerCase();
  const colour = text(source.colour, 20).toLowerCase();
  const subject = text(source.subject, 20).toLowerCase();
  const style = text(source.style, 40).toUpperCase();
  const name = text(source.name, 80);
  const tagline = text(source.tagline, 100);
  const size = text(source.size, 8).toUpperCase();
  const photos = Array.isArray(source.photos) ? source.photos.map((photo) => String(photo || "")) : [];

  if (!GARMENTS.has(garment) || !COLOURS.has(colour) || !SUBJECTS.has(subject) || !STYLES.has(style)) throw new Error("Choose valid design options");
  if (!name) throw new Error("Add a name for your design");
  if (!/^(XS|S|M|L|XL|XXL)$/.test(size)) throw new Error("Choose a valid garment size");
  const exactCount = EXACT_PHOTO_COUNT[style];
  if (!photos.length || photos.length > 5 || (exactCount !== undefined && photos.length !== exactCount)) {
    throw new Error(exactCount !== undefined ? `This style needs exactly ${exactCount} photo${exactCount === 1 ? "" : "s"}` : "Upload between one and five photos");
  }

  let total = 0;
  const cleaned = photos.map((photo) => {
    const raw = photo.includes(",") ? photo.slice(photo.indexOf(",") + 1) : photo;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) throw new Error("One of the uploaded photos is invalid");
    total += raw.length;
    return raw;
  });
  if (total > 4_200_000) throw new Error("Your photos are too large. Remove one or use smaller photos.");

  return { garment: garment as "tee" | "hoodie", colour: colour as "black" | "white", subject: subject as "artist" | "personal", style, name, tagline, size, photos: cleaned };
}

// These three styles are self-contained prompts (their own photo rules,
// garment/blend logic and output section) rather than the shared
// photoRules+footer wrapper the original 8 use, since they need exact
// MULTIPLY/LIGHTEN colour-math instructions the generic wrapper doesn't
// give them -- wrapping them in the generic footer too would tell the
// model two different background colours ("#0A0A0A" vs "#000000").
const NEW_STYLE_BUILDERS: Record<string, (input: UnikGenerationInput) => string> = {
  TOON_DRIP: buildToonDripPrompt,
  CHROME_COLLAGE: buildChromeCollagePrompt,
  I_LOVE_MY: buildILoveMyPrompt,
};

export function buildUnikPrompt(input: UnikGenerationInput) {
  const builder = NEW_STYLE_BUILDERS[input.style];
  if (builder) return builder(input);

  const name = input.name.toUpperCase();
  const tagline = input.tagline.trim().toUpperCase();
  const count = input.photos.length;
  const background = input.colour === "black" ? "pure black #0A0A0A" : "pure white #FFFFFF";
  const subjectRule = input.subject === "artist" ? "Treat the subject as an artist, but do not invent instruments, stages, locations or biography." : "This is a personal portrait. Do not add performance, concert, microphone or stage references.";
  const photoRules = `PHOTO RULES:\n- ${count} reference photo(s) attached. Use EACH exactly once, except stylistic close crops may come from the same visible portrait.\n- Use ONLY the people in the uploaded photos. Never substitute another face.\n- Preserve identity, facial features, skin tone and expression.\n- Do not infer private details or location.\n- ${subjectRule}\n`;
  const footer = `\nGARMENT: The finished graphic is intended for a ${input.colour} ${input.garment}.\nOUTPUT: A single print-ready portrait 3:4 artwork, no garment, no model, no mockup, no border. ${background} must bleed cleanly to every edge.`;
  const line = tagline || (input.subject === "artist" ? "THE ICON" : "ONE OF ONE");

  const styles: Record<string, string> = {
    TOUR_POSTER: `DESIGN: Vintage distressed tour-poster streetwear graphic on ${background}. Layer all photos into a bold hero-led collage with raw overlap, heavy film grain and subtle halftone. Top typography: massive condensed caps \"${name}\". Supporting line: \"${line}\". Use red #C8392B as the single accent with cream and black. Add no fake dates, venues, setlists or advisory labels.`,
    BOOTLEG: `DESIGN: Authentic late-1990s bootleg rap-shirt graphic on ${background}. Build a dense mosaic with one dominant hero and supporting portraits, deep grain, distressed ink and high contrast. Top: oversized outlined caps \"${name}\". Bottom: \"${line}\". Use electric blue #1E90FF as the single accent.`,
    EDITORIAL: `DESIGN: Premium editorial art-zine collage on ${background}. Use torn-paper edges, layered angles, a mix of colour and monochrome, and one large hero portrait. Overlap massive typography \"${name}\" with the composition and add handwritten \"${line}\" below. One muted accent only.`,
    CHROME: `DESIGN: Luxury dark streetwear portrait composition on near-black. Use two or three portraits with a cinematic central hero, extreme contrast and sharp highlights. Create genuinely dimensional chrome metallic typography \"${name}\" with realistic reflection and depth; add chrome script \"${line}\". Use a restrained deep-red accent.`,
    GIANT_FACE: `DESIGN: Monumental giant-face portrait graphic. Use the single reference as the only identity source. The face fills 85-90% of the canvas, slightly off-centre, cropped boldly, with no neck or body. Screen-print duotone with one warm accent, near-white highlights, pure-black shadows, heavy halftone and aged texture. Put a small signature-style \"${name}\" at bottom right${tagline ? ` with tiny \"${tagline}\" beneath` : ""}.`,
    BLING_ERA: `DESIGN: Loud early-2000s Bling Era bootleg graphic on pure black. One dominant full-colour airbrushed hero, supporting portraits and one circular inset. Add 4-6 four-point sparkles and a radial glow selected from pink/purple, teal/blue, amber/gold or deep red based on the photos. Top typography: massive rhinestone, gold 3D or chrome \"${name}\". Bottom handwritten script: \"${line}\".`,
    PAPER_CUT: `DESIGN: Contemporary paper-cut portrait collage on ${background}. Use a large central cut-out face with a few deliberately enlarged facial details in layered paper circles or torn shapes. Add fine hand-drawn annotation marks and one acid-lime accent. Keep the composition artful and premium, never distorted. Small restrained typography may read \"${name}\" and \"${line}\".`,
    VTG_BOOTLEG: `DESIGN: Collector-grade vintage bootleg portrait graphic on ${background}. Use a central hero surrounded by the remaining portraits, sepia or sun-faded tones, lightning or star texture, distressed screen-print grain and dramatic old-merch typography. Top: \"${name}\". Bottom: \"${line}\". Do not invent dates, venues or factual claims.`,
  };
  return `${photoRules}\n${styles[input.style]}${footer}`;
}

function buildToonDripPrompt(input: UnikGenerationInput): string {
  const name = input.name.trim().replace(/\s+/g, " ");
  const tagline = input.tagline.trim().replace(/\s+/g, " ");
  const hasTagline = tagline.length > 0;
  const mode = input.subject;

  const isDark = input.colour === "black";
  const canvas = isDark ? "#000000" : "#FFFFFF";
  const blend = isDark ? "lighten" : "multiply";
  const modeName = isDark ? "DARK MODE FOR BLACK GARMENT" : "LIGHT MODE FOR WHITE GARMENT";
  const nameColour = isDark ? "#F5F5F5" : "#0A0A0A";
  const nameColourName = isDark ? "soft white" : "deep black";

  const rule = `STRICT PHOTO AND IDENTITY RULES:
- Exactly 1 reference photograph is attached.
- This photograph is the ONLY source of the person's face, identity and appearance.
- Convert THIS exact person into a stylised cartoon while keeping them immediately recognisable.
- Preserve their real face shape, skin tone, hairstyle, hairline, facial hair, expression, distinguishing marks, clothing and visible accessories.
- Do NOT substitute the person with a celebrity, generic model, stock character or anime face from training data.
- Do NOT beautify, idealise, slim, widen, reshape, age, de-age or redesign the person.
- Do NOT change their hairstyle, facial hair, clothing or accessories unless required only for faithful cartoon stylisation.
- Do NOT change their expression beyond what naturally occurs during stylisation.
- Stylise the illustration technique only. Preserve the person's identity.
- Identity accuracy takes priority over exaggerated anime features.

`;

  const design = `DESIGN: Clean anime bootleg merch tee graphic — one real person reimagined as a premium chibi anime character. Portrait 3:4 composition.

GARMENT AND BLENDING MODE:
- Selected garment mode: ${modeName}.
- Exact generation background: ${canvas}.
- Final garment compositing blend mode: ${blend.toUpperCase()}.
- Generate the artwork specifically so it composites cleanly using the assigned blend mode.
- The complete outer background must remain perfectly uniform ${canvas}.
- Do not introduce off-white, cream, grey or accidental colour contamination into the outer background.
- The neutral background must visually disappear when placed on the selected garment using ${blend.toUpperCase()}.
- Do not create a rectangular poster, background panel, enclosing box, sticker border or visible canvas boundary.

LAYOUT:
- Create one chibi head-and-shoulders portrait centred on the canvas.
- Use an oversized head with small narrow shoulders.
- Show the head, neck and shoulders only.
- No full body.
- No arms or hands unless a small portion is genuinely visible and necessary from the reference photograph.
- The character should occupy approximately 75–85% of the composition height.
- Make the illustrated character the unmistakable focal point.
- Keep the complete face unobstructed.
- Maintain generous ${isDark ? "black" : "white"} negative space around the outer composition.
- Do not create a full scene or environmental background.
- Do not place large lettering above the head or behind the character.

LOWER-EDGE FADE:
- Do NOT end the bust with a hard, flat, circular, oval or curved crop line.
- Beginning within the lowest 12–18% of the illustrated shoulders and clothing, gradually reduce the artwork strength until it dissolves completely into ${canvas}.
- The fade must affect the actual character artwork itself.
- Fade the clothing, outlines, shadows and highlights naturally into ${canvas}.
- The fade must be soft, smooth, feathered and visually intentional.
- Follow the natural lower shape of the shoulders rather than creating a geometric base.
- There must be no visible cutoff edge.
- Do NOT add a ribbon, swoosh, loop, underline, fog cloud, painted stroke, oval, border or decorative shape to hide the crop.
- Do NOT create a solid contrasting shape beneath the character.

CHARACTER STYLE:
- Modern anime and manga-inspired cel-shaded illustration.
- Use expressive glossy anime eyes while retaining the person's recognisable eye shape, spacing and expression.
- Use clean angular eyebrows based on the real eyebrows in the photograph.
- Render smooth skin with controlled hard-edged cel shadows and clean flat colour fills.
- Do NOT use halftone dots, screen-print grain, rough photocopy texture or heavy noise across the character.
- Use confident outlines with controlled variation in line weight.
- Render the hairstyle in stylised anime shapes while preserving the real hairstyle, hairline, length and overall silhouette.
- Add clean highlight streaks only where appropriate.
- Keep the finish glossy, crisp, vector-clean and premium.
- Preserve the reference photograph's real skin tone, facial structure, hairstyle, facial hair, clothing and accessories.

`;

  const modeBlock = isDark
    ? `DARK-MODE LIGHTEN BLENDING SYSTEM:
- Generate the artwork on a perfectly uniform pure black #000000 background.
- The artwork will be placed on a black garment using the LIGHTEN blend mode.
- Pure black pixels are the neutral blending colour and must disappear into the garment.
- All important visible design elements must be lighter than pure black.
- Do not use pure black for important outlines, hair separation, typography or signature details.
- Use deep charcoal, dark navy or dark blue-grey instead of pure black for visible character outlines.
- Add restrained silver, blue or soft-white edge highlights around dark hair and dark clothing.
- Dark clothing must contain enough visible folds, blue-grey highlights and rim lighting to remain readable on black.
- Very dark hair must retain visible shape through dark navy structure and controlled cool highlights.
- Avoid large white halos or pale blocks behind the character.
- White may appear only as controlled highlights, eye reflections, typography, rim lighting and small design details.
- Every outline, shadow, highlight and lower-edge fragment must gradually fade back to pure black.
- The final result must blend naturally into a black garment without a visible black or white box.

`
    : `LIGHT-MODE MULTIPLY BLENDING SYSTEM:
- Generate the artwork on a perfectly uniform pure white #FFFFFF background.
- The artwork will be placed on a white garment using the MULTIPLY blend mode.
- Pure white pixels are the neutral blending colour and must disappear into the garment.
- Use deep black, charcoal, dark navy and controlled colour for important outlines and visible structure.
- Full-colour skin, hair, clothing and accessories must remain clear and balanced.
- White internal highlights may be used when surrounded by darker visible structure.
- Avoid large black rectangles, dark background slabs or enclosing dark shapes behind the character.
- Keep the surrounding canvas open, clean and predominantly white.
- Every outline, shadow, highlight and lower-edge fragment must gradually fade back to pure white.
- The final result must blend naturally into a white garment without a visible white or black box.

`;

  const type = `TYPOGRAPHY:
- Render the exact name "${name}" once.
- Use bold hand-painted BRUSH SCRAWL lettering.
- Use fast expressive brush strokes with slightly rough natural edges and minimal ink splatter.
- Keep every letter correctly spelled and clearly readable.
- The name is a small supporting accent, not the hero of the composition.
- Position it near the lower-left OR lower-right shoulder or chest area.
- Choose whichever side contains more negative space and creates better visual balance.
- Place the name slightly above the strongest portion of the lower fade so it remains readable.
- The lettering may overlap the outer edge of the shoulder or clothing slightly, like a premium editorial merch graphic.
- Keep the typography away from the eyes, nose, mouth and central facial features.
- The complete name should occupy approximately 18–25% of the canvas width.
- It should occupy no more than approximately 8–12% of the canvas height.
- Reduce the lettering size when necessary to fit a longer name cleanly.
- Keep the name on one line whenever reasonably possible.
- Do not truncate, abbreviate or replace any part of the supplied name.
- Do NOT stretch the name across the complete canvas.
- Do NOT place the name beneath the entire portrait.
- Do NOT place the name above the head or behind the character.
- Do NOT arch, stack, repeat or duplicate the name.
- Do NOT add a swoosh, loop, underline, circle or enclosing shape around the name.

MANDATORY NAME COLOUR:
- Render the complete main name in exactly ${nameColourName} ${nameColour}.
- Use a solid primary lettering colour.
- Do not use a multicolour gradient for the main name.
- Do not choose a different main name colour based on the photograph, clothing or mood.
- Do not recolour individual letters differently.
${isDark
      ? `- The selected garment is black and the artwork uses LIGHTEN blending.
- The soft-white name must remain bright, clean and clearly visible against the black garment.
- Do not use black, charcoal, navy, dark blue, dark red or any near-black colour for the main name.
`
      : `- The selected garment is white and the artwork uses MULTIPLY blending.
- The deep-black name must remain dark, clean and clearly visible against the white garment.
- Do not use white, cream, pale grey, pale silver or any near-white colour for the main name.
`}- Render the supplied name exactly once and add no alternative spelling.

`;

  const taglineBlock = hasTagline
    ? (mode === "artist"
      ? `SECONDARY TAGLINE:
- Render the exact tagline "${tagline}" once in very small hand-styled lettering.
- Position it directly beneath or beside the main name to form one compact typography lockup.
- Keep it on the same lower corner as the main name and above the strongest portion of the fade.
- It may carry the visual energy of a track title or era title.
- It must be noticeably smaller and quieter than the main name.
- Render the complete tagline in exactly ${nameColourName} ${nameColour}.
- The tagline must use the exact same solid colour as the main name.
- Do not choose another colour, gradient or separate accent colour for the tagline.
- Keep every word readable and correctly spelled.
- Do not add an underline, loop, enclosing shape or additional decorative text.
- Render the tagline exactly once.

`
      : `SECONDARY TAGLINE:
- Render the exact tagline "${tagline}" once in very small hand-styled lettering.
- Position it directly beneath or beside the main name to form one compact typography lockup.
- Keep it on the same lower corner as the main name and above the strongest portion of the fade.
- It may function as a nickname or short personal phrase.
- It must be noticeably smaller and quieter than the main name.
- Render the complete tagline in exactly ${nameColourName} ${nameColour}.
- The tagline must use the exact same solid colour as the main name.
- Do not choose another colour, gradient or separate accent colour for the tagline.
- Keep every word readable and correctly spelled.
- Do not add song, tour, album, stage, celebrity or performance references.
- Do not add an underline, loop, enclosing shape or additional decorative text.
- Render the tagline exactly once.

`)
    : "";

  const out = `COLOUR SYSTEM:
- Exact outer generation background: ${canvas}.
- Exact typography colour: ${nameColour}.
- Full-colour character with faithful natural skin tones.
- Preserve the reference photograph's clothing, hair and accessory colours wherever possible.
- Use no more than 3 additional accent colours beyond the character's natural colours.
- The accent-colour limit does not change the mandatory typography colour.
- Ensure every important design element remains visible after applying ${blend.toUpperCase()} blending.

SIGNATURE:
- Add one tiny abstract artist-style signature near the opposite shoulder or neckline.
- Render the signature in exactly ${nameColourName} ${nameColour}.
- The signature must use the same solid colour as the main name.
- It must be noticeably smaller than the main name.
- It must not repeat the customer's name or tagline.
- It may appear as an abstract artist mark rather than readable text.
- Do not add an underline, loop or large surrounding flourish.

MANDATORY FINAL AUDIT:
- Confirm that the cartoon remains immediately recognisable as the uploaded person.
- Confirm that no celebrity, generic anime face or replacement person has been introduced.
- Confirm that the background is uniformly ${canvas}.
- Confirm that the artwork is visually compatible with ${blend.toUpperCase()} blending.
- Confirm that the main name appears exactly once.
- Confirm that the main name colour is exactly ${nameColour}.
- Confirm that no alternate main name colour has been used.
${hasTagline
      ? `- Confirm that the secondary tagline appears exactly once.
- Confirm that the tagline colour is exactly ${nameColour}.
`
      : `- Confirm that no secondary tagline or invented text has been added.
`}- Confirm that the tiny signature colour is exactly ${nameColour}.
- Confirm that there is no hard lower crop, circular base or curved cutoff.
- Confirm that the actual shoulders, clothing, outlines and highlights dissolve naturally into ${canvas}.
- Confirm that no ribbon, swoosh, fog shape, oval or decorative block was used to hide the lower crop.
- Confirm that there is no visible rectangular background or poster boundary.
- Confirm that all important details remain visible on the selected garment colour.

OUTPUT:
- High-resolution, print-ready isolated graphic artwork.
- Portrait 3:4 composition.
- Exact outer background colour: ${canvas}.
- Exact main typography colour: ${nameColour}.
- Designed for final application using ${blend.toUpperCase()} blend mode.
- No border.
- No frame.
- No sticker-style outline around the complete design.
- No hard lower crop.
- No curved base.
- No background box.
- No complete environmental scene.
- No garment mock-up.
- No model wearing the completed design.
- Clean isolated cartoon portrait with small supporting brush-scrawl typography.
- The cartoon character remains the dominant focus.
- Crisp, balanced, recognisable, premium and iconic.`;

  return rule + design + modeBlock + type + taglineBlock + out;
}

function buildChromeCollagePrompt(input: UnikGenerationInput): string {
  const nameInput = input.name.trim().replace(/\s+/g, " ");
  const nameParts = nameInput ? nameInput.split(" ").filter(Boolean) : [];
  const topText = nameParts.length > 0 ? nameParts[0].toUpperCase() : "";
  const bottomText = nameParts.length > 1 ? nameParts.slice(1).join(" ").toUpperCase() : "";
  const hasBottomText = bottomText.length > 0;

  const isDark = input.colour === "black";
  const canvas = isDark ? "#000000" : "#FFFFFF";
  const blend = isDark ? "lighten" : "multiply";
  const modeName = isDark ? "DARK MODE FOR BLACK GARMENT" : "LIGHT MODE FOR WHITE GARMENT";

  const rule = `STRICT SOURCE-LOCKED PHOTO COMPOSITING RULES:
- Exactly 5 reference photographs are attached and ordered as PHOTO 1, PHOTO 2, PHOTO 3, PHOTO 4 and PHOTO 5.
- Each uploaded photograph is a fixed source asset, not inspiration for generating a replacement person.
- Use PHOTO 1 exactly once, PHOTO 2 exactly once, PHOTO 3 exactly once, PHOTO 4 exactly once and PHOTO 5 exactly once.
- The final artwork must contain exactly 5 photographic cutouts total.
- Every visible face, head, body, pose, hand, garment and accessory must come directly from its assigned source photograph.
- Do NOT redraw, regenerate, reconstruct, reinterpret or replace any uploaded person.
- Do NOT generate an alternative pose, expression, camera angle, outfit or body position.
- Do NOT extend, uncrop, complete or outpaint any body region beyond what is visibly present in the original photograph.
- If a photograph contains only a face or upper body, retain that exact available crop.
- Never invent missing shoulders, arms, hands, torsos, legs, clothing or accessories.
- If part of a person is cut off in the source photograph, it must remain cut off, masked, cropped or hidden behind another design layer.
- Do NOT combine facial features, bodies, clothing or accessories from separate uploads.
- Do NOT duplicate, mirror or create an alternative version of any uploaded person.
- Do NOT add background people, silhouettes, reflections, decorative faces or human-shaped shadows.
- Preserve each subject's facial identity, expression, skin tone, hairstyle, facial hair, body proportions, clothing and visible accessories.
- Allowed operations only: background removal, cropping within existing source boundaries, scaling, repositioning, masking, edge cleanup, colour grading, outlines, lighting and shadows.
- Source accuracy and identity preservation are more important than perfect layout symmetry.
- If a planned placement requires invented visual information, reduce, crop or partially conceal the original cutout instead.

`;

  const design = `DESIGN: Premium early-2000s bootleg hip-hop photo collage tee graphic. Dramatic layered photography, metallic chrome typography, circular framing, electric energy, distressed edges and polished concert-poster styling. Portrait 3:4 composition.

GARMENT AND BLENDING MODE:
- Selected garment mode: ${modeName}.
- Exact generation background: ${canvas}.
- Final garment compositing blend mode: ${blend.toUpperCase()}.
- Generate the artwork specifically to composite cleanly using the assigned blend mode.
- The background colour must be completely uniform and match ${canvas} exactly.
- Do not introduce off-white, cream, faded grey or accidental colour contamination into the outer background.
- Do not create a rectangular poster, solid enclosing box, sticker border or visible canvas boundary.
- Every outer fragment, glow, scratch, shadow, lightning effect and distressed edge must dissolve completely into ${canvas}.
- The neutral generation background must visually disappear when composited onto the selected garment using ${blend.toUpperCase()}.

OVERALL COMPOSITION:
- Build one dense vertical collage centred on the canvas.
- The complete artwork should occupy approximately 86–92% of the canvas height and 88–94% of the canvas width.
- PHOTO 1 must remain the unmistakable visual hero.
- Supporting photographs must create depth without covering important facial features.
- Every face must remain visible, recognisable and source-accurate.
- Use intentional overlapping layers rather than a simple grid.
- Do not make all five photographs the same size.
- The centre may be dense and dramatic while the outer edges gradually dissolve into the neutral blending background.
- Do not create a hard rectangular composition, poster block, sticker outline or solid enclosing shape.

`;

  const photos = `FIXED PHOTO PLACEMENT:

PHOTO 1 — CENTRAL HERO:
- Place the exact PHOTO 1 cutout large and centred in the foreground.
- PHOTO 1 must be the largest and sharpest photograph.
- Preserve its original pose, expression, camera angle, clothing and available crop.
- Position the face close to the visual centre of the composition.
- Do not extend the body beyond the original source boundaries.
- Use PHOTO 1 once and nowhere else.

PHOTO 2 — UPPER-LEFT:
- Place the exact PHOTO 2 cutout behind the central hero in the upper-left area.
- Preserve its original pose, expression, camera angle, clothing and available crop.
- Resize and reposition only.
- Do not generate missing body regions.
- Use PHOTO 2 once and nowhere else.

PHOTO 3 — UPPER-RIGHT:
- Place the exact PHOTO 3 cutout behind the central hero in the upper-right area.
- Preserve its original pose, expression, camera angle, clothing and available crop.
- Keep it visually distinct from PHOTO 2.
- Do not mirror, duplicate or recreate PHOTO 2.
- Use PHOTO 3 once and nowhere else.

PHOTO 4 — LOWER-LEFT:
- Place the exact PHOTO 4 cutout in the lower-left foreground or middle layer.
- Use only body regions visibly contained in PHOTO 4.
- Preserve its original pose, expression, clothing, camera angle and available crop.
- If PHOTO 4 is a close-up, retain it as a close-up.
- Never generate a full body or additional clothing from a cropped photograph.
- Use PHOTO 4 once and nowhere else.

PHOTO 5 — LOWER-RIGHT CIRCULAR INSET:
- Place the exact PHOTO 5 image inside one circular or slightly oval frame in the lower-right quadrant.
- Mask only pixels already present in PHOTO 5.
- Preserve its original face, expression, pose, clothing, camera angle and available environment.
- Do not recreate, regenerate or internally reposition the person to make them fit the frame.
- Use PHOTO 5 once inside this frame and nowhere else.

SOURCE-BOUNDARY RULE:
- Every cutout must remain limited to visual information contained in its own source photograph.
- Missing areas must remain cropped, masked, empty or hidden behind another design layer.
- Never use AI generation to complete missing photographic information.
- Never use one photograph to repair, extend or reconstruct another photograph.

`;

  const modeBlock = isDark
    ? `DARK-MODE LIGHTEN BLENDING SYSTEM:
- Generate the complete design on a perfectly uniform pure black #000000 background.
- The design will be composited onto a black garment using the LIGHTEN blend mode.
- Pure black pixels are the neutral blending colour and must visually disappear into the black garment.
- Visible design elements must be lighter than pure black.
- Build the atmosphere using silver, white, electric royal blue, medium blue, charcoal highlights and restrained deep-red accents.
- Use bright silver-white circular frames with electric-blue rim lighting.
- Add controlled electric-blue lightning, white energy streaks and restrained luminous starbursts.
- Add visible silver, blue or white edge separation around dark clothing so subjects remain readable against black.
- Avoid relying on pure-black shadows, black typography or black decorative details as important visible elements because LIGHTEN blending may remove them.
- Do not place grey, white, blue or coloured pixels across the complete background area.
- Keep the untouched outer background perfectly black.
- Every glow, frame, scratch and distressed fragment must fade gradually back to pure black.
- Do not add a white rectangle, pale poster slab, grey box or large white halo behind the collage.
- The final composition must merge naturally into a black garment without a visible black or white box.

`
    : `LIGHT-MODE MULTIPLY BLENDING SYSTEM:
- Generate the complete design on a perfectly uniform pure white #FFFFFF background.
- The design will be composited onto a white garment using the MULTIPLY blend mode.
- Pure white pixels are the neutral blending colour and must visually disappear into the white garment.
- Visible design elements must be darker than pure white.
- Build the atmosphere using pale silver-grey, cool grey, dark navy, electric royal blue, charcoal and restrained deep-red accents.
- Use pale silver framing with dark navy outlines and controlled electric-blue highlights.
- Use dark navy, blue and charcoal for visible structure and edge separation.
- Avoid relying on pure-white typography, white lightning or white decorative details as important visible elements because MULTIPLY blending may remove them.
- White may remain only as the untouched neutral background and internal highlight gaps surrounded by darker structure.
- Do not place black, navy, grey, blue or coloured pixels across the complete background area.
- Keep the untouched outer background perfectly white.
- Every shadow, frame, scratch and distressed fragment must fade gradually back to pure white.
- Avoid one large uninterrupted black, navy or grey mass behind the photographs.
- Do not add a black poster rectangle, solid dark oval or enclosing dark box.
- The final composition must merge naturally into a white garment without a visible white or black box.

`;

  const background = `FRAME AND EFFECT SYSTEM:
- Add one large layered circular frame behind PHOTO 1.
- The large frame should pass through the upper and middle composition without crossing important facial features.
- Add one smaller circular or slightly oval frame around PHOTO 5.
- Use mode-appropriate metallic, navy and electric-blue frame lines.
- Add controlled lightning, fine scratches, energy streaks, metallic fragments and restrained starburst effects.
- Keep lightning and texture behind faces wherever possible.
- Keep heavy texture away from eyes, noses and mouths.
- Effects must support the subjects rather than cover them.
- Do not generate a city, stage, crowd, vehicle, building, room or complete environmental background.
- Do not add decorative people, faces, logos, symbols or unrelated objects.

`;

  const treatment = `PHOTO TREATMENT:
- Keep every subject photographic and immediately recognisable.
- Preserve natural skin tones accurately.
- Apply one unified high-contrast premium colour grade across all five photographs.
- Add restrained rim lighting, shadows and edge highlights to separate overlapping cutouts.
- Apply mild distressed texture around clothing and exterior cutout edges only.
- Do not apply aggressive grain, halftone dots, scratches or texture across facial features.
- Do not turn subjects into cartoons, paintings, illustrations or 3D renders.
- Do not recolour skin blue, red, grey, silver or monochrome.
- Preserve the original colours of clothing, hair and accessories wherever possible.
- Ensure each photographic cutout remains visible after the assigned ${blend.toUpperCase()} blending process.

`;

  const type = `STRICT DYNAMIC TYPOGRAPHY LOGIC:
- The customer supplied one dynamic name value.
- The application has already separated that value into assigned title positions.
- TOP TEXT is exactly "${topText}".
${hasBottomText ? `- BOTTOM TEXT is exactly "${bottomText}".\n` : `- There is NO BOTTOM TEXT.\n`}- Do not perform your own name splitting.
- Do not move words between the assigned positions.
- Do not render the complete original input at both the top and bottom.
- Do not duplicate the top title.
- Do not duplicate the bottom title.
- Do not repeat any word to fill empty space.
- Do not invent additional names, surnames, nicknames, dates, slogans or labels.

TOP TITLE:
- Render the exact TOP TEXT once across the upper portion of the collage.
- Use uppercase Roman serif display lettering with a premium chrome-metal finish.
- Use a slight upward arch following the large circular frame.
${isDark
      ? `- Use bright silver-white letter faces, strong white highlights, electric-blue edge lighting, deep navy keylines and a controlled dark shadow.\n`
      : `- Use medium silver-grey letter faces, dark navy keylines, electric-blue accents and controlled charcoal shadows.
- Do not rely on pure white letter faces because the final artwork uses MULTIPLY blending.
`}- Keep every letter correctly spelled and clearly readable.
- Occupy approximately 76–88% of the canvas width and 12–17% of the canvas height.
- Place the title behind PHOTO 1's head.
- Allow the head to overlap only the lower portion of the lettering.
- Do not obscure enough of the title to make it unreadable.
- Render the top title exactly once.

${hasBottomText
      ? `BOTTOM TITLE:
- Render the exact BOTTOM TEXT once across the lower portion of the collage.
- Use the same chrome Roman serif typography system as the top title.
${isDark
        ? `- Use bright silver-white faces, white highlights, electric-blue rim accents, deep navy-black keylines and a controlled shadow.\n`
        : `- Use medium silver-grey faces, dark navy keylines, electric-blue accents and controlled charcoal shadows.
- Do not rely on pure white letter faces because the final artwork uses MULTIPLY blending.
`}- Keep every supplied word in its original order.
- Keep all letters correctly spelled and clearly readable.
- Occupy approximately 62–78% of the canvas width and 12–18% of the canvas height.
- Position it across the lower portion while keeping every face visible.
- Supporting cutouts may overlap only small outer portions of the lettering.
- Prefer one horizontal line when the complete text fits cleanly.
- If the text is too long, reduce the font size first.
- If it still cannot fit, use a maximum of two compact centred lines.
- Never truncate, abbreviate, reorder or replace supplied words.
- Render the bottom title exactly once.

`
      : `NO BOTTOM TITLE:
- Do not render any large typography across the bottom.
- Do not repeat the top title at the bottom.
- Do not invent a second title, surname, slogan, nickname or date.
- Use the lower composition for PHOTO 4, PHOTO 5, framing and balanced effects.

`}TYPOGRAPHY RESTRICTIONS:
- Spell all dynamic text exactly as supplied by the application.
- Render each assigned title only once.
- Do not add extra names, words, dates, numbers, labels, signatures, album titles, tour titles or decorative text.
- Do not duplicate words to make the composition appear fuller.
- Do not use blackletter, handwriting, graffiti, bubble lettering or brush script.
- Do not replace letters with symbols.
- Do not distort the typography until it becomes unreadable.
- Correct spelling, correct word placement and correct title count are more important than decorative complexity.

`;

  const edgeBlending = `OUTER-EDGE AND BLENDING AUDIT:
- Exact neutral generation background: ${canvas}.
- Exact final blend mode: ${blend.toUpperCase()}.
- The untouched outer background must remain uniformly ${canvas}.
- All visible artwork must gradually reduce in strength toward the outer edges.
- Fade the actual frame lines, scratches, lighting, shadows, colour fields and distressed fragments into the neutral background.
- Do not disguise the outer boundary with a rectangle, oval, cloud, fog block, painted slab, sticker border or enclosing shape.
- There must be no visible rectangular canvas edge after the artwork is applied using ${blend.toUpperCase()}.
- The neutral background must disappear cleanly into the selected garment.

`;

  const validation = `MANDATORY FINAL AUDIT BEFORE OUTPUT:
- Confirm that exactly 5 photographic cutouts are visible.
- Confirm that each cutout comes from its assigned uploaded photograph only.
- Confirm that no person has been duplicated, mirrored, reconstructed, substituted or hallucinated.
- Confirm that no generated body region extends beyond its source photograph.
- Confirm that no extra faces, silhouettes or human-like reflections are present.
- Confirm that the top title uses only the assigned TOP TEXT and appears exactly once.
${hasBottomText
      ? `- Confirm that the bottom title uses only the assigned BOTTOM TEXT and appears exactly once.
- Confirm that the complete input was not duplicated at both the top and bottom.
`
      : `- Confirm that no bottom title has been rendered.
- Confirm that the top title was not repeated anywhere else.
`}- Confirm that no additional decorative text was added.
- Confirm that the outer canvas colour is exactly ${canvas}.
- Confirm that the artwork is visually compatible with ${blend.toUpperCase()} blending.
- Confirm that every outer edge dissolves naturally into the neutral background.
- Confirm that no rectangular poster boundary is visible.
- If typography is incorrect, simplify the chrome styling instead of duplicating, replacing or inventing words.
- If a subject fails the source audit, reduce or remove that cutout instead of generating replacement content.

`;

  const out = `OUTPUT:
- High-resolution, print-ready isolated graphic artwork.
- Portrait 3:4 composition.
- Exact outer background colour: ${canvas}.
- Designed for final application using ${blend.toUpperCase()} blend mode.
- No outer border.
- No mock-up.
- No garment visible.
- No model wearing the completed artwork.
- No unrelated text.
- No duplicated titles.
- No hallucinated people.
- Premium, layered, dramatic, readable, source-accurate and visually integrated with the selected garment colour.`;

  return rule + design + photos + modeBlock + background + treatment + type + edgeBlending + validation + out;
}

function buildILoveMyPrompt(input: UnikGenerationInput): string {
  const subjectInput = cleanSubjectLabel(input.name);
  if (!subjectInput) throw new Error("Add who or what you love");
  const subjectText = subjectInput.toUpperCase();

  const isDark = input.colour === "black";
  const canvas = isDark ? "#000000" : "#FFFFFF";
  const blend = isDark ? "lighten" : "multiply";
  const modeName = isDark ? "DARK MODE FOR BLACK GARMENT" : "LIGHT MODE FOR WHITE GARMENT";

  const rule = `STRICT SOURCE-LOCKED PHOTO COMPOSITING RULES:
- Exactly 5 reference photographs are attached and ordered as PHOTO 1, PHOTO 2, PHOTO 3, PHOTO 4 and PHOTO 5.
- Do not begin compositing until all 5 uploaded photographs have been referenced.
- Each uploaded photograph is a fixed source asset, not inspiration for generating a replacement subject.
- Use PHOTO 1 exactly once, PHOTO 2 exactly once, PHOTO 3 exactly once, PHOTO 4 exactly once and PHOTO 5 exactly once.
- The final artwork must contain exactly 5 photographic subject appearances total.
- Every visible face, head, body region, pose, garment, accessory, fur pattern, coat marking or distinguishing feature must come directly from its assigned source photograph.
- Do NOT redraw, regenerate, reconstruct, reinterpret, replace or loosely recreate any uploaded subject.
- Do NOT create an alternative pose, expression, camera angle, body position, outfit, hairstyle, fur pattern or coat colour.
- Do NOT extend, uncrop, complete or outpaint any body region beyond what is visible in the original photograph.
- If a photograph contains only a face, head, bust or upper body, retain that exact available crop.
- Never invent missing shoulders, arms, hands, torsos, legs, paws, tails, garments or accessories.
- If part of a subject is cut off in the source image, it must remain cropped, masked or hidden behind another legitimate design layer.
- Do NOT combine features, body parts, clothing, fur or accessories from separate uploads.
- Do NOT duplicate, mirror or create an alternate version of any uploaded subject.
- Do NOT add background people, animals, decorative faces, silhouettes, reflections or human-shaped or animal-shaped shadows.
- Do NOT substitute an uploaded subject with a celebrity, stock model, generic person, generic pet or training-data character.
- For human subjects, preserve exact facial identity, skin tone, hairstyle, facial hair, proportions, clothing and accessories.
- For animal subjects, preserve exact species, breed appearance, face shape, ear shape, fur or coat colour, markings, eye colour and distinguishing features.
- Do NOT beautify, idealise, reshape, age, de-age or retouch the uploaded subjects.
- Allowed operations only: background removal, cropping within source boundaries, scaling, positioning, masking, edge cleanup, colour grading, outlines, lighting and shadows.
- Source accuracy and identity preservation are more important than perfect visual symmetry.
- If a planned placement requires invented information, reduce, crop or partially conceal the original photograph instead.

`;

  const design = `DESIGN: Premium early-2000s bootleg romance graphic tee collage using five source-locked photographs, glossy chrome heart frames, hot-pink energy, lightning, sparkles and bold nostalgic typography. Portrait 3:4 composition.

DYNAMIC TEMPLATE TEXT:
- The complete intended phrase is: "I LOVE MY ${subjectText}".
- "I LOVE" is the fixed top title.
- "My" is the fixed small cursive word in the lower typography lockup.
- "${subjectText}" is the dynamic customer-supplied subject label.
- Do not replace the dynamic subject label with girlfriend, boyfriend, bestie, dog or any other guessed word.
- Use only the exact dynamic subject text supplied by the application.

GARMENT AND BLENDING MODE:
- Selected garment mode: ${modeName}.
- Exact generation background: ${canvas}.
- Final garment compositing blend mode: ${blend.toUpperCase()}.
- Generate the artwork specifically so it composites cleanly using the assigned blend mode.
- The untouched outer canvas must remain completely uniform ${canvas}.
- The neutral background must visually disappear when the finished artwork is applied using ${blend.toUpperCase()}.
- Do not introduce off-white, cream, faded grey or accidental colour contamination into the untouched outer background.
- Do not create a rectangular poster, solid enclosing panel, sticker border or visible canvas boundary.
- Every glow, lightning bolt, shadow, sparkle, heart fragment and distressed edge must gradually dissolve into ${canvas}.

OVERALL COMPOSITION:
- Build one dense vertical bootleg-style collage centred on the canvas.
- The central area may be energetic and layered, but the exterior must remain open and dissolve into the neutral background.
- PHOTO 1 must remain the unmistakable visual hero.
- Photos 2, 3, 4 and 5 must support PHOTO 1 from inside four separate chrome heart frames.
- Every subject must remain clearly visible, recognisable and source-accurate.
- Use overlapping layers for depth without covering eyes, faces or distinguishing features.
- Do not arrange the five photographs as a plain grid.
- Do not make all five photographs the same size.
- Do not create a hard rectangle, poster slab, sticker outline or solid enclosing shape around the full composition.

`;

  const modeBlock = isDark
    ? `DARK-MODE LIGHTEN BLENDING SYSTEM:
- Generate the complete artwork on a perfectly uniform pure black #000000 background.
- The artwork will be placed on a black garment using the LIGHTEN blend mode.
- Pure black pixels are the neutral blending colour and must disappear into the garment.
- All important visible elements must be lighter than pure black.
- Build the visual system using bright hot pink, electric magenta, silver-white, cool silver, electric blue and restrained deep-red accents.
- Use bright silver-white chrome heart frames with pink and electric-blue rim highlights.
- Use luminous pink, magenta and soft-white lightning rather than black lightning.
- Use white and pale-pink star sparkles so they remain visible after LIGHTEN blending.
- Add silver, magenta or cool-white edge separation around dark hair, dark fur and dark clothing.
- Dark subjects must retain enough visible folds, fur texture, rim lighting and cool highlights to remain readable against black.
- Avoid pure black for important outlines, typography, heart borders or decorative details because pure black will disappear.
- Use dark navy, dark magenta or charcoal-blue where a visible dark structural line is required.
- Avoid large white halos, pale rectangles or full-canvas coloured washes.
- Keep the untouched outer background perfectly black.
- Every visible effect must fade gradually back to pure black.
- The final artwork must merge naturally into a black garment without a visible black or white box.

`
    : `LIGHT-MODE MULTIPLY BLENDING SYSTEM:
- Generate the complete artwork on a perfectly uniform pure white #FFFFFF background.
- The artwork will be placed on a white garment using the MULTIPLY blend mode.
- Pure white pixels are the neutral blending colour and must disappear into the garment.
- Build the visual system using hot pink, deep magenta, medium pink, silver-grey, dark pink, charcoal and restrained electric-blue accents.
- Use silver-grey chrome heart frames with dark-pink, charcoal or navy edge definition.
- Use medium and deep-pink lightning with controlled darker structure so it remains visible after MULTIPLY blending.
- Important sparkle details must not rely only on pure-white pixels.
- Use deep pink, charcoal or dark-magenta outlines around pale clothing, light fur and light photographic edges.
- Avoid one large uninterrupted black, magenta or pink background slab behind the photographs.
- Keep generous pure-white negative space around the exterior composition.
- Do not place coloured pixels across the complete canvas background.
- Keep the untouched outer background perfectly white.
- Every visible effect must fade gradually back to pure white.
- The final artwork must merge naturally into a white garment without a visible white or black box.

`;

  const background = `BACKGROUND AND ENERGY SYSTEM:
- Create one controlled hot-pink and deep-magenta radial glow centred behind PHOTO 1.
- The glow must be a shaped central design element, not a full-canvas background fill.
- Make the glow strongest behind the central hero and gradually weaker toward the outside.
- Fade the actual glow directly into ${canvas}.
- Do not end the glow with a visible circle, oval, rectangle or hard gradient boundary.
- Add restrained electric lightning behind the subjects and heart frames.
- Keep the strongest lightning within the middle 70–80% of the composition.
- Keep all lightning behind faces and distinguishing features.
- Add 6–8 small glossy three-dimensional pink decorative hearts around the composition.
- These small decorative hearts must not contain photographs or faces.
- Keep decorative hearts away from important facial features and typography.
- Vary their size and rotation naturally without creating a repetitive grid.
- Do not create a city, room, landscape, stage, crowd or complete environmental background.
- Do not add unrelated objects, logos, people, animals or text.

`;

  const photos = `FIXED PHOTO PLACEMENT:

PHOTO 1 — CENTRAL HERO ONLY:
- Extract the exact visible subject from PHOTO 1.
- Remove only the original photographic background.
- Place the unchanged source cutout large and centred in the foreground.
- PHOTO 1 must be the largest and sharpest photographic element.
- It should occupy approximately 45–55% of the composition height, depending on its available source crop.
- Position the subject slightly above the vertical centre to create room for the bottom typography.
- Preserve the exact pose, expression, camera angle, body position and available crop.
- Preserve human appearance, clothing and accessories when present.
- Preserve animal species, fur, coat markings and distinguishing features when present.
- Do not generate a wider, longer or alternate version of PHOTO 1.
- Do not place PHOTO 1 inside a heart frame.
- Do not duplicate PHOTO 1 in any supporting heart.
- Use PHOTO 1 exactly once and nowhere else.
- Allow the lower exterior edges to blend softly into the central glow without creating a hard crop.

PHOTO 2 — TOP-LEFT HEART ONLY:
- Place the exact visible subject from PHOTO 2 inside one chrome heart frame in the top-left area.
- Crop PHOTO 2 only by masking pixels already present in the source photograph.
- Preserve the original identity, expression, pose, camera angle and available crop.
- Do not regenerate or internally reposition the subject to fit the heart.
- Resize the existing photograph and heart frame instead.
- Use PHOTO 2 exactly once and nowhere else.

PHOTO 3 — TOP-RIGHT HEART ONLY:
- Place the exact visible subject from PHOTO 3 inside one chrome heart frame in the top-right area.
- Crop PHOTO 3 only by masking pixels already present in the source photograph.
- Preserve the original identity, expression, pose, camera angle and available crop.
- Do not mirror PHOTO 2 to create PHOTO 3.
- Do not regenerate or internally reposition the subject to fit the heart.
- Resize the existing photograph and heart frame instead.
- Use PHOTO 3 exactly once and nowhere else.

PHOTO 4 — MID-LEFT OR LOWER-LEFT HEART ONLY:
- Place the exact visible subject from PHOTO 4 inside one chrome heart frame in the mid-left or lower-left area.
- Crop PHOTO 4 only by masking pixels already present in the source photograph.
- Preserve the original identity, expression, pose, camera angle and available crop.
- If PHOTO 4 is a close-up, retain it as a close-up inside the heart.
- Never generate missing body regions, limbs, paws, clothing or accessories.
- Use PHOTO 4 exactly once and nowhere else.

PHOTO 5 — LOWER-RIGHT HEART ONLY:
- Place the exact visible subject from PHOTO 5 inside one chrome heart frame in the lower-right area.
- Crop PHOTO 5 only by masking pixels already present in the source photograph.
- Preserve the original identity, expression, pose, camera angle and available crop.
- If PHOTO 5 is tightly cropped, retain that tight crop inside the heart.
- Never generate missing body regions to fill the frame.
- Use PHOTO 5 exactly once and nowhere else.

HEART FRAME REQUIREMENTS:
- Create exactly 4 large photographic heart frames.
- Every large heart frame must contain one assigned uploaded photograph.
- No photographic heart frame may be empty.
- Do not create a fifth photographic heart frame.
- Do not place more than one subject inside any heart frame.
- Do not place the same uploaded subject into multiple heart frames.
- Use glossy reflective silver or chrome metallic framing.
- Do not use gold, bronze or copper heart frames.
- Use mode-appropriate highlights and shadows so all four frames remain visible after ${blend.toUpperCase()} blending.
- Keep each subject clearly visible and recognisable inside its assigned frame.

SOURCE-BOUNDARY RULE:
- Every photographic element must remain limited to information visibly contained in its own source image.
- Missing areas must remain cropped, masked, empty or hidden behind a legitimate design layer.
- Never use AI generation to complete missing photographic information.
- Never use one photograph to repair, extend or reconstruct another photograph.

`;

  const treatment = `PHOTO TREATMENT:
- Keep all five subjects photographic and immediately recognisable.
- Preserve natural skin tones, fur colours, coat patterns and distinguishing markings accurately.
- Preserve the exact facial or head features of every uploaded subject.
- Apply one consistent polished bootleg-merch colour grade across all five photographs.
- Add restrained pink, magenta, silver or cool-blue rim lighting around exterior cutout edges where needed.
- Use soft shadows and edge highlights to separate overlapping layers.
- Keep all faces, eyes, heads and distinguishing features clean and sharp.
- Do not place heavy grain, scratches, halftone dots or lightning across facial features.
- Do not convert the subjects into cartoons, paintings, illustrations or 3D renders.
- Do not recolour human skin or animal fur pink, blue, grey, silver or monochrome.
- Preserve original clothing, hair, fur, coat and accessory colours wherever possible.
- Ensure all five photographic appearances remain visible after ${blend.toUpperCase()} blending.

`;

  const type = `STRICT DYNAMIC TYPOGRAPHY SYSTEM:
- Render the exact words "I LOVE" once at the top.
- Render the exact word "My" once in the lower typography lockup.
- Render the exact dynamic subject text "${subjectText}" once in the lower typography lockup.
- The complete phrase represented by the layout is "I LOVE MY ${subjectText}".
- Do not render the complete phrase as an additional fourth text element.
- Do not duplicate any word or title.
- Do not replace the dynamic subject text with a guessed relationship word.
- Do not singularise, pluralise, translate, correct or rewrite the customer's supplied subject label.
- Do not add customer names, dates, signatures, slogans, album titles, tour titles or decorative wording.

TOP TEXT — I LOVE:
- Render the exact words "I LOVE" once above PHOTO 1.
- Use bold rounded slab-serif or rounded display lettering.
- Use a gentle upward arch.
- Centre the words above the central hero.
- Keep the text clearly readable and correctly spelled.
- Do not allow PHOTO 1 to cover enough of the letters to make them unreadable.
${isDark
      ? `- Use bright hot-pink to soft-white metallic-gradient letter faces, vivid magenta highlights, silver-white edge highlights and deep-magenta extrusion.
- Do not use black or near-black lettering because the artwork uses LIGHTEN blending.
`
      : `- Use medium-pink to deep-pink gradient letter faces, pale internal highlights, deep-magenta outlines and dark-pink three-dimensional extrusion.
- Do not rely on pure-white letter faces because the artwork uses MULTIPLY blending.
`}- Render "I LOVE" exactly once.

BOTTOM TEXT LOCKUP:
- Render the exact word "My" once in a flowing cursive script.
- Position "My" above or slightly overlapping the upper edge of the dynamic subject title.
- Keep "My" smaller than the dynamic subject title.
- Render the exact dynamic subject text "${subjectText}" once in large bold rounded block lettering.
- Centre the complete lower lockup across the bottom third of the composition.
- Keep every supplied letter and word correctly spelled and clearly readable.
- Preserve the original order of multi-word subject labels.
- Prefer one horizontal line when the dynamic subject text fits cleanly.
- If it is too long, reduce the font size before changing the layout.
- If it still cannot fit, use a maximum of two compact centred lines.
- Never truncate, abbreviate, reorder or replace the supplied subject label.
- Do not place any face behind the central portion of the dynamic title.
- Heart frames may overlap only small outer sections of the lower typography.
${isDark
      ? `- Use luminous hot pink, silver-white highlights, electric-magenta rim accents and deep-magenta three-dimensional extrusion.
- Do not use black or near-black as the main lettering colour.
`
      : `- Use medium-pink to deep-magenta gradient faces, controlled pale highlights, dark-pink outlines and deep-magenta three-dimensional extrusion.
- Do not rely on pure-white lettering as the main visible typography colour.
`}- Render "My" exactly once.
- Render "${subjectText}" exactly once.

BOTTOM BASE ELEMENT:
- Add one subtle chrome or silver oval accent behind selected portions of the lower typography.
- The oval must function only as a supporting metallic reflection element.
- Do not create one large solid oval containing the complete design.
- Do not allow the oval to become a sticker-style base or hard lower crop.
- Fade the oval edges gradually into ${canvas}.
- Keep all typography dominant and fully readable.

TYPOGRAPHY RESTRICTIONS:
- Do not duplicate, repeat, misspell or replace any supplied word.
- Do not add placeholder text.
- Do not add artist names, dates, years, track titles or tour references.
- Do not replace letters with hearts, symbols or decorative objects.
- Correct spelling and correct word count are more important than decorative complexity.
- If decorative styling threatens readability, simplify the gradient and extrusion.

`;

  const sparkles = `SPARKLE DETAILS:
- Add approximately 10–15 four-point star sparkles in varied sizes.
- Concentrate sparkles around heart borders, selected lightning intersections and typography edges.
- Keep sparkles away from eyes and distinguishing features.
- Do not place large sparkles directly over any face or head.
- Do not create a uniform sparkle pattern.
- Keep placement loose, energetic and visually balanced.
${isDark
      ? `- Use silver-white, pale-pink and electric-magenta sparkles that remain visible with LIGHTEN blending.\n`
      : `- Use pale silver, medium-pink and grey-edged white sparkles that remain visible with MULTIPLY blending.\n`}- Every outer sparkle must gradually dissolve into ${canvas}.

`;

  const edges = `OUTER-EDGE AND BLENDING SYSTEM:
- Exact neutral generation background: ${canvas}.
- Exact final compositing blend mode: ${blend.toUpperCase()}.
- Keep the untouched outer background uniformly ${canvas}.
- All visible artwork must gradually reduce in strength toward the exterior canvas edges.
- Fade the actual magenta glow, lightning, sparkles, shadows, frame highlights, textures and decorative hearts directly into the neutral background.
- Do not disguise the outer boundary using a rectangle, oval, cloud, fog panel, painted slab, vignette box, sticker border or enclosing shape.
- There must be no visible rectangular canvas boundary after the artwork is applied using ${blend.toUpperCase()}.
- The neutral background must disappear cleanly into the selected garment.
- Keep the strongest colour and contrast concentrated around the central hero, framed portraits and typography.

`;

  const validation = `MANDATORY FINAL AUDIT BEFORE OUTPUT:
- Confirm that exactly 5 uploaded photographic subject appearances are visible.
- Confirm that PHOTO 1 appears exactly once as the large central hero.
- Confirm that PHOTO 2 appears exactly once inside the top-left heart.
- Confirm that PHOTO 3 appears exactly once inside the top-right heart.
- Confirm that PHOTO 4 appears exactly once inside the mid-left or lower-left heart.
- Confirm that PHOTO 5 appears exactly once inside the lower-right heart.
- Confirm that exactly 4 large photographic heart frames exist.
- Confirm that no large photographic heart frame is empty.
- Confirm that no heart contains an invented or duplicated subject.
- Confirm that no uploaded subject has been mirrored, reconstructed, substituted or hallucinated.
- Confirm that no generated body region extends beyond its source photograph.
- Confirm that no extra people, animals, faces, silhouettes or reflections are present.
- Confirm that "I LOVE" appears exactly once.
- Confirm that "My" appears exactly once.
- Confirm that "${subjectText}" appears exactly once.
- Confirm that no other relationship word or subject label was added.
- Confirm that no additional text has been added.
- Confirm that every uploaded subject remains unobstructed and recognisable.
- Confirm that the exact outer background is ${canvas}.
- Confirm that the artwork remains visually compatible with ${blend.toUpperCase()} blending.
- Confirm that no rectangular poster block, solid enclosing panel or visible canvas edge remains.
- If any subject fails the source audit, reduce, crop or reposition the original cutout rather than generating replacement content.
- If typography is incorrect, simplify the effect rather than duplicating, replacing or inventing words.

`;

  const out = `OUTPUT:
- High-resolution, print-ready isolated graphic artwork.
- Portrait 3:4 composition.
- Exact outer background colour: ${canvas}.
- Designed for final application using ${blend.toUpperCase()} blend mode.
- No outer border.
- No rectangular poster block.
- No sticker-style outline around the complete design.
- No hard lower crop.
- No mock-up.
- No garment visible.
- No model wearing the completed design.
- No unrelated text.
- No duplicated photographs.
- No empty photographic heart frames.
- No hallucinated subjects.
- Premium early-2000s bootleg romance merch aesthetic.
- Dense and energetic around the centre, naturally blended into the selected garment at every outer edge.
- Nostalgic, glossy, dramatic, recognisable and print-ready.`;

  return rule + design + modeBlock + background + photos + treatment + type + sparkles + edges + validation + out;
}

export async function callRailwayGeneration(input: UnikGenerationInput) {
  const endpoint = process.env.UNIK_RAILWAY_GENERATE_URL || RAILWAY_FALLBACK;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.UNIK_RAILWAY_SECRET) headers.Authorization = `Bearer ${process.env.UNIK_RAILWAY_SECRET}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ photos: input.photos, prompt: buildUnikPrompt(input) }), signal: controller.signal, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `Generation provider returned ${response.status}`);
    if (typeof payload.image !== "string" || payload.image.length < 1000) throw new Error("The generation provider returned no artwork");
    const raw = payload.image.includes(",") ? payload.image.slice(payload.image.indexOf(",") + 1) : payload.image;
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length > 20 * 1024 * 1024) throw new Error("Generated artwork is too large");
    // Railway may return JPEG or WebP bytes even though the response field is
    // named `image`. Normalise the asset before storing and processing it.
    return sharp(buffer).rotate().png().toBuffer();
  } finally {
    clearTimeout(timer);
  }
}

function watermarkSvg(width: number, height: number) {
  const tileW = Math.max(240, Math.round(width / 3));
  const tileH = Math.max(150, Math.round(height / 5));
  let marks = "";
  for (let y = -tileH; y < height + tileH; y += tileH) {
    for (let x = -tileW; x < width + tileW; x += tileW) {
      marks += `<text x="${x}" y="${y}" transform="rotate(-24 ${x} ${y})" fill="white" fill-opacity=".2" stroke="black" stroke-opacity=".14" stroke-width="2" font-family="Arial, sans-serif" font-size="${Math.round(tileW / 7)}" font-weight="700" letter-spacing="5">UNIK LABS</text>`;
    }
  }
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`);
}

export async function makeWatermarkedPreview(clean: Buffer) {
  const image = sharp(clean).rotate();
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1365;
  return image.composite([{ input: watermarkSvg(width, height), blend: "over" }]).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

export async function makeMockup(clean: Buffer, input: UnikGenerationInput) {
  const basePath = path.join(process.cwd(), "public", "private-templates", "unik-labs", "assets", "dark", `front-${input.colour}-${input.garment}.jpg`);
  const base = sharp(basePath).rotate();
  const metadata = await base.metadata();
  const width = metadata.width || 828;
  const height = metadata.height || 1242;
  const zone = input.garment === "tee"
    ? { width: 0.3853, height: 0.3520, centreX: 0.5044, top: 0.4565 }
    : input.colour === "black"
      ? { width: 0.3328, height: 0.1955, centreX: 0.4957, top: 0.3477 }
      : { width: 0.3328, height: 0.2045, centreX: 0.4957, top: 0.3409 };
  const zoneWidth = Math.round(width * zone.width);
  const zoneHeight = Math.round(height * zone.height);
  const artwork = await sharp(clean).rotate().resize({ width: zoneWidth, height: zoneHeight, fit: "inside", withoutEnlargement: false }).png().toBuffer();
  const artMeta = await sharp(artwork).metadata();
  const left = Math.round(width * zone.centreX - (artMeta.width || zoneWidth) / 2);
  const top = Math.round(height * zone.top);
  const blend = input.colour === "black" ? (LIGHTEN_BLEND_STYLES.has(input.style) ? "lighten" : "screen") : "multiply";
  return base
    .composite([{ input: artwork, left, top, blend }])
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}

export function newDesignId() {
  return crypto.randomUUID();
}
