"use client";

import Link from "next/link";
import { useState } from "react";
import { usePersistentStorefrontCart } from "./usePersistentStorefrontCart";
import styles from "./UniversalCollectionPage.module.css";

type Product = {
  id: string;
  handle?: string | null;
  name: string;
  price: number;
  old_price?: number | null;
  image_url?: string | null;
  images?: string[] | null;
  in_stock: boolean;
};

type Seller = {
  store_name: string;
  subdomain: string;
  logo_url?: string | null;
  primary_color?: string | null;
};

type CartItem = { product: Product; qty: number; selectedVariants: Record<string, string> };

const money = (value: number) => `R${Math.round(value).toLocaleString("en-ZA")}`;

export default function UniversalCollectionPage({
  seller,
  products,
  collectionName,
  description,
  template,
  isSubdomain,
}: {
  seller: Seller;
  products: Product[];
  collectionName: string;
  description?: string;
  template: string;
  isSubdomain: boolean;
}) {
  const base = isSubdomain ? "" : `/store/${seller.subdomain}`;
  const [cart, setCart] = useState<CartItem[]>([]);
  usePersistentStorefrontCart(seller.subdomain, cart, setCart);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const theme = template === "glass-futuristic" || template === "glass-chrome"
    ? styles.glass
    : template === "crown"
      ? styles.crown
      : template === "heirloom"
        ? styles.heirloom
        : template === "rosefields"
          ? styles.rosefields
          : "";

  return (
    <div className={`${styles.page} ${theme}`} style={{ "--accent": seller.primary_color || undefined } as React.CSSProperties}>
      <header className={styles.header}>
        <Link className={styles.home} href={base || "/"}>← Store</Link>
        <Link className={styles.brand} href={base || "/"}>
          {seller.logo_url ? <img className={styles.logo} src={seller.logo_url} alt={seller.store_name} /> : seller.store_name}
        </Link>
        <span className={styles.cart}>Cart <b>{totalItems}</b></span>
      </header>

      <main className={styles.main}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href={base || "/"}>Home</Link><span>/</span><span>{collectionName}</span>
        </nav>
        <section className={styles.intro}>
          <p>Collection</p>
          <h1>{collectionName}</h1>
          {description ? <div className={styles.description}>{description}</div> : null}
          <span>{products.length} {products.length === 1 ? "product" : "products"}</span>
        </section>

        {products.length ? (
          <section className={styles.grid} aria-label={`${collectionName} products`}>
            {products.map((product) => {
              const href = product.handle
                ? `${base}/products/${product.handle}`
                : `${base}/p/${product.id}`;
              const image = product.image_url || product.images?.[0] || "";
              return (
                <article className={styles.card} key={product.id}>
                  <Link className={styles.imageWrap} href={href} aria-label={`View ${product.name}`}>
                    {image ? <img src={image} alt={product.name} loading="lazy" /> : <span>No image</span>}
                    {!product.in_stock ? <b className={styles.sold}>Sold out</b> : null}
                  </Link>
                  <div className={styles.cardText}>
                    <h2><Link href={href}>{product.name}</Link></h2>
                    <div className={styles.prices}>
                      <strong>{money(Number(product.price))}</strong>
                      {product.old_price && product.old_price > product.price ? <del>{money(Number(product.old_price))}</del> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : <p className={styles.empty}>No products are available in this collection yet.</p>}
      </main>
    </div>
  );
}
