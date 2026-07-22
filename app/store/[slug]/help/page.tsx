import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "Help Centre — UNIK Labs" };

const CATEGORIES = [
  { id: "getting-started", label: "Getting Started", desc: "Accounts, AI generations and how the platform works." },
  { id: "ai-studio", label: "AI Studio", desc: "Templates, uploads and why a generation might fail." },
  { id: "custom-upload", label: "Custom Upload", desc: "Uploading your own finished artwork for printing." },
  { id: "orders", label: "Orders", desc: "Placing, changing and cancelling an order." },
  { id: "shipping", label: "Shipping", desc: "Delivery areas, timelines and tracking." },
  { id: "payments", label: "Payments", desc: "How checkout works and what to do if it fails." },
  { id: "returns", label: "Returns", desc: "Custom products, quality issues and what qualifies." },
  { id: "account", label: "Accounts", desc: "Signing in and how accounts can be restricted." },
];

export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout
      kicker="Support"
      title="Help centre"
      subtitle="Find answers about creating designs, uploading artwork, placing orders, production, delivery and using UNIK Labs. UNIK Labs combines AI-powered design tools with custom apparel printing, allowing you to create artwork, preview it on a garment and order the finished product from one platform."
      wide
      basePath={basePath}
    >
      <div className="ui-cards">
        {CATEGORIES.map((c) => (
          <a className="ui-card" href={`#${c.id}`} key={c.id}><strong>{c.label}</strong><span>{c.desc}</span></a>
        ))}
      </div>

      <h2 id="getting-started">Getting Started</h2>
      <h3>What is UNIK Labs?</h3>
      <p>UNIK Labs is an AI-powered apparel design and custom printing platform.</p>
      <p>
        You can choose from preconfigured design templates, upload your own images and use AI to
        create artwork for a T-shirt or hoodie. You can also skip the AI Design Studio and upload
        your own completed artwork for printing.
      </p>
      <p>UNIK Labs prints all orders on garments supplied by us. Customers cannot send their own garments for printing.</p>
      <h3>Creating an account</h3>
      <p>You can create or access your UNIK Labs account using Google Sign-In.</p>
      <p>Your account allows you to use the AI Design Studio, manage your creations and access features connected to your orders.</p>
      <h3>Free AI generations</h3>
      <p>Every user currently receives three free AI generations per day.</p>
      <p>Generation limits reset daily. Additional credits and paid generation options may be introduced in the future, but they are not currently available.</p>

      <h2 id="ai-studio">AI Design Studio</h2>
      <h3>How does the AI Design Studio work?</h3>
      <p>The AI Design Studio allows you to create apparel artwork using professionally prepared templates.</p>
      <p>To create a design:</p>
      <ul>
        <li>Choose a design template.</li>
        <li>Upload the images requested by the template.</li>
        <li>Review your uploaded images.</li>
        <li>Generate your design using AI.</li>
        <li>Preview the result as artwork and on a garment mockup.</li>
        <li>Continue to customise or order the design.</li>
      </ul>
      <h3>What images should I upload?</h3>
      <p>For the best results, upload images that are:</p>
      <ul>
        <li>Clear and in focus</li>
        <li>Well lit</li>
        <li>High resolution</li>
        <li>Not heavily cropped</li>
        <li>Free from unnecessary text or watermarks</li>
        <li>Relevant to the selected template</li>
      </ul>
      <p>Low-quality, blurry or heavily compressed images may produce less accurate results.</p>
      <h3>Are AI-generated designs always perfect?</h3>
      <p>No. AI-generated content can contain mistakes, unusual details or unexpected results.</p>
      <p>
        You should carefully review your generated artwork and garment mockup before placing an
        order. A mockup is a visual representation and the final printed item may vary slightly in
        colour, scale or placement.
      </p>
      <h3>Why did my generation fail?</h3>
      <p>A generation may fail because of:</p>
      <ul>
        <li>A temporary technical issue</li>
        <li>An unsupported or low-quality upload</li>
        <li>Content blocked by the AI service provider</li>
        <li>A connection interruption</li>
        <li>Reaching the daily generation limit</li>
      </ul>
      <p>You can try again using a clearer image or a different template.</p>

      <h2 id="custom-upload">Custom Upload</h2>
      <h3>Can I upload my own completed design?</h3>
      <p>Yes.</p>
      <p>The Custom Upload option allows you to upload artwork you have already created without using the AI Design Studio.</p>
      <p>You can select a garment, upload your design, review the placement and place an order for printing.</p>
      <h3>What files should I upload?</h3>
      <p>For the best print quality, use a high-resolution PNG file with a transparent background where possible.</p>
      <p>Images copied from social media, screenshots and heavily compressed files may appear blurry when printed.</p>
      <p>Before placing your order, make sure:</p>
      <ul>
        <li>The image is clear</li>
        <li>The spelling is correct</li>
        <li>The background appears as intended</li>
        <li>The artwork is positioned correctly</li>
        <li>You have permission to use the uploaded material</li>
      </ul>
      <h3>Can I send my own garment for printing?</h3>
      <p>No.</p>
      <p>UNIK Labs prints only on garments supplied through our platform. We do not currently accept garments supplied or delivered by customers.</p>

      <h2>Designs and Ownership</h2>
      <h3>Who owns the images I upload?</h3>
      <p>You retain ownership of the images, artwork, logos and other content you upload.</p>
      <p>By uploading content, you confirm that you have the necessary rights or permission to use it.</p>
      <h3>Who owns my AI-generated design?</h3>
      <p>You retain the rights to designs you generate through UNIK Labs and may use them for personal or commercial purposes, subject to applicable law and the rights of other people.</p>
      <p>UNIK Labs retains ownership of its platform, software, branding, templates and underlying technology.</p>
      <h3>Can I use my design commercially?</h3>
      <p>Yes.</p>
      <p>
        You may use your generated design for commercial purposes. However, you are responsible
        for ensuring that your uploaded material and final design do not infringe another
        person&rsquo;s copyright, trademark or other rights.
      </p>
      <h3>Does UNIK Labs use my images to train AI?</h3>
      <p>No.</p>
      <p>UNIK Labs does not use customer-uploaded images or generated designs to train artificial intelligence models.</p>
      <p>Your content is processed to provide the design and printing services you request.</p>

      <h2 id="orders">Orders</h2>
      <h3>How do I place an order?</h3>
      <p>Once you are satisfied with your design:</p>
      <ul>
        <li>Choose your garment.</li>
        <li>Select the colour and size.</li>
        <li>Review the design preview.</li>
        <li>Confirm your delivery details.</li>
        <li>Complete payment at checkout.</li>
      </ul>
      <p>Please review your order carefully before completing payment.</p>
      <h3>Can I change my order?</h3>
      <p>Contact support as soon as possible after placing your order.</p>
      <p>Changes are not guaranteed once production has begun. This includes changes to:</p>
      <ul>
        <li>Garment size</li>
        <li>Garment colour</li>
        <li>Uploaded artwork</li>
        <li>Print placement</li>
        <li>Delivery address</li>
      </ul>
      <h3>Can I cancel my order?</h3>
      <p>You may request cancellation within 48 hours of placing your order, provided production has not already begun.</p>
      <p>A cancellation cannot be guaranteed simply because the request was submitted within 48 hours. If production has already started, the order may no longer be eligible for cancellation.</p>
      <p>Orders cannot be cancelled after they have been shipped.</p>

      <h2 id="returns">Custom Products and Quality Issues</h2>
      <h3>Can I return a customised item?</h3>
      <p>Customised products are created specifically for each customer and generally cannot be returned because of a change of mind, incorrect size selection or dissatisfaction with an approved design.</p>
      <p>A return, exchange or refund may be considered where an item arrives:</p>
      <ul>
        <li>Damaged</li>
        <li>Defective</li>
        <li>Incorrect</li>
        <li>With a confirmed production or printing fault</li>
      </ul>
      <h3>What should I do if there is a quality issue?</h3>
      <p>Contact UNIK Labs within 72 hours of receiving the product.</p>
      <p>You may be asked to provide:</p>
      <ul>
        <li>Your order information</li>
        <li>A clear description of the problem</li>
        <li>Photographs showing the full garment</li>
        <li>Close-up photographs of the affected area</li>
        <li>Photographs of the packaging where relevant</li>
      </ul>
      <p>After reviewing the issue, UNIK Labs may offer an exchange, replacement or refund where appropriate.</p>
      <p>Do not continue wearing, washing or altering an item after discovering a possible defect, as this may affect our ability to assess the issue.</p>
      <h3>What is not considered a defect?</h3>
      <p>The following may not qualify as defects:</p>
      <ul>
        <li>Minor differences between screen colours and printed colours</li>
        <li>Slight differences in print position or scale</li>
        <li>Damage caused by incorrect washing or care</li>
        <li>Normal wear and tear</li>
        <li>Choosing the incorrect garment size</li>
        <li>Low-quality results caused by low-resolution customer artwork</li>
        <li>Features that were visible in the approved design or mockup</li>
      </ul>

      <h2 id="shipping">Shipping and Delivery</h2>
      <h3>Where does UNIK Labs deliver?</h3>
      <p>Physical product delivery is currently available only within South Africa.</p>
      <p>People outside South Africa may access the platform, but they cannot currently place orders for physical delivery outside South Africa.</p>
      <h3>When will my order be shipped?</h3>
      <p>Custom garments require production before shipping.</p>
      <p>
        Production and delivery estimates will be displayed during checkout or communicated after
        the order is placed. These estimates are not guaranteed and may be affected by order
        volume, production requirements, courier delays or circumstances outside our control.
      </p>
      <h3>Will I receive tracking information?</h3>
      <p>Where tracking is available, it will be sent after your order has been collected or processed by the courier.</p>
      <p>Tracking information may take some time to update after collection.</p>
      <h3>What if I enter the wrong address?</h3>
      <p>Customers are responsible for providing accurate delivery information.</p>
      <p>Contact support immediately after noticing an error. We cannot guarantee that an address can be changed after production or shipping begins.</p>
      <p>Additional delivery charges may apply if a parcel must be redirected or sent again because incorrect information was provided.</p>
      <h3>What happens if my parcel is delayed?</h3>
      <p>Courier delays can occur after an order leaves our production facility.</p>
      <p>We may assist with requesting an update from the courier, but delivery dates cannot always be guaranteed once a parcel is in the courier&rsquo;s possession.</p>

      <h2 id="payments">Payments</h2>
      <h3>How are payments processed?</h3>
      <p>Payments are processed securely through supported third-party payment providers.</p>
      <p>UNIK Labs does not directly store complete card details.</p>
      <p>The payment methods available to you will be displayed at checkout and may depend on your device, browser and payment provider availability.</p>
      <h3>What if I am charged more than once?</h3>
      <p>Do not place repeated orders if a payment screen appears delayed.</p>
      <p>Check your bank account and UNIK Labs order history first. If you believe you were charged more than once for the same order, contact support with the relevant payment information so the issue can be investigated.</p>
      <h3>Why was my payment declined?</h3>
      <p>Payments may be declined by your bank or the payment provider for reasons including:</p>
      <ul>
        <li>Insufficient funds</li>
        <li>Incorrect payment information</li>
        <li>Security checks</li>
        <li>Transaction limits</li>
        <li>An unsupported card</li>
        <li>A temporary bank or payment-provider issue</li>
      </ul>
      <p>UNIK Labs may not receive the exact reason for a declined payment.</p>

      <h2 id="account">Account and Platform Issues</h2>
      <h3>I cannot sign in. What should I do?</h3>
      <p>Make sure you are using the same Google account originally connected to UNIK Labs.</p>
      <p>You can also:</p>
      <ul>
        <li>Refresh the page</li>
        <li>Confirm your internet connection</li>
        <li>Allow cookies in your browser</li>
        <li>Try a private browsing window</li>
        <li>Try another supported browser</li>
        <li>Disable browser extensions that may block authentication</li>
      </ul>
      <h3>Can UNIK Labs suspend an account?</h3>
      <p>Yes.</p>
      <p>Accounts may be restricted, suspended or removed for reasons including:</p>
      <ul>
        <li>Spam or automated abuse</li>
        <li>Fraudulent activity</li>
        <li>Chargeback abuse</li>
        <li>Attempts to bypass generation limits</li>
        <li>Attempts to compromise the platform</li>
        <li>Illegal or prohibited activity</li>
        <li>Serious or repeated violations of our policies</li>
      </ul>

      <h2 id="still-need-help">Still Need Help?</h2>
      <p>Support contact information will be added soon.</p>
      <p>Before requesting assistance, please have the following ready where relevant:</p>
      <ul>
        <li>Your full name</li>
        <li>Your order number</li>
        <li>The email connected to your account</li>
        <li>A description of the issue</li>
        <li>Screenshots or photographs showing the problem</li>
      </ul>
      <p>
        For policy-specific information, please review our{" "}
        <a href={`${basePath}/terms`}>Terms of Service</a>,{" "}
        <a href={`${basePath}/privacy`}>Privacy Policy</a>,{" "}
        <a href={`${basePath}/refund-policy`}>Refund &amp; Returns Policy</a>,{" "}
        <a href={`${basePath}/shipping-policy`}>Shipping Policy</a> and{" "}
        <a href={`${basePath}/intellectual-property`}>Intellectual Property Policy</a>.
      </p>
    </UnikInfoLayout>
  );
}
