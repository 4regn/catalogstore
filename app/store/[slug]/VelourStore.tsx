"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams, useSearchParams } from "next/navigation";
import { effectiveStoreConfig } from "../../../lib/template-config";

/* ─── TYPES ─────────────────────────────────────────────── */
interface SocialLinks {
  whatsapp?: string; instagram?: string; tiktok?: string;
  facebook?: string; twitter?: string;
}
interface StoreConfig {
  hero_image?: string;
  hero_label?: string;
  hero_subtext?: string;
  brand_subtitle?: string;
  monogram_letters?: string;
  accent_color?: string;
  city?: string;
  callout_available?: boolean;
  callout_area?: string;
  business_hours?: { weekdays?: string; saturday?: string; sunday?: string };
  payment_methods?: string[];
  chat_auto_replies?: string[];
  contact_email?: string;
  contact_phone?: string;
  physical_address?: string;
}
interface Seller {
  id: string; store_name: string; whatsapp_number: string;
  subdomain: string; template: string; primary_color: string;
  logo_url: string; tagline: string; description: string;
  social_links: SocialLinks;
  store_config: StoreConfig;
  template_configs?: Record<string, any>;
  subscription_status?: string;
  trial_ends_at?: string | null;
}
interface Service {
  id: string; category: string; name: string; price: number;
  media_url: string | null; media_type: string | null; sort_order: number;
}
interface BookingSlot { date: string; time_slot: string; status: string; }

interface StorePageProps {
  initialSeller?: Seller;
  initialServices?: Service[];
  initialBookings?: BookingSlot[];
  isSubdomain?: boolean;
}

const fmt = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");
const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; };
const SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DEFAULT_REPLIES = [
  "Thank you for reaching out! We will get back to you shortly.",
  "Feel free to browse our services and pricing above, or book a session directly.",
  "Yes, we do offer callout services — just select it when booking!",
  "You can reach us directly on WhatsApp for a faster response.",
];

