import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=") || true];
}));

const sellerEmail = String(args.seller || "").trim().toLowerCase();
const apply = args.apply === true;
if (!sellerEmail) throw new Error("Pass --seller=owner@example.com");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase environment variables.");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: seller, error: sellerError } = await supabase
  .from("sellers")
  .select("id, store_name, store_config")
  .eq("email", sellerEmail)
  .single();
if (sellerError || !seller) throw sellerError || new Error("Seller not found.");

const replaceSeason = (value) => String(value || "").replace(/winter sale/gi, (match) => {
  if (match === match.toUpperCase()) return "SPRING SALE";
  if (match === match.toLowerCase()) return "spring sale";
  return "Spring Sale";
});

const { data: products, error: productsError } = await supabase
  .from("products")
  .select("id, name, status, description")
  .eq("seller_id", seller.id)
  .ilike("description", "%winter sale%");
if (productsError) throw productsError;

const productUpdates = (products || [])
  .map((product) => ({ ...product, nextDescription: replaceSeason(product.description) }))
  .filter((product) => product.nextDescription !== product.description);

const currentConfig = seller.store_config || {};
const currentCollectionDescriptions = currentConfig.collection_descriptions || {};
const nextCollectionDescriptions = Object.fromEntries(
  Object.entries(currentCollectionDescriptions).map(([name, description]) => [name, replaceSeason(description)])
);
const changedCollections = Object.keys(currentCollectionDescriptions).filter(
  (name) => nextCollectionDescriptions[name] !== currentCollectionDescriptions[name]
);

console.log(`Seller: ${seller.store_name}`);
console.log(`${productUpdates.length} product description(s) contain Winter Sale.`);
console.log(`${changedCollections.length} configured collection description(s) contain Winter Sale.`);

if (!apply) {
  console.log("Dry run only. Re-run with --apply to write the changes.");
  process.exit(0);
}

for (let index = 0; index < productUpdates.length; index += 25) {
  const batch = productUpdates.slice(index, index + 25);
  const results = await Promise.all(batch.map((product) => supabase
    .from("products")
    .update({ description: product.nextDescription })
    .eq("id", product.id)
    .eq("seller_id", seller.id)));
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

if (changedCollections.length) {
  const { error } = await supabase
    .from("sellers")
    .update({
      store_config: {
        ...currentConfig,
        collection_descriptions: nextCollectionDescriptions,
      },
    })
    .eq("id", seller.id);
  if (error) throw error;
}

const { count: remainingProducts, error: verifyError } = await supabase
  .from("products")
  .select("id", { count: "exact", head: true })
  .eq("seller_id", seller.id)
  .ilike("description", "%winter sale%");
if (verifyError) throw verifyError;

console.log(`Updated ${productUpdates.length} product description(s) and ${changedCollections.length} collection description(s).`);
console.log(`Verification: ${remainingProducts || 0} product description(s) still contain Winter Sale.`);
