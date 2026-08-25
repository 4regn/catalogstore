"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePersistentStorefrontCart } from "./usePersistentStorefrontCart";
import styles from "./UniversalProductPage.module.css";

type Variant = { name: string; options: string[]; images?: Record<string, string>; priceDelta?: Record<string, number> };
type Product = { id: string; handle?: string; name: string; price: number; old_price: number | null; category: string; image_url: string | null; images: string[]; variants: Variant[]; in_stock: boolean; description?: string };
type CartItem = { product: Product; qty: number; selectedVariants: Record<string, string> };
type Seller = { store_name: string; subdomain: string; template: string; logo_url?: string; primary_color?: string };

const money = (value: number) => `R${Math.round(value).toLocaleString("en-ZA")}`;
const itemPrice = (product: Product, selected: Record<string, string>) => product.price + (product.variants || []).reduce((sum, group) => sum + (group.priceDelta?.[selected[group.name]] || 0), 0);

export default function UniversalProductPage({ seller, product, template, isSubdomain, descriptionText }: { seller: Seller; product: Product; template: string; isSubdomain: boolean; descriptionText: string }) {
  const slug = seller.subdomain;
  const base = isSubdomain ? "" : `/store/${slug}`;
  const initialVariants = Object.fromEntries((product.variants || []).filter(v => v.options?.length).map(v => [v.name, v.options[0]]));
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>(initialVariants);
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const fallbackImages = [product.image_url, ...(product.images || [])].filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index);
  const [activeImage, setActiveImage] = useState(fallbackImages[0] || "");
  usePersistentStorefrontCart(slug, cart, setCart);

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cart.reduce((sum, item) => sum + itemPrice(item.product, item.selectedVariants) * item.qty, 0);
  const theme = template === "glass-futuristic" || template === "glass-chrome" ? styles.glass : template === "crown" ? styles.crown : template === "heirloom" ? styles.heirloom : template === "rosefields" ? styles.rosefields : "";
  const category = (product.category || "").split(",")[0]?.trim();
  const variantKey = useMemo(() => JSON.stringify(selectedVariants), [selectedVariants]);

  function selectVariant(group: Variant, option: string) {
    setSelectedVariants(current => ({ ...current, [group.name]: option }));
    const variantImage = group.images?.[option];
    if (variantImage) setActiveImage(variantImage);
  }

  function addToCart() {
    if (!product.in_stock) return;
    setCart(current => {
      const index = current.findIndex(item => item.product.id === product.id && JSON.stringify(item.selectedVariants) === variantKey);
      if (index < 0) return [...current, { product, qty: quantity, selectedVariants }];
      return current.map((item, i) => i === index ? { ...item, qty: Math.min(999, item.qty + quantity) } : item);
    });
    setCartOpen(true);
  }

  function checkout() {
    const payload = cart.map(item => ({ id: item.product.id, name: item.product.name, price: itemPrice(item.product, item.selectedVariants), qty: item.qty, variant: Object.entries(item.selectedVariants).map(([key, value]) => `${key}: ${value}`).join(", "), image: item.product.image_url || item.product.images?.[0] || "", selectedVariants: item.selectedVariants }));
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    window.location.href = `${base}/checkout?cart=${encoded}`;
  }

  return (
    <div className={`${styles.page} ${theme}`} style={{ "--accent": seller.primary_color || undefined } as React.CSSProperties}>
      <header className={styles.header}>
        <Link className={styles.home} href={base || "/"}>← Store</Link>
        <Link className={styles.brand} href={base || "/"}>{seller.logo_url ? <img className={styles.logo} src={seller.logo_url} alt={seller.store_name} /> : seller.store_name}</Link>
        <button className={styles.cartButton} onClick={() => setCartOpen(true)} aria-label={`Open cart with ${totalItems} items`}>Cart <span className={styles.badge}>{totalItems}</span></button>
      </header>
      <main className={styles.main}>
        <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href={base || "/"}>Home</Link><span>/</span>{category && <><span>{category}</span><span>/</span></>}<span>{product.name}</span></nav>
        <div className={styles.grid}>
          <section className={styles.gallery} aria-label="Product images">
            <div className={styles.thumbs}>{fallbackImages.map((image, index) => <button key={`${image}-${index}`} className={image === activeImage ? styles.thumbActive : styles.thumb} onClick={() => setActiveImage(image)} aria-label={`View image ${index + 1}`}><img src={image} alt="" loading={index < 2 ? "eager" : "lazy"} /></button>)}</div>
            <div className={styles.heroImage}>{activeImage && <img src={activeImage} alt={product.name} fetchPriority="high" />}</div>
          </section>
          <section className={styles.info}>
            {category && <p className={styles.eyebrow}>{category}</p>}
            <h1 className={styles.title}>{product.name}</h1>
            <div className={styles.prices}><span className={styles.price}>{money(itemPrice(product, selectedVariants))}</span>{product.old_price && product.old_price > product.price ? <span className={styles.oldPrice}>{money(product.old_price)}</span> : null}</div>
            <p className={styles.stock}>{product.in_stock ? "In stock" : "Sold out"}</p>
            {(product.variants || []).map(group => <fieldset className={styles.option} key={group.name}><legend>{group.name}: {selectedVariants[group.name]}</legend><div className={styles.choices}>{group.options.map(option => <button type="button" key={option} className={selectedVariants[group.name] === option ? styles.chosen : styles.choice} onClick={() => selectVariant(group, option)}>{option}</button>)}</div></fieldset>)}
            <div className={styles.qtyRow}><span>Quantity</span><div className={styles.qty}><button onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label="Decrease quantity">−</button><span>{quantity}</span><button onClick={() => setQuantity(value => Math.min(999, value + 1))} aria-label="Increase quantity">+</button></div></div>
            <button className={styles.add} onClick={addToCart} disabled={!product.in_stock}>{product.in_stock ? `Add to cart — ${money(itemPrice(product, selectedVariants) * quantity)}` : "Sold out"}</button>
            {descriptionText && <section className={styles.description}><h2>Product details</h2>{descriptionText}</section>}
          </section>
        </div>
      </main>
      {cartOpen && <><button className={styles.backdrop} onClick={() => setCartOpen(false)} aria-label="Close cart" /><aside className={styles.drawer} aria-label="Shopping cart"><div className={styles.drawerHeader}><h2>Your cart</h2><button className={styles.close} onClick={() => setCartOpen(false)} aria-label="Close cart">×</button></div>{cart.length ? <><div className={styles.cartItems}>{cart.map((item, index) => <div className={styles.cartItem} key={`${item.product.id}-${JSON.stringify(item.selectedVariants)}`}><img src={item.product.image_url || item.product.images?.[0] || ""} alt="" /><div><div className={styles.cartName}>{item.product.name}</div><div className={styles.cartVariant}>{Object.values(item.selectedVariants).join(" · ")}</div><button className={styles.remove} onClick={() => setCart(current => current.filter((_, i) => i !== index))}>Remove</button></div><div className={styles.cartQty}><button onClick={() => setCart(current => current.map((entry, i) => i === index ? { ...entry, qty: Math.max(1, entry.qty - 1) } : entry))}>−</button><span>{item.qty}</span><button onClick={() => setCart(current => current.map((entry, i) => i === index ? { ...entry, qty: Math.min(999, entry.qty + 1) } : entry))}>+</button></div></div>)}</div><div className={styles.drawerFoot}><div className={styles.subtotal}><span>Subtotal</span><span>{money(subtotal)}</span></div><button className={styles.checkout} onClick={checkout}>Secure checkout</button></div></> : <p className={styles.empty}>Your cart is empty.</p>}</aside></>}
    </div>
  );
}
