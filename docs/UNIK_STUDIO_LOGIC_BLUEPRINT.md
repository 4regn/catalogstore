# UNIK Labs Studio logic blueprint

Status: architecture agreed in principle; calibrated UI and print-zone code remain the source of truth and must not be rewritten by this work.

## 1. Boundaries

- Keep `public/private-templates/unik-labs/studio.html` and `upload.html` as the visual experience.
- Replace only their prototype storage, generation, account, cart, and checkout calls.
- Never expose the clean generated artwork, provider secret, private storage path, or production file URL to the browser.
- Catalogstore remains the authority for products, prices, orders, payment status, and seller ownership.
- UNIK-specific tables and endpoints are private to the UNIK seller/template and are not reusable by other sellers unless deliberately generalized later.

## 2. Customer lifecycle

1. A visitor may explore both studios without an account.
2. An authenticated customer is required immediately before an AI generation is submitted or a design is saved.
3. The server enforces three successful AI generations per customer in a rolling 24-hour window.
4. Uploaded source photos are stored privately only for the duration needed to generate the design, then deleted automatically.
5. A successful generation creates a durable generation record with:
   - a private clean production design;
   - a public or signed watermarked design preview;
   - a public or signed clean garment mockup preview;
   - the selected garment, colour, size, style, name, and tagline;
   - provider/job metadata and timestamps.
6. The customer can save the generation for later or add it to cart.
7. Starting checkout creates a Catalogstore order in `pending` state and links its line item to the UNIK design record.
8. Successful payment marks the linked design `paid`; incomplete payment remains visible as an abandoned checkout.

## 3. Secure generation path

`studio.html` sends a generation request to `POST /api/unik/generations` using multipart form data.

The server:

1. verifies the Supabase customer session;
2. verifies the request belongs to the active UNIK seller/template;
3. applies the server-side rolling limit;
4. validates file type, dimensions, size, and number of photos;
5. stores source photos in a private temporary bucket;
6. constructs the final provider prompt on the server;
7. calls the generation provider with a server-only secret;
8. stores the clean output in a private production bucket;
9. creates the tiled `UNIK LABS` watermark on the server and stores that preview;
10. returns only the generation ID, watermarked artwork preview, mockup preview, status, and remaining allowance;
11. queues deletion of temporary source photos.

Provider failures do not consume a generation allowance. A successful stored output does.

## 4. Storage layout

Recommended Supabase Storage buckets:

- `unik-generation-inputs` — private, temporary, short retention.
- `unik-production-artwork` — private, durable, clean print files.
- `unik-generation-previews` — public or short-lived signed delivery, watermarked artwork.
- `unik-mockup-previews` — public or short-lived signed delivery, clean garment mockups.
- `unik-upload-artwork` — private, durable custom-upload originals.

Objects use server-generated IDs rather than customer filenames:

`{seller_id}/{customer_id}/{design_id}/{asset-role}.{extension}`

## 5. Core data records

### `unik_customer_profiles`

- `id` — UUID matching `auth.users.id`.
- `email`, `display_name`, `phone`.
- `created_at`, `updated_at`.

### `unik_designs`

- `id`, `seller_id`, `customer_id`.
- `source` — `ai_studio` or `custom_upload`.
- `status` — `processing`, `generated`, `saved`, `in_cart`, `checkout_started`, `paid`, `failed`, `expired`.
- `garment`, `colour`, `size`, `print_sides`.
- `style`, `subject_type`, `design_name`, `tagline` for AI designs.
- `production_front_path`, `production_back_path` — private.
- `watermarked_preview_url`, `mockup_front_url`, `mockup_back_url`.
- `placement` — JSON containing the calibrated placement/output metadata needed for production.
- `provider`, `provider_job_id`, `provider_metadata`.
- `created_at`, `updated_at`, `saved_at`, `paid_at`.

### `unik_generation_attempts`

- `id`, `seller_id`, `customer_id`, `design_id`.
- `status` — `started`, `succeeded`, `failed`.
- `failure_code`, `created_at`, `completed_at`.

Only `succeeded` rows count toward the rolling allowance.

### Catalogstore order linkage

Each UNIK order item must retain `design_id`. The safest approach is to extend the stored order item JSON with a server-resolved `customization` object rather than accepting URLs or price data from the browser.

## 6. Custom upload path

The current calibrated canvas remains responsible for customer positioning and preview rendering.

Before cart insertion, `upload.html` sends the original front/back files plus the calibrated placement metadata to `POST /api/unik/uploads`. The server stores the originals privately and returns a `design_id`. The browser may upload the rendered mockup preview, but it is presentation-only and never the production source.

For two-sided garments, the record must retain both originals and both placement objects even if the cart thumbnail displays only the front.

White pixels on beige garments must remain unchanged in the production file; no multiply blend is applied to artwork pixels.

## 7. Server-authoritative products and prices

Create dedicated published Catalogstore products owned by the UNIK seller:

- Custom Tee — Front: R299 launch price (was R399)
- Custom Tee — Front + Back: R379 launch price (was R479)
- Custom Hoodie — Front: R350 launch price (was R450)
- Custom Hoodie — Front + Back: R450 launch price (was R550)
- AI Tee — R349 launch price (was R450)
- AI Hoodie — R399 launch price (was R500)

The Custom Upload Studio displays `Starting from R299` for tees and `Starting from R350` for hoodies. The AI Studio displays the exact selected-garment price because it has no front/back price split. Checkout always resolves the exact product and price from Catalogstore's database.

The browser sends `design_id`, product ID, quantity, and selected size. The server verifies that the design belongs to the signed-in customer and that its garment/source matches the requested product.

## 8. Checkout integration

Extend `POST /api/checkout/place-order` for UNIK items:

1. accept `designId` as an identifier only;
2. load the design server-side;
3. verify seller, customer, source, garment, and valid status;
4. resolve product price from Catalogstore;
5. store a safe `customization` snapshot on the order item;
6. set the design status to `checkout_started` after order creation;
7. on payment webhook success, mark the design `paid`.

The production artwork path must be visible only to authorized UNIK staff/admin workflows, never in checkout HTML, local storage, or public order responses.

## 9. Account history

Replace `unik-labs-account-v1`, `unik-labs-generations-v1`, and `unik-labs-orders-v1` local storage with authenticated API reads:

- `GET /api/unik/account`
- `GET /api/unik/designs`
- `GET /api/unik/orders`
- `PATCH /api/unik/account`
- `POST /api/unik/designs/{id}/save`

Local storage may remain only for theme choice and a short-lived cart pointer. It is not a source of truth.

## 10. Implementation order

1. Add database migration, private buckets, and access policies.
2. Add customer authentication and account endpoints.
3. Add AI generation endpoint, watermarking, storage, and rolling limit.
4. Connect `studio.html` without changing its calibrated UI.
5. Add custom-upload asset persistence and production metadata.
6. Create/identify the six Catalogstore products and connect server pricing.
7. Extend order placement and payment callbacks with `design_id` lifecycle updates.
8. Replace local account/order/generation history.
9. Add cleanup jobs, operational logs, retry handling, and admin production downloads.

## 11. Decisions still required

- Whether saved unpaid generations expire, and after how many days.
- Which image-generation provider replaces or retains the current Railway service.
- Whether watermarked previews are public objects or private objects served through short-lived signed URLs.