export default function VelourStore({ initialSeller, initialServices, initialBookings, isSubdomain }: StorePageProps = {}) {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const sp = (suffix: string = "") => (isSubdomain ? suffix || "/" : `/store/${slug}${suffix}`);
  const isEditMode = searchParams.get("editMode") === "true";

  const [seller, setSeller] = useState<Seller | null>(initialSeller ?? null);
  const [services, setServices] = useState<Service[]>(initialServices ?? []);
  const [bookedSlots, setBookedSlots] = useState<BookingSlot[]>(initialBookings ?? []);
  const [loading, setLoading] = useState(!initialSeller);
  const [notFound, setNotFound] = useState(false);

  /* live edit overrides */
  const [liveLogoUrl, setLiveLogoUrl] = useState<string | null>(null);
  const [liveHeroImage, setLiveHeroImage] = useState<string | null>(null);
  const [liveTagline, setLiveTagline] = useState<string | null>(null);
  const [liveHeroSubtext, setLiveHeroSubtext] = useState<string | null>(null);
  const [liveBrandSubtitle, setLiveBrandSubtitle] = useState<string | null>(null);
  const [liveMonogram, setLiveMonogram] = useState<string | null>(null);
  const [liveCity, setLiveCity] = useState<string | null>(null);
  const [liveCalloutAvailable, setLiveCalloutAvailable] = useState<boolean | null>(null);
  const [liveCalloutArea, setLiveCalloutArea] = useState<string | null>(null);
  const [liveBusinessHours, setLiveBusinessHours] = useState<StoreConfig["business_hours"] | null>(null);
  const [livePaymentMethods, setLivePaymentMethods] = useState<string[] | null>(null);
  const [liveContactEmail, setLiveContactEmail] = useState<string | null>(null);
  const [liveContactPhone, setLiveContactPhone] = useState<string | null>(null);
  const [livePhysicalAddress, setLivePhysicalAddress] = useState<string | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  /* booking widget state */
  const [bookingType, setBookingType] = useState<"studio" | "callout">("studio");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [bookingError, setBookingError] = useState("");

  /* chat widget state */
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHasBadge, setChatHasBadge] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ sender: "studio" | "client"; text: string; time: string }[]>([]);
  const chatReplyIdx = useRef(0);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  /* ─── LOAD ─── */
  useEffect(() => {
    if (initialSeller) {
      if (isEditMode) window.parent.postMessage({ type: "IFRAME_READY" }, "*");
      return;
    }
    (async () => {
      const { data: s } = await supabase.from("sellers").select("*").eq("subdomain", slug).single();
      if (!s) { setNotFound(true); setLoading(false); return; }
      setSeller(s);
      const { data: svcs } = await supabase.from("services").select("*").eq("seller_id", s.id).order("sort_order", { ascending: true });
      setServices(svcs || []);
      const todayIso = new Date().toISOString().slice(0, 10);
      const { data: bks } = await supabase.from("bookings").select("date, time_slot, status").eq("seller_id", s.id).neq("status", "cancelled").gte("date", todayIso);
      setBookedSlots(bks || []);
      setLoading(false);
      if (isEditMode) window.parent.postMessage({ type: "IFRAME_READY" }, "*");
    })();
  }, [slug]);

  /* Listen for live updates from the editor */
  useEffect(() => {
    if (!isEditMode) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "LIVE_UPDATE") return;
      if (e.data.logoUrl !== undefined) setLiveLogoUrl(e.data.logoUrl);
      if (e.data.heroImage !== undefined) setLiveHeroImage(e.data.heroImage);
      if (e.data.tagline !== undefined) setLiveTagline(e.data.tagline);
      if (e.data.heroSubtext !== undefined) setLiveHeroSubtext(e.data.heroSubtext);
      if (e.data.brandSubtitle !== undefined) setLiveBrandSubtitle(e.data.brandSubtitle);
      if (e.data.monogramLetters !== undefined) setLiveMonogram(e.data.monogramLetters);
      if (e.data.city !== undefined) setLiveCity(e.data.city);
      if (e.data.calloutAvailable !== undefined) setLiveCalloutAvailable(e.data.calloutAvailable);
      if (e.data.calloutArea !== undefined) setLiveCalloutArea(e.data.calloutArea);
      if (e.data.businessHours !== undefined) setLiveBusinessHours(e.data.businessHours);
      if (e.data.paymentMethods !== undefined) setLivePaymentMethods(e.data.paymentMethods);
      if (e.data.contactEmail !== undefined) setLiveContactEmail(e.data.contactEmail);
      if (e.data.contactPhone !== undefined) setLiveContactPhone(e.data.contactPhone);
      if (e.data.physicalAddress !== undefined) setLivePhysicalAddress(e.data.physicalAddress);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isEditMode]);

  useEffect(() => {
    if (services.length && !selectedServiceId) setSelectedServiceId(services[0].id);
  }, [services]);

  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [chatMessages, chatOpen]);

  /* ─── LOADING / NOT FOUND ─── */
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#F5EDE3", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 400, color: "#7A5C47", marginBottom: 20 }}>{initialSeller?.store_name || "Loading"}</div>
        <div style={{ width: 30, height: 30, border: "2px solid rgba(122,92,71,0.15)", borderTopColor: "#7A5C47", borderRadius: "50%", animation: "spin 0.9s linear infinite", margin: "0 auto" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", background: "#F5EDE3", display: "flex", alignItems: "center", justifyContent: "center", color: "#2A1F18", fontFamily: "'Cormorant Garamond', serif", textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 64, fontWeight: 400, color: "#C9A96E", opacity: 0.4, marginBottom: 16 }}>404</div>
        <div style={{ fontSize: 22, fontWeight: 400 }}>Store not found</div>
      </div>
    </div>
  );

  const storeInactive = seller && seller.subscription_status !== "active" && seller.subscription_status !== "free" && !(seller.subscription_status === "trial" && seller.trial_ends_at && new Date(seller.trial_ends_at) > new Date());
  if (storeInactive && !isEditMode) return (
    <div style={{ minHeight: "100vh", background: "#F5EDE3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#2A1F18", fontFamily: "'Cormorant Garamond', serif", textAlign: "center", padding: "40px 24px" }}>
      {seller?.logo_url ? <img src={seller.logo_url} alt="" onError={hideOnError} style={{ height: 48, objectFit: "contain", marginBottom: 32 }} /> : <h2 style={{ fontSize: 26, fontWeight: 400, color: "#7A5C47", marginBottom: 32 }}>{seller?.store_name}</h2>}
      <h1 style={{ fontSize: 30, fontWeight: 400, marginBottom: 12 }}>Store Temporarily Unavailable</h1>
      <p style={{ fontFamily: "Jost, sans-serif", fontSize: 15, color: "rgba(42,31,24,0.6)", maxWidth: 400, lineHeight: 1.6 }}>This store is currently inactive. Please check back soon or contact the seller directly.</p>
    </div>
  );

  const s = seller!;
  const config = effectiveStoreConfig(s) as StoreConfig;

  /* ─── PALETTE ─── */
  const mocha = s.primary_color || "#7A5C47";
  const gold = config.accent_color || "#C9A96E";
  const cream = "#F5EDE3";
  const warm = "#EDE0D0";
  const taupe = "#A68B72";
  const goldLt = "#E2C99A";
  const ink = "#2A1F18";
  const mid = "#6B5141";
  const white = "#FDFAF7";

  /* ─── DISPLAY VALUES ─── */
  const brandName = s.store_name || "GracefulBeaty";
  const brandSubtitle = liveBrandSubtitle ?? config.brand_subtitle ?? "by Lebo Coka";
  const motto = liveTagline ?? s.tagline ?? "Enhancing Beauty. Empowering You.";
  const monogramLetters = (liveMonogram ?? config.monogram_letters ?? "LC").toUpperCase();
  const logoUrl = liveLogoUrl ?? s.logo_url;
  const heroImage = liveHeroImage ?? config.hero_image ?? null;
  const city = liveCity ?? config.city ?? "Durban";
  const heroLabel = config.hero_label || "Makeup Artist · Hair Specialist";
  const heroSubtext = liveHeroSubtext ?? config.hero_subtext ?? `Professional makeup artistry and hair installation services — in studio or at your door. Based in ${city}.`;
  const calloutAvailable = liveCalloutAvailable ?? config.callout_available ?? true;
  const calloutArea = liveCalloutArea ?? config.callout_area ?? `Available across ${city}`;
  const hours = liveBusinessHours ?? config.business_hours ?? { weekdays: "08:00–18:00", saturday: "09:00–16:00", sunday: "By Appointment" };
  const paymentMethods = livePaymentMethods ?? (config.payment_methods?.length ? config.payment_methods : ["visa", "mastercard", "applepay", "googlepay", "eft"]);
  const chatAutoReplies = config.chat_auto_replies?.length ? config.chat_auto_replies : DEFAULT_REPLIES;
  const phone = liveContactPhone ?? config.contact_phone ?? "";
  const email = liveContactEmail ?? config.contact_email ?? "";
  const address = livePhysicalAddress ?? config.physical_address ?? "";
  const instagramHandle = s.social_links?.instagram || "";
  const tiktokHandle = s.social_links?.tiktok || "";
  const whatsappNumber = (s.whatsapp_number || "").replace(/\D/g, "");

  /* ─── SERVICES GROUPED ─── */
  const categories = Array.from(new Set(services.map(sv => sv.category || "General")));
  const grouped = categories.map(cat => ({ cat, items: services.filter(sv => (sv.category || "General") === cat) }));
  const cheapest = services.length ? Math.min(...services.map(sv => sv.price)) : null;

  /* ─── BOOKING DERIVED ─── */
  const bookedByDate = new Map<string, Set<string>>();
  for (const b of bookedSlots) {
    if (!bookedByDate.has(b.date)) bookedByDate.set(b.date, new Set());
    bookedByDate.get(b.date)!.add(b.time_slot);
  }
  const dateStr = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selectedDateStr = selectedDay ? dateStr(calMonth.getFullYear(), calMonth.getMonth(), selectedDay) : null;
  const takenForSelectedDay = selectedDateStr ? (bookedByDate.get(selectedDateStr) || new Set()) : new Set<string>();

  /* Edit mode: section wrapper */
  const EditSection = ({ id, children, style }: { id: string; children: React.ReactNode; style?: React.CSSProperties }) => {
    if (!isEditMode) return style ? <div style={style}>{children}</div> : <>{children}</>;
    const isHovered = hoveredSection === id;
    return (
      <div
        onMouseEnter={() => setHoveredSection(id)}
        onMouseLeave={() => setHoveredSection(null)}
        onClick={(e) => { e.stopPropagation(); window.parent.postMessage({ type: "SECTION_CLICK", section: id }, "*"); }}
        style={{ position: "relative", outline: isHovered ? `2px solid ${gold}` : "2px solid transparent", outlineOffset: -2, cursor: "pointer", transition: "outline-color 0.2s", ...style }}
      >
        {isHovered && (
          <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", background: gold, color: ink, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, padding: "4px 12px", borderRadius: 100, zIndex: 9999, pointerEvents: "none" as const, whiteSpace: "nowrap" as const, boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
            Click to edit
          </div>
        )}
        {children}
      </div>
    );
  };

  /* ─── ICONS ─── */
  const PinIcon = ({ size = 10 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg>
  );
  const PlayCameraIcon = ({ size = 28, color = taupe }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" fill={color} stroke="none" opacity="0.5" /></svg>
  );
  const InstagramIcon = ({ size = 15 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg>
  );
  const TikTokIcon = ({ size = 15 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82a4.28 4.28 0 0 1-3.77-4.09h-3.13v14.8a2.6 2.6 0 1 1-1.85-2.49V10.9a5.8 5.8 0 1 0 5 5.75V9.4a7.2 7.2 0 0 0 3.75 1.06V7.33a4.27 4.27 0 0 1-.0-1.5Z" /></svg>
  );
  const WhatsAppIcon = ({ size = 15 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.35 0 4.55.92 6.21 2.58a8.73 8.73 0 0 1 2.57 6.22c0 4.56-3.7 8.27-8.27 8.27a8.3 8.3 0 0 1-4.21-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.24 8.24 0 0 1-1.27-4.42c0-4.57 3.72-8.29 8.28-8.29m-4.59 4.7c-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.03s.87 2.36.99 2.52c.12.16 1.7 2.7 4.19 3.68 2.07.82 2.49.65 2.94.62.45-.04 1.46-.6 1.66-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.46-.28-.24-.12-1.46-.72-1.68-.8-.22-.08-.39-.12-.55.13-.16.24-.63.8-.77.96-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.11-.49.11-.11.24-.29.36-.43.12-.14.16-.24.24-.4.08-.16.04-.31-.02-.43-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.42-.55-.42Z" /></svg>
  );
  const VisaLogo = () => (
    <svg width="34" height="14" viewBox="0 0 48 16"><rect width="48" height="16" rx="2.5" fill="#fff" /><text x="24" y="12" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="700" fontSize="10" fill="#1A1F71">VISA</text></svg>
  );
  const MastercardLogo = () => (
    <svg width="34" height="14" viewBox="0 0 48 16"><rect width="48" height="16" rx="2.5" fill="#fff" /><circle cx="21" cy="8" r="5.5" fill="#EB001B" /><circle cx="29" cy="8" r="5.5" fill="#F79E1B" fillOpacity="0.9" /></svg>
  );
  const ApplePayLogo = () => (
    <svg width="34" height="14" viewBox="0 0 48 16"><rect width="48" height="16" rx="2.5" fill="#fff" /><text x="24" y="11.5" textAnchor="middle" fontFamily="-apple-system,sans-serif" fontWeight="600" fontSize="9" fill="#000"> Pay</text><path d="M13.5 5.6c-.35.42-.9.75-1.46.7-.07-.55.2-1.14.53-1.5.35-.43.95-.74 1.44-.76.06.57-.16 1.13-.51 1.56Zm.5.79c-.8-.05-1.49.45-1.87.45-.39 0-.98-.43-1.62-.42-.83.01-1.6.48-2.02 1.23-.87 1.5-.23 3.72.61 4.94.41.6.9 1.27 1.55 1.24.62-.02.86-.4 1.61-.4.76 0 .97.4 1.63.39.68-.01 1.1-.6 1.51-1.2.48-.68.67-1.34.68-1.38-.01-.01-1.31-.5-1.32-2-.01-1.26 1.03-1.86 1.07-1.89-.59-.86-1.5-.96-1.83-.96Z" fill="#000" /></svg>
  );
  const GooglePayLogo = () => (
    <svg width="34" height="14" viewBox="0 0 48 16"><rect width="48" height="16" rx="2.5" fill="#fff" /><text x="26" y="11.5" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="600" fontSize="9" fill="#3C4043">Pay</text><circle cx="12" cy="8" r="4.6" fill="#4285F4" /><text x="12" y="10.7" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="700" fontSize="6.5" fill="#fff">G</text></svg>
  );
  const PayLogo = ({ id }: { id: string }) => {
    if (id === "visa") return <VisaLogo />;
    if (id === "mastercard") return <MastercardLogo />;
    if (id === "applepay") return <ApplePayLogo />;
    if (id === "googlepay") return <GooglePayLogo />;
    return (
      <span style={{ background: "rgba(255,255,255,0.05)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 3, padding: "4px 9px", fontSize: 9.5, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(245,237,227,0.5)", whiteSpace: "nowrap" as const }}>{id}</span>
    );
  };

  /* ─── BOOKING ACTIONS ─── */
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay();
  const today = new Date();
  const changeMonth = (dir: number) => {
    setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + dir, 1));
    setSelectedDay(null); setSelectedSlot(null); setBookingConfirmed(false);
  };
  const selectDay = (d: number) => { setSelectedDay(d); setSelectedSlot(null); setBookingConfirmed(false); };
  const confirmBooking = async () => {
    if (!s || !selectedDateStr || !selectedSlot) return;
    setBookingError("");
    if (!clientName.trim()) { setBookingError("Please enter your name."); return; }
    const digits = clientPhone.replace(/\D/g, "");
    if (digits.length < 9) { setBookingError("Please enter a valid phone number."); return; }
    setBookingSubmitting(true);
    try {
      const { error } = await supabase.from("bookings").insert({
        seller_id: s.id,
        service_id: selectedServiceId,
        date: selectedDateStr,
        time_slot: selectedSlot,
        booking_type: bookingType,
        status: "pending",
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
      });
      if (error) throw error;
      setBookedSlots(prev => [...prev, { date: selectedDateStr, time_slot: selectedSlot, status: "pending" }]);
      setBookingConfirmed(true);
    } catch (e: any) {
      setBookingError(e?.message || "Could not confirm your booking. Please try again or contact us directly.");
    } finally {
      setBookingSubmitting(false);
    }
  };
  const bookingWhatsappUrl = () => {
    const svc = services.find(sv => sv.id === selectedServiceId);
    const lines = [
      `Hi! I'd like to book with ${brandName}:`,
      svc ? `Service: ${svc.name}` : "",
      selectedDateStr ? `Date: ${selectedDateStr}` : "",
      selectedSlot ? `Time: ${selectedSlot}` : "",
      `Type: ${bookingType === "studio" ? "Studio Visit" : "Callout"}`,
      clientName ? `Name: ${clientName}` : "",
    ].filter(Boolean).join("\n");
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines)}`;
  };

  /* ─── CHAT ─── */
  const toggleChat = () => { setChatOpen(o => !o); if (!chatOpen) setChatHasBadge(false); };
  const sendChatMessage = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatMessages(prev => [...prev, { sender: "client", text: msg, time: "Now" }]);
    setChatInput("");
    setTimeout(() => {
      setChatMessages(prev => [...prev, { sender: "studio", text: chatAutoReplies[chatReplyIdx.current % chatAutoReplies.length], time: "Just now" }]);
      chatReplyIdx.current++;
    }, 900);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@300;400;500&display=swap');
        .vl-root *{box-sizing:border-box}
        .vl-root{background:${cream};color:${ink};font-family:'Jost',sans-serif;font-weight:300;overflow-x:hidden}
        .vl-root a{text-decoration:none}
        @keyframes vlSpin{to{transform:rotate(360deg)}}
        .vl-nav-links a{transition:color 0.3s}
        .vl-nav-links a:hover{color:${gold}}
        .vl-btn-gold{background:${gold};color:${ink};font-size:0.7rem;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;padding:13px 26px;transition:background 0.3s;border:none;cursor:pointer;display:inline-block}
        .vl-btn-gold:hover{background:${goldLt}}
        .vl-btn-outline-cream{border:1px solid rgba(245,237,227,0.3);color:${cream};font-size:0.7rem;letter-spacing:0.16em;text-transform:uppercase;padding:13px 26px;transition:all 0.3s;display:inline-block}
        .vl-btn-outline-cream:hover{border-color:${gold};color:${gold}}
        .vl-service-card{position:relative;overflow:hidden;aspect-ratio:3/4;background:${warm};cursor:pointer}
        .vl-service-card.wide{grid-column:1/-1;aspect-ratio:16/7}
        .vl-service-card video,.vl-service-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 0.5s ease}
        .vl-service-card:hover video,.vl-service-card:hover img{transform:scale(1.04)}
        .vl-cal-day:not(.vl-empty):not(.vl-past):not(.vl-booked):hover{background:rgba(201,169,110,0.2);color:${ink}}
        .vl-slot:not(.vl-taken):hover{background:rgba(201,169,110,0.15);color:${ink}}
        .vl-toggle-opt,.vl-bs-opt{cursor:pointer;transition:all 0.25s}
        .vl-cal-nav-btn{transition:all 0.2s;cursor:pointer}
        .vl-cal-nav-btn:hover{background:${mocha};color:${cream};border-color:${mocha}}
        .vl-social-btn{transition:all 0.3s}
        .vl-social-btn:hover{border-color:${gold} !important;color:${gold} !important}
        .vl-chat-fab{transition:all 0.3s}
        .vl-chat-fab:hover{background:${gold} !important}
        .vl-chat-fab:hover svg{fill:${ink} !important}
        .vl-footer-col a:hover{color:${gold} !important}
      `}</style>

      <div className="vl-root">
        {/* NAV */}
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", background: "rgba(245,237,227,0.92)", backdropFilter: "blur(16px)", borderBottom: `1px solid rgba(201,169,110,0.2)` }}>
          <a href={sp("/")} style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", fontWeight: 400, color: mocha, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 8 }}>
            {logoUrl ? <img src={logoUrl} alt={brandName} onError={hideOnError} style={{ height: 26, objectFit: "contain" }} /> : (<>{brandName}</>)}
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <ul className="vl-nav-links" style={{ display: "flex", gap: 22, listStyle: "none" }}>
              <li><a href="#services" style={{ fontSize: "0.68rem", fontWeight: 400, letterSpacing: "0.18em", textTransform: "uppercase", color: mid }}>Services</a></li>
              <li><a href="#pricing" style={{ fontSize: "0.68rem", fontWeight: 400, letterSpacing: "0.18em", textTransform: "uppercase", color: mid }}>Pricing</a></li>
            </ul>
            <a href="#booking" style={{ background: mocha, color: cream, fontSize: "0.68rem", fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", padding: "10px 18px" }}>Book</a>
          </div>
        </nav>

        {/* HERO */}
        <EditSection id="hero">
          <section style={{ position: "relative", width: "100%", minHeight: "100vh", background: mocha, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingTop: 70, overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
              {heroImage && <img src={heroImage} alt="" onError={hideOnError} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", display: "block" }} />}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, rgba(122,92,71,0.45) 0%, rgba(201,169,110,0.12) 50%, rgba(42,31,24,0.55) 100%)", mixBlendMode: "multiply" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(42,31,24,0.92) 0%, rgba(42,31,24,0.45) 40%, rgba(42,31,24,0) 70%)" }} />
              <div style={{ position: "absolute", inset: 0, opacity: 0.04, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`, backgroundSize: "180px 180px", pointerEvents: "none" }} />
            </div>
            <div style={{ position: "absolute", top: 0, left: 28, bottom: 0, zIndex: 2, width: 1, background: "rgba(201,169,110,0.3)" }} />
            <div style={{ position: "absolute", top: 90, left: "50%", transform: "translateX(-50%)", textAlign: "center", zIndex: 3 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "5rem", fontWeight: 300, color: cream, letterSpacing: "-0.04em", lineHeight: 1, opacity: 0.12, userSelect: "none" as const }}>{monogramLetters}</div>
            </div>
            {calloutAvailable && (
              <div style={{ position: "absolute", top: 100, right: 24, zIndex: 4, background: gold, color: ink, fontSize: "0.6rem", fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", padding: "8px 12px", textAlign: "center", lineHeight: 1.5, transform: "rotate(3deg)" }}>
                <PinIcon /><br />Callout<br />Available
              </div>
            )}
            <div style={{ position: "relative", zIndex: 3, padding: "0 28px 52px" }}>
              <p style={{ fontSize: "0.6rem", letterSpacing: "0.32em", textTransform: "uppercase", color: gold, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "inline-block", width: 28, height: 1, background: gold, opacity: 0.6 }} />{heroLabel}
              </p>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(2.8rem, 10vw, 5rem)", fontWeight: 300, lineHeight: 1.05, color: cream, marginBottom: 4 }}>{brandName}</h1>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(0.9rem, 3vw, 1.2rem)", fontWeight: 300, color: "rgba(245,237,227,0.55)", marginBottom: 10, letterSpacing: "0.04em" }}>{brandSubtitle}</p>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1rem, 4vw, 1.6rem)", fontWeight: 300, fontStyle: "italic", color: goldLt, marginBottom: 20, letterSpacing: "0.06em" }}>{motto}</p>
              <p style={{ fontSize: "0.78rem", lineHeight: 1.75, color: "rgba(245,237,227,0.5)", marginBottom: 36, maxWidth: 300 }}>{heroSubtext}</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                <a href="#booking" className="vl-btn-gold">Book a Session</a>
                <a href="#services" className="vl-btn-outline-cream">Our Services</a>
              </div>
            </div>
          </section>
        </EditSection>

        {/* STATS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: white, borderBottom: `1px solid rgba(201,169,110,0.2)` }}>
          {[
            { num: cheapest !== null ? fmt(cheapest) : "—", label: "Starts<br>From" },
            { num: services.length ? `${services.length}+` : "—", label: "Service<br>Types" },
            { num: null, label: calloutAvailable ? "Callout<br>Available" : "Studio<br>Only" },
            { num: city, label: (address.split(",")[0] || "Studio") },
          ].map((st, i) => (
            <div key={i} style={{ padding: "20px 12px", textAlign: "center", borderRight: i < 3 ? `1px solid rgba(201,169,110,0.2)` : "none" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 400, color: gold, marginBottom: 3, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 24 }}>
                {st.num !== null ? st.num : <PinIcon size={14} />}
              </div>
              <div style={{ fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase", color: mid, lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: st.label }} />
            </div>
          ))}
        </div>

        {/* SERVICE MEDIA SHOWCASE */}
        {services.length > 0 && (
          <section style={{ padding: "64px 24px 0", background: cream }} id="services">
            <p style={{ fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: gold, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "inline-block", width: 20, height: 1, background: gold, opacity: 0.5 }} />Our Craft
            </p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.9rem, 6vw, 2.8rem)", fontWeight: 300, color: ink, lineHeight: 1.15, marginBottom: 32 }}>Services by<br />{brandName}</h2>
            {grouped.map(({ cat, items }) => (
              <div key={cat} style={{ marginBottom: 40 }}>
                <p style={{ fontSize: "0.58rem", letterSpacing: "0.26em", textTransform: "uppercase", color: mid, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  {cat} Services<span style={{ flex: 1, height: 1, background: "rgba(201,169,110,0.3)" }} />
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                  {items.map((sv, i) => {
                    const wide = items.length % 2 === 1 && i === items.length - 1;
                    return (
                      <div key={sv.id} className={`vl-service-card${wide ? " wide" : ""}`}>
                        {sv.media_type === "video" && sv.media_url ? (
                          <video src={sv.media_url} autoPlay muted loop playsInline />
                        ) : sv.media_type === "image" && sv.media_url ? (
                          <img src={sv.media_url} alt={sv.name} onError={hideOnError} style={{ objectPosition: "center top" }} />
                        ) : (
                          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${warm} 0%, rgba(201,169,110,0.15) 100%)`, gap: 10 }}>
                            <PlayCameraIcon color={taupe} />
                            <div style={{ fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", color: taupe, opacity: 0.6, textAlign: "center", padding: "0 12px" }}>{sv.name}<br />Video / Photo</div>
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 4, background: "linear-gradient(to top, rgba(42,31,24,0.82) 0%, transparent 70%)", padding: "40px 14px 16px", pointerEvents: "none" as const }}>
                          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", fontWeight: 400, color: cream, lineHeight: 1.25, marginBottom: 4 }}>{sv.name}</div>
                          <div style={{ fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase", color: gold }}>{fmt(sv.price)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* SERVICE LIST */}
        {services.length > 0 && (
          <section style={{ padding: "56px 24px", background: white }}>
            <p style={{ fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: gold, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "inline-block", width: 20, height: 1, background: gold, opacity: 0.5 }} />In Detail
            </p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.9rem, 6vw, 2.8rem)", fontWeight: 300, color: ink, lineHeight: 1.15, marginBottom: 32 }}>Every Service,<br />Every Detail</h2>
            {services.map((sv, i) => (
              <div key={sv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 0", borderBottom: i < services.length - 1 ? `1px solid rgba(201,169,110,0.18)` : "none", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: gold, marginBottom: 4 }}>{sv.category || "General"}</div>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", fontWeight: 400, color: ink, lineHeight: 1.3 }}>{sv.name}</h3>
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem", fontWeight: 400, color: mocha, whiteSpace: "nowrap" as const, flexShrink: 0, paddingTop: 16 }}>{fmt(sv.price)}</div>
              </div>
            ))}
          </section>
        )}

        {/* CALLOUT BANNER */}
        {calloutAvailable && (
          <div style={{ background: mocha, padding: "40px 24px", textAlign: "center", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", fontFamily: "'Cormorant Garamond', serif", fontSize: "10rem", fontWeight: 300, color: "rgba(201,169,110,0.06)", right: -20, top: "50%", transform: "translateY(-50%)", lineHeight: 1, pointerEvents: "none" as const }}>{monogramLetters}</div>
            <p style={{ fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: gold, marginBottom: 12, position: "relative" }}>Callout Service</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.6rem, 6vw, 2.4rem)", fontWeight: 300, color: cream, marginBottom: 8, lineHeight: 1.2, position: "relative" }}>We Come to You</h2>
            <p style={{ fontSize: "0.78rem", color: "rgba(245,237,227,0.55)", lineHeight: 1.7, marginBottom: 24, position: "relative" }}>Can&apos;t make it to the studio? {brandName} offers a professional callout service — same quality, your location.</p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(201,169,110,0.12)", border: `1px solid rgba(201,169,110,0.3)`, padding: "10px 18px", marginBottom: 24, fontSize: "0.72rem", color: goldLt, letterSpacing: "0.1em", position: "relative" }}>
              <PinIcon /> {calloutArea}
            </div>
            <br />
            <a href="#booking" className="vl-btn-gold" style={{ position: "relative" }}>Book a Callout</a>
          </div>
        )}

        {/* BOOKING */}
        <section style={{ padding: "64px 24px", background: cream }} id="booking">
          <p style={{ fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: gold, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-block", width: 20, height: 1, background: gold, opacity: 0.5 }} />Reserve Your Session
          </p>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.9rem, 6vw, 2.8rem)", fontWeight: 300, color: ink, lineHeight: 1.15, marginBottom: 8 }}>Book Your<br />Appointment</h2>
          <p style={{ fontSize: "0.8rem", color: mid, lineHeight: 1.75, marginBottom: 28 }}>Choose {calloutAvailable ? "studio or callout, " : ""}pick your service, select a date and time. Simple.</p>

          {calloutAvailable && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginBottom: 24, border: `1px solid rgba(201,169,110,0.3)` }}>
              {(["studio", "callout"] as const).map(t => (
                <div key={t} className="vl-toggle-opt" onClick={() => setBookingType(t)} style={{ padding: "14px 16px", textAlign: "center", fontSize: "0.72rem", fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase", background: bookingType === t ? mocha : white, color: bookingType === t ? cream : mid }}>
                  {t === "studio" ? "Studio Visit" : "Callout Service"}
                </div>
              ))}
            </div>
          )}

          {services.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 22 }}>
              {services.map(sv => (
                <div key={sv.id} className="vl-bs-opt" onClick={() => setSelectedServiceId(sv.id)} style={{ padding: "11px 12px", textAlign: "center", background: selectedServiceId === sv.id ? mocha : white, color: selectedServiceId === sv.id ? cream : mid, border: `1px solid ${selectedServiceId === sv.id ? mocha : "rgba(201,169,110,0.25)"}`, fontSize: "0.7rem", lineHeight: 1.4 }}>
                  {sv.name}
                </div>
              ))}
            </div>
          )}

          <div style={{ background: white, border: `1px solid rgba(201,169,110,0.25)`, padding: "22px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.05rem", fontWeight: 400, color: ink }}>{MONTHS[calMonth.getMonth()]} {calMonth.getFullYear()}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="vl-cal-nav-btn" onClick={() => changeMonth(-1)} style={{ width: 30, height: 30, background: "none", border: `1px solid rgba(201,169,110,0.3)`, color: mid, fontSize: "0.85rem" }}>‹</button>
                <button className="vl-cal-nav-btn" onClick={() => changeMonth(1)} style={{ width: 30, height: 30, background: "none", border: `1px solid rgba(201,169,110,0.3)`, color: mid, fontSize: "0.85rem" }}>›</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(w => <div key={w} style={{ textAlign: "center", fontSize: "0.55rem", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: mid, padding: "5px 0" }}>{w}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={"e" + i} className="vl-cal-day vl-empty" style={{ aspectRatio: "1" }} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const thisDate = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
                const isPast = thisDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const isToday = thisDate.toDateString() === today.toDateString();
                const isSunday = thisDate.getDay() === 0;
                const ds = dateStr(calMonth.getFullYear(), calMonth.getMonth(), d);
                const takenCount = bookedByDate.get(ds)?.size || 0;
                const isFullyBooked = takenCount >= SLOTS.length;
                const isSelected = selectedDay === d;
                const disabled = isPast || isSunday || isFullyBooked;
                let cls = "vl-cal-day";
                if (isPast || isSunday) cls += " vl-past";
                else if (isFullyBooked) cls += " vl-booked";
                return (
                  <div key={d} className={cls} onClick={() => !disabled && selectDay(d)}
                    style={{
                      aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem",
                      cursor: disabled ? "default" : "pointer",
                      color: disabled ? "rgba(107,81,65,0.2)" : (isSelected ? cream : ink),
                      background: isSelected ? mocha : "transparent",
                      fontWeight: isToday ? 500 : 400,
                      borderBottom: isToday && !isSelected ? `2px solid ${gold}` : "none",
                      textDecoration: isFullyBooked ? "line-through" : "none",
                    }}>{d}</div>
                );
              })}
            </div>
          </div>

          {selectedDay && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: mid, marginBottom: 10 }}>Available Times — {selectedDay} {MONTHS[calMonth.getMonth()]} {calMonth.getFullYear()}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                {SLOTS.map(slot => {
                  const taken = takenForSelectedDay.has(slot);
                  return (
                    <div key={slot} className={`vl-slot${taken ? " vl-taken" : ""}`} onClick={() => !taken && setSelectedSlot(slot)}
                      style={{ padding: "10px 6px", textAlign: "center", background: selectedSlot === slot ? mocha : white, border: `1px solid ${selectedSlot === slot ? mocha : "rgba(201,169,110,0.25)"}`, fontSize: "0.72rem", color: taken ? "rgba(107,81,65,0.2)" : (selectedSlot === slot ? cream : mid), cursor: taken ? "default" : "pointer" }}>
                      {slot}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedSlot && !bookingConfirmed && (
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Your name" style={{ padding: "12px 14px", border: `1px solid rgba(201,169,110,0.25)`, background: white, fontFamily: "Jost, sans-serif", fontSize: "0.8rem", color: ink, outline: "none" }} />
              <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Your phone number" style={{ padding: "12px 14px", border: `1px solid rgba(201,169,110,0.25)`, background: white, fontFamily: "Jost, sans-serif", fontSize: "0.8rem", color: ink, outline: "none" }} />
              {bookingError && <div style={{ fontSize: "0.72rem", color: "#b3402a" }}>{bookingError}</div>}
            </div>
          )}

          {selectedSlot && !bookingConfirmed && (
            <button className="vl-btn-gold" onClick={confirmBooking} disabled={bookingSubmitting} style={{ width: "100%", padding: 15, fontSize: "0.72rem", fontWeight: 500, letterSpacing: "0.2em", textAlign: "center" }}>
              {bookingSubmitting ? "Booking…" : "Confirm Appointment"}
            </button>
          )}
          {bookingConfirmed && (
            <>
              <div style={{ width: "100%", padding: 15, background: mocha, color: cream, fontSize: "0.72rem", fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", textAlign: "center" }}>Appointment Requested ✓</div>
              <p style={{ fontSize: "0.68rem", color: mid, textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
                You will receive a confirmation within 24 hours.{whatsappNumber && (<> Or <a href={bookingWhatsappUrl()} target="_blank" rel="noreferrer" style={{ color: mocha, textDecoration: "underline" }}>message us on WhatsApp</a>.</>)}
              </p>
            </>
          )}
        </section>

        {/* PRICING */}
        {services.length > 0 && (
          <section style={{ padding: "64px 24px", background: warm }} id="pricing">
            <p style={{ fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: gold, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "inline-block", width: 20, height: 1, background: gold, opacity: 0.5 }} />Investment
            </p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.9rem, 6vw, 2.8rem)", fontWeight: 300, color: ink, lineHeight: 1.15, marginBottom: 32 }}>Clear,<br />Honest Pricing</h2>
            {grouped.map(({ cat, items }) => (
              <div key={cat} style={{ marginBottom: 32 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", fontWeight: 400, color: ink, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid rgba(201,169,110,0.35)`, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 3, height: 16, background: gold }} />{cat}
                </div>
                {items.map((sv, i) => (
                  <div key={sv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: i < items.length - 1 ? `1px solid rgba(201,169,110,0.12)` : "none", gap: 10 }}>
                    <span style={{ fontSize: "0.82rem", color: mid, flex: 1, minWidth: 0 }}>{sv.name}</span>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem", fontWeight: 400, color: mocha, flexShrink: 0, whiteSpace: "nowrap" as const }}>{fmt(sv.price)}</span>
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}

        {/* LOCATION */}
        <div style={{ background: mocha, padding: "48px 24px", textAlign: "center" }}>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", fontWeight: 300, color: cream, marginBottom: 8 }}>Visit the Studio</h3>
          <div style={{ width: 40, height: 1, background: gold, margin: "12px auto 16px", opacity: 0.6 }} />
          <p style={{ fontSize: "0.8rem", color: "rgba(245,237,227,0.65)", lineHeight: 1.85, marginBottom: 24 }}>
            {address.split(",").map((line, i) => <span key={i}>{line.trim()}<br /></span>)}
            {phone && <>{phone}<br /></>}
            {instagramHandle && <>@{instagramHandle}</>}
          </p>
          <a href={`https://maps.google.com/?q=${encodeURIComponent(address + ", " + city)}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", border: `1px solid ${gold}`, color: gold, fontSize: "0.7rem", fontWeight: 400, letterSpacing: "0.18em", textTransform: "uppercase", padding: "12px 28px" }}>Get Directions</a>
        </div>

        {/* FOOTER */}
        <EditSection id="footer">
          <footer style={{ background: ink, color: cream, fontFamily: "Jost, sans-serif" }}>
            <div style={{ padding: "52px 24px 36px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", fontWeight: 300, color: cream, marginBottom: 4 }}>{brandName}</div>
                <div style={{ fontSize: "0.62rem", letterSpacing: "0.28em", textTransform: "uppercase", color: gold, marginBottom: 10 }}>{brandSubtitle}</div>
                <p style={{ fontSize: "0.74rem", color: "rgba(245,237,227,0.3)", lineHeight: 1.7, marginBottom: 18 }}>{motto}</p>
                <div style={{ display: "flex", gap: 10 }}>
                  {instagramHandle && (
                    <a className="vl-social-btn" href={`https://instagram.com/${instagramHandle}`} target="_blank" rel="noreferrer" title="Instagram" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(201,169,110,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(245,237,227,0.35)" }}><InstagramIcon /></a>
                  )}
                  {tiktokHandle && (
                    <a className="vl-social-btn" href={`https://tiktok.com/@${tiktokHandle.replace(/\s+/g, "").replace(/^@/, "")}`} target="_blank" rel="noreferrer" title="TikTok" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(201,169,110,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(245,237,227,0.35)" }}><TikTokIcon /></a>
                  )}
                  {whatsappNumber && (
                    <a className="vl-social-btn" href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" title="WhatsApp" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(201,169,110,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(245,237,227,0.35)" }}><WhatsAppIcon /></a>
                  )}
                </div>
              </div>
              <div className="vl-footer-col">
                <h4 style={{ fontSize: "0.6rem", fontWeight: 500, letterSpacing: "0.24em", textTransform: "uppercase", color: gold, opacity: 0.7, marginBottom: 14 }}>Menu</h4>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                  <li><a href={sp("/")} style={{ fontSize: "0.76rem", color: "rgba(245,237,227,0.35)" }}>Home</a></li>
                  <li><a href="#services" style={{ fontSize: "0.76rem", color: "rgba(245,237,227,0.35)" }}>Services</a></li>
                  <li><a href="#pricing" style={{ fontSize: "0.76rem", color: "rgba(245,237,227,0.35)" }}>Pricing</a></li>
                  <li><a href="#booking" style={{ fontSize: "0.76rem", color: "rgba(245,237,227,0.35)" }}>Book Now</a></li>
                </ul>
              </div>
              <div className="vl-footer-col">
                <h4 style={{ fontSize: "0.6rem", fontWeight: 500, letterSpacing: "0.24em", textTransform: "uppercase", color: gold, opacity: 0.7, marginBottom: 14 }}>Shop &amp; Account</h4>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                  <li><a href="#booking" style={{ fontSize: "0.76rem", color: "rgba(245,237,227,0.35)" }}>Book an Appointment</a></li>
                  <li><a href="#pricing" style={{ fontSize: "0.76rem", color: "rgba(245,237,227,0.35)" }}>View Pricing</a></li>
                  {email && <li><a href={`mailto:${email}`} style={{ fontSize: "0.76rem", color: "rgba(245,237,227,0.35)" }}>Contact Us</a></li>}
                </ul>
              </div>
              <div className="vl-footer-col" style={{ gridColumn: "1 / -1" }}>
                <h4 style={{ fontSize: "0.6rem", fontWeight: 500, letterSpacing: "0.24em", textTransform: "uppercase", color: gold, opacity: 0.7, marginBottom: 14 }}>Visit Us</h4>
                <address style={{ fontStyle: "normal", fontSize: "0.76rem", color: "rgba(245,237,227,0.35)", lineHeight: 1.85 }}>
                  {address.split(",").map((line, i) => <span key={i}>{line.trim()}<br /></span>)}
                  {phone && <a href={`tel:+${phone.replace(/\D/g, "")}`} style={{ color: "rgba(245,237,227,0.35)" }}>{phone}</a>}
                </address>
                <div style={{ marginTop: 10, fontSize: "0.72rem", color: "rgba(245,237,227,0.28)", lineHeight: 1.75 }}>
                  Mon – Fri: {hours.weekdays}<br />
                  Saturday: {hours.saturday}<br />
                  Sunday: {hours.sunday}
                </div>
              </div>
            </div>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 12, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <p style={{ fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,237,227,0.15)" }}>© {new Date().getFullYear() || ""} {brandName} {brandSubtitle}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                {paymentMethods.map(m => <PayLogo key={m} id={m} />)}
              </div>
            </div>
          </footer>
        </EditSection>

        {/* LIVE CHAT */}
        <div style={{ position: "fixed", bottom: 24, right: 20, zIndex: 300, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          {chatOpen && (
            <div style={{ background: cream, border: `1px solid rgba(201,169,110,0.3)`, boxShadow: "0 8px 40px rgba(42,31,24,0.18)", width: 280, display: "flex", flexDirection: "column" }}>
              <div style={{ background: mocha, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: gold, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond', serif", fontSize: "0.8rem", color: ink, fontWeight: 500 }}>{monogramLetters}</div>
                  <div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 500, color: cream }}>{brandName} Studio</div>
                    <div style={{ fontSize: "0.6rem", color: "rgba(245,237,227,0.55)", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7BC67E" }} />Online now</div>
                  </div>
                </div>
                <button onClick={toggleChat} style={{ background: "none", border: "none", color: "rgba(245,237,227,0.5)", cursor: "pointer", fontSize: "1rem", padding: 4 }}>✕</button>
              </div>
              <div ref={chatBoxRef} style={{ padding: 14, background: white, minHeight: 130, display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                <div style={{ maxWidth: "82%", padding: "9px 12px", fontSize: "0.74rem", lineHeight: 1.55, background: warm, color: ink, alignSelf: "flex-start", borderLeft: `2px solid ${gold}` }}>
                  Hi! Welcome to {brandName}. How can we help you today?
                  <div style={{ fontSize: "0.54rem", color: taupe, marginTop: 3 }}>Just now</div>
                </div>
                {chatMessages.map((m, i) => (
                  <div key={i} style={{ maxWidth: "82%", padding: "9px 12px", fontSize: "0.74rem", lineHeight: 1.55, alignSelf: m.sender === "client" ? "flex-end" : "flex-start", background: m.sender === "client" ? mocha : warm, color: m.sender === "client" ? cream : ink, borderLeft: m.sender === "studio" ? `2px solid ${gold}` : "none" }}>
                    {m.text}
                    <div style={{ fontSize: "0.54rem", color: m.sender === "client" ? "rgba(245,237,227,0.6)" : taupe, marginTop: 3 }}>{m.time}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", borderTop: `1px solid rgba(201,169,110,0.2)`, background: white }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendChatMessage(); }} placeholder="Type your message..." style={{ flex: 1, padding: "11px 12px", border: "none", background: "transparent", fontFamily: "Jost, sans-serif", fontSize: "0.76rem", color: ink, outline: "none" }} />
                <button onClick={sendChatMessage} style={{ background: mocha, border: "none", padding: "11px 14px", color: cream, cursor: "pointer", fontSize: "0.85rem" }}>→</button>
              </div>
            </div>
          )}
          <button className="vl-chat-fab" onClick={toggleChat} title="Chat with us" style={{ width: 52, height: 52, background: mocha, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 20px rgba(122,92,71,0.45)", border: "none", position: "relative" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={cream}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>
            {chatHasBadge && (
              <div style={{ position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: gold, border: `2px solid ${cream}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.5rem", color: ink, fontWeight: 600 }}>1</div>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
