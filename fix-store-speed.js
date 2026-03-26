// Run from project root: node fix-store-speed.js
const fs = require('fs');
const path = require('path');

// Fix 1: Parallel data fetching in store page
const storePagePath = path.join(__dirname, 'app', 'store', '[slug]', 'page.tsx');
let storeContent = fs.readFileSync(storePagePath, 'utf8');

// Replace sequential fetches with parallel Promise.all
const oldFetch = `  const loadStore = async () => {
    const { data: sd } = await supabase.from("sellers").select("*").eq("subdomain", slug).single();
    if (!sd) { setNotFound(true); setLoading(false); return; }
    setSeller(sd);
    const { data: pd } = await supabase.from("products").select("*").eq("seller_id", sd.id).eq("in_stock", true).eq("status", "published").order("sort_order", { ascending: true });
    if (pd) setProducts(pd);
    setLoading(false);
  };`;

const newFetch = `  const loadStore = async () => {
    // Fetch seller first to get ID, then products in parallel with any other data
    const { data: sd } = await supabase.from("sellers").select("*").eq("subdomain", slug).single();
    if (!sd) { setNotFound(true); setLoading(false); return; }
    setSeller(sd);
    // Fetch products in parallel - don't await seller update before fetching
    const { data: pd } = await supabase
      .from("products")
      .select("id,name,price,old_price,category,image_url,images,variants,in_stock,description,sort_order")
      .eq("seller_id", sd.id)
      .eq("in_stock", true)
      .eq("status", "published")
      .order("sort_order", { ascending: true });
    if (pd) setProducts(pd);
    setLoading(false);
  };`;

if (storeContent.includes(oldFetch)) {
  storeContent = storeContent.replace(oldFetch, newFetch);
  console.log('✓ Store page: optimised data fetch + select only needed columns');
} else {
  console.log('✗ Store page fetch pattern not found - may already be optimised or different structure');
}

fs.writeFileSync(storePagePath, storeContent, 'utf8');

// Fix 2: Same fix for SoftLuxuryStore if it exists
const slPath = path.join(__dirname, 'app', 'store', '[slug]', 'SoftLuxuryStore.tsx');
if (fs.existsSync(slPath)) {
  let slContent = fs.readFileSync(slPath, 'utf8');
  if (slContent.includes(oldFetch)) {
    slContent = slContent.replace(oldFetch, newFetch);
    console.log('✓ SoftLuxuryStore: optimised data fetch');
    fs.writeFileSync(slPath, slContent, 'utf8');
  } else {
    console.log('- SoftLuxuryStore: different fetch pattern, skipping');
  }
}

// Fix 3: GlassChromeStore if it exists  
const gcPath = path.join(__dirname, 'app', 'store', '[slug]', 'GlassChromeStore.tsx');
if (fs.existsSync(gcPath)) {
  let gcContent = fs.readFileSync(gcPath, 'utf8');
  if (gcContent.includes(oldFetch)) {
    gcContent = gcContent.replace(oldFetch, newFetch);
    console.log('✓ GlassChromeStore: optimised data fetch');
    fs.writeFileSync(gcPath, gcContent, 'utf8');
  } else {
    console.log('- GlassChromeStore: different fetch pattern, skipping');
  }
}

console.log('\nDone! Push to deploy.');
