import type { Metadata } from "next";
import ProductionClient from "./ProductionClient";

export const metadata: Metadata = { title: "4REGN Production — Batch Compiler", robots: { index: false, follow: false } };

export default function ProductionPage() { return <ProductionClient />; }
