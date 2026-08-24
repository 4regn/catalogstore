import type { Metadata } from "next";
import ProductionRetailClient from "./ProductionRetailClient";
export const metadata: Metadata = { title: "4REGN Production & Retail Control", robots: { index: false, follow: false } };
export default function ProductionRetailPage() { return <ProductionRetailClient />; }
