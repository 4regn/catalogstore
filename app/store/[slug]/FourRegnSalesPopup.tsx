"use client";

import { useEffect, useRef } from "react";

// Ported from the live Shopify theme's snippets/regn-sales-popup.liquid --
// see app/api/store/[slug]/sales-popup/route.ts for the data-source side of
// this port (Shopify Storefront GraphQL + an external Railway service on
// the old site, this seller's own products/orders tables here).
//
// This is a "recent purchase" notification popup: it mixes a small number
// of real recent orders with a much larger volume of algorithmically
// generated fake ones (random South African first names + weighted surname
// initials + random towns + randomized "N minutes ago" timestamps),
// displayed indistinguishably from genuine activity. Kept as a deliberate,
// direct port of the seller's own existing live behavior -- flagged to the
// seller before building this (fabricated social-proof notifications like
// this can implicate consumer-protection rules on false/misleading
// representations), not a design decision made unilaterally here.
//
// Structured as an imperative controller inside one big effect (refs for
// direct DOM writes: image preload-swap, progress-bar restart) rather than
// React state driving every frame, matching how the original vanilla-JS
// module operates -- it's fundamentally a self-contained timer/cycle
// system, not state-driven UI, and forcing it through React state would
// risk subtly changing the exact timing/behavior this port is meant to
// preserve.
//
// Loaded via next/dynamic (see FourRegnStore.tsx) and only rendered on
// mode="home"/mode="collection" -- same page-scoping as the original's
// `{% if template == 'index' or template.name == 'collection' %}` guard in
// theme.liquid.

const DISPLAY_MS = 10000;
const INTERVAL_MS = 10000;
const SESSION_KEY = "regn_popup_off";
const SEEN_ORDERS_KEY = "regn_popup_seen_v2";
const MAX_ORDER_VIEWS = 2;
const ORDER_TTL_MS = 60 * 60 * 1000;
const MIN_OFFSET_MINS = 3;
const MAX_OFFSET_MINS = 55;
const LOCAL_WEIGHT = 0.65;
const START_DELAY_MS = 2000;

type ApiProduct = { name: string; handle: string | null; image: string | null };
type ApiRealOrder = {
  displayName: string | null;
  city: string;
  product: string;
  handle: string | null;
  image: string | null;
  minutesAgo: number;
};
type PopupItem = {
  title: string;
  url: string;
  image: string | null;
  isReal: boolean;
  realName?: string;
  realCity?: string;
  minutesAgo?: number;
  offsetMs?: number;
  orderKey?: string;
};

function randomOffsetMs() {
  const mins = Math.floor(Math.random() * (MAX_OFFSET_MINS - MIN_OFFSET_MINS + 1)) + MIN_OFFSET_MINS;
  return mins * 60 * 1000;
}
function formatTimeAgo(mins: number | undefined) {
  if (mins === undefined || mins === null) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
}

// Weighted pool of common SA surname initials -- each popup draw picks a
// fresh random initial so "Sipho N" becomes "Sipho D" next time etc.
const SA_INITIALS = [
  "N", "N", "N", "N",
  "M", "M", "M", "M",
  "D", "D", "D",
  "S", "S", "S",
  "Z", "Z",
  "K", "K",
  "T", "T",
  "B", "B",
  "G", "G",
  "H",
  "L", "L",
  "V",
  "P", "P",
  "R",
  "C",
  "F",
  "X",
  "Q",
  "W",
  "J",
  "O",
  "E",
];
function randInitial() {
  return SA_INITIALS[Math.floor(Math.random() * SA_INITIALS.length)];
}

const NATIVE_FIRST_NAMES = [
  // Zulu
  "Sibusiso", "Nhlanhla", "Thando", "Nompumelelo", "Lungelo",
  "Nokwanda", "Siyanda", "Thembeka", "Mthokozisi", "Zanele",
  "Bongani", "Ntombifuthi", "Sphesihle", "Nokukhanya", "Mthunzi",
  "Nomcebo", "Sanele", "Hlengiwe", "Mpendulo", "Noxolo",
  "Sibonelo", "Zinhle", "Nkosinathi", "Phiwayinkosi", "Lungile",
  "Yenzokuhle", "Thulisile", "Mduduzi", "Nobuhle", "Siyethemba",
  "Mlondi", "Ntandokazi", "Snenhlanhla", "Lwandle", "Khanyisile",
  "Mthulisi", "Mpilonhle", "Gugulethu", "Nqobile", "Phumlani",
  "Lindani", "Nhlakanipho", "Minenhle", "Awande", "Snethemba",
  "Ndumiso", "Bandile", "Sazi", "Nolwazi", "Mfanukhona",
  "Siphephile", "Sinenhlanhla", "Kuhlesibonge",
  "Busisiwe", "Lindokuhle", "Nomfundo", "Themba",
  "Ntobeko", "Sfiso", "Zama", "Mthobisi",
  "Nozipho", "Nhlamulo", "Khethiwe", "Ntombizethu", "Lungisani",
  "Sibongile", "Thandolwethu", "Siyabonga", "Mthandazo", "Noxubeko",
  "Sihle", "Nokuthula", "Ntuthuko", "Zandile", "Nothando",
  "Nkosikhona", "Thamsanqa", "Buhlebuyeza", "Londiwe", "Nozicelo",
  "Nokukhanya", "Mthembeni", "Nokwanda", "Khulekani", "Nompumelelo",
  // Xhosa
  "Zintle", "Nomvula", "Lungisa", "Ntombizodwa",
  "Sikhona", "Ayanda", "Mlungisi", "Yolanda", "Noluthando",
  "Mzwandile", "Bulelwa", "Lusanda", "Ntsikelelo",
  "Nozipho", "Akhona", "Luyanda", "Nomhle", "Zukiswa",
  "Wandisile", "Nwabisa", "Siyabulela", "Thandiswa", "Litha",
  "Thozama", "Onele", "Vuyiseka", "Mawande", "Zimasa",
  "Aphelele", "Sandisiwe", "Sinovuyo", "Sisipho", "Chuma",
  "Xhanti", "Liso", "Melikhaya", "Malibongwe",
  "Sipho", "Lukhanyo", "Andile", "Anathi", "Bulelani",
  "Nomsa", "Lulama", "Sinethemba", "Olwethu", "Unathi",
  "Lwandile", "Vuyokazi", "Zukisa", "Khanyisa",
  "Thandeka", "Sivuyile", "Yonela", "Bongiwe", "Sipokazi",
  "Nozuko", "Ayabonga", "Kwezi", "Noluvuyo", "Sonwabo",
  "Thobeka", "Nandipha", "Phiwokazi", "Amahle", "Sinesipho",
  "Luxolo", "Zikhona", "Nolwandle", "Phiwe", "Songezo",
  "Asanda", "Mthunzi",
  // Sesotho
  "Teboho", "Mpho", "Kefilwe", "Lerato", "Kagiso",
  "Palesa", "Thabo", "Mmabatho", "Dineo", "Lefika",
  "Reitumetse", "Boitumelo", "Tshepiso", "Moipone", "Nthabi",
  "Katlego", "Refiloe", "Pontsho", "Tumelo", "Khothatso",
  "Mojalefa", "Tiisetso", "Nthabiseng", "Limakatso", "Sechaba",
  "Kamohelo", "Lethabo", "Tsepiso", "Bokang", "Pheello",
  "Thoriso", "Mathabo", "Khotso", "Lineo", "Puleng",
  "Lehlohonolo", "Rethabile", "Puseletso", "Mamello", "Moeketsi",
  // Setswana
  "Gorata", "Onkabetse", "Phenyo", "Gaone", "Tebatso",
  "Lorato", "Mmoloki", "Botshelo", "Keitumetse", "Oratile",
  "Tlotlo", "Gontse", "Modiri", "Boago", "Masego",
  "Tsholofelo", "Kealeboga", "Obakeng", "Onthatile",
  "Kabelo", "Karabo", "Kamogelo", "Gopolang", "Keabetswe",
  "Ofentse", "Phemelo", "Kemisetso", "Osiame", "Atlegang",
  "Goitseone", "Olebogeng", "Neo", "Onalenna", "Bontle",
  "Tebogo", "Thato", "Motheo",
  "Regomoditswe", "Ntlotleng", "Bakang", "Dikeledi", "Segomotsi",
  "Tshiamo", "Ipeleng", "Kgalalelo", "Boineelo", "Goabaone",
  "Thatayaone", "Nametso", "Kedisaletse", "Olebile", "Seabelo",
  "Nkele", "Gaelebale", "Motshidisi", "Lesego", "Lesedi",
  // Sepedi
  "Kgomotso", "Lebogang", "Refilwe", "Tshepo", "Bonolo",
  "Mokgadi", "Lesego", "Matlakala", "Phuti", "Ntshepeng",
  "Kgaogelo", "Sefako", "Mabatho", "Tšhegofatso",
  "Dimakatso", "Nkgopoleng", "Lehlogonolo", "Thaselo",
  // Venda
  "Murendeni", "Tshifhiwa", "Vhonani", "Livhuwani", "Mulalo",
  "Mashudu", "Pfano", "Thandeka", "Rotondwa", "Nndivhaleni",
  "Khulekani", "Maanda", "Lutendo", "Zwivhuya", "Fhulufhelo",
  "Tshidaho", "Dziedzom", "Thifhelimbilu", "Muofhe", "Ndivhuwo",
  "Vhusani",
  // Tsonga
  "Hlayisani", "Tinyiko", "Vonani", "Xolile", "Nhlamulo",
  "Fikile", "Marito", "Rirhandzu", "Nkateko", "Hlanganani",
  "Pfuxelani", "Vangile", "Shandukani", "Xivuri", "Pfumayani",
  "Dzivaguru", "Nghonyama", "Mavhunga", "Risimati", "Tsakani",
  // Swati
  "Sifiso", "Nompilo", "Sibonelo", "Buhle",
  "Thokozile", "Makhosazane", "Nothando", "Siphamandla", "Lindiwe",
  "Bongekile", "Simangele", "Nokufa", "Mthembeni", "Ntfombi",
  "Siphiwe", "Nokuthula", "Sandile", "Phindile",
  // Ndebele
  "Mthokozisi", "Zanokuhle", "Sakhile",
  "Lungisani", "Nokubonga", "Lungani",
  "Sithembiso", "Qhawe", "Ntombenhle", "Sibonokuhle", "Mfanafuthi",
  "Siyabonga", "Ntombizethu", "Mthandazo", "Zithulele",
  "Nompumelelo", "Zithulele",
];

const ENGLISH_FIRST_NAMES = [
  "Shanique", "Rowan", "Tamsin", "Dario", "Jade",
  "Chantal", "Kyle", "Monique", "Warren", "Lesley-Ann",
  "Brandon", "Natasha", "Grant", "Candice", "Ryan",
  "Clive", "Marlon", "Shereece", "Randall", "Venessa",
  "Reginald", "Tristan", "Ashleigh", "Clinton", "Donovan",
  "Beverley", "Hilton", "Dale", "Nathaniel", "Mikayla",
  "Geshen", "Promise", "Simon", "Gift", "Lucky",
];

const PROVINCE_TOWNS: Record<string, string[]> = {
  "KwaZulu-Natal": [
    "Durban", "Pietermaritzburg", "Richards Bay", "Newcastle", "Empangeni",
    "Ladysmith", "Port Shepstone", "Margate", "Ballito", "Amanzimtoti",
    "KwaMashu", "Tongaat", "Stanger", "Eshowe", "Mtubatuba",
    "Pongola", "Glencoe", "Dundee", "Madadeni", "Dannhauser",
    "Harding", "Ixopo", "Scottburgh", "Hibberdene", "Umzinto",
    "Park Rynie", "Bergville", "Colenso", "Estcourt", "Greytown",
    "Nongoma", "Vryheid", "Utrecht", "Paulpietersburg", "Mkuze",
    "Newlands East", "Hlabisa", "Sakhole", "Dalton",
  ],
  "Gauteng": [
    "Johannesburg", "Pretoria", "Sandton", "Midrand", "Centurion",
    "Soweto", "Roodepoort", "Germiston", "Benoni", "Boksburg",
    "Vosloorus", "Thokoza", "Daveyton", "Tembisa", "Soshanguve",
    "Mamelodi", "Atteridgeville", "Hammanskraal", "Cullinan", "Randfontein",
    "Katlehong", "Sebokeng", "Evaton", "Carletonville", "Modderfontein",
    "Brakpan", "Springs", "Nigel", "Heidelberg", "Alberton",
    "Edenvale", "Kempton Park", "Devon", "Bronkhorstspruit", "Lenasia",
    "Krugersdorp", "Westonaria", "Fleurhof", "Ekangala", "Temba",
    "KwaThema", "Bekkersdal",
  ],
  "Eastern Cape": [
    "Port Elizabeth", "Gqeberha", "East London", "Mthatha", "Queenstown",
    "King William's Town", "Grahamstown", "Uitenhage", "Humansdorp",
    "Jeffrey's Bay", "Komani", "Mdantsane", "Butterworth", "Maclear",
    "Sterkspruit", "Lady Frere", "Cofimvaba", "Tsolo", "Lusikisiki",
    "Dutywa", "Ngcobo", "Idutywa", "Port St Johns", "Flagstaff",
    "Elliotdale", "Willowvale", "Kentani", "Whittlesea",
    "Aliwal North", "Burgersdorp", "Cradock", "Somerset East",
    "Dordrecht", "Mount Fletcher", "Ntabankulu",
  ],
  "Limpopo": [
    "Polokwane", "Tzaneen", "Phalaborwa", "Lephalale", "Bela-Bela",
    "Mokopane", "Louis Trichardt", "Thohoyandou", "Musina", "Thabazimbi",
    "Giyani", "Modimolle", "Mankweng", "Lebowakgomo", "Burgersfort",
    "Seshego", "Marble Hall", "Jane Furse", "Nebo", "Dendron", "Northam",
  ],
  "Mpumalanga": [
    "Nelspruit", "Mbombela", "Witbank", "Middelburg", "Secunda", "Standerton",
    "Ermelo", "White River", "Hazyview", "Sabie", "Barberton",
    "Bushbuckridge", "Bethal", "Lydenburg", "Carolina", "Piet Retief",
    "Thulamahashe", "Leandra", "Kamaqhekeza",
  ],
  "North West": [
    "Rustenburg", "Klerksdorp", "Mahikeng", "Mmabatho", "Potchefstroom", "Brits",
    "Vryburg", "Lichtenburg", "Zeerust", "Wolmaransstad", "Stilfontein",
    "Delareyville", "Swartruggens", "Koster", "Schweizer-Reneke", "Jouberton",
    "Bloemhof", "Makwassie",
  ],
  "Free State": [
    "Bloemfontein", "Welkom", "Kroonstad", "Sasolburg", "Bethlehem",
    "Harrismith", "Phuthaditjhaba", "Parys", "Virginia", "Odendaalsrus",
    "Botshabelo", "Ficksburg", "Fouriesburg", "Ladybrand", "Wepener",
    "Zastron", "Meloding", "Roodewal",
  ],
  "Northern Cape": [
    "Kimberley", "Upington", "Springbok", "Kuruman", "De Aar",
    "Calvinia", "Kathu", "Prieska", "Colesberg", "Carnarvon",
    "Kakamas", "Keimoes", "Hanover", "Victoria West", "Loxton",
    "Jan Kempdorp", "Pella", "Doringbaai",
  ],
  "Western Cape": [
    "Cape Town", "Stellenbosch", "Paarl", "George", "Knysna",
    "Worcester", "Hermanus", "Mossel Bay", "Oudtshoorn", "Bellville",
    "Khayelitsha", "Mitchells Plain", "Gugulethu", "Delft", "Grabouw",
    "Swellendam", "Bredasdorp", "Malmesbury", "Vredenburg", "Saldanha",
    "Robertson", "Montagu", "Ceres", "Tulbagh", "Villiersdorp",
    "Milnerton", "Parow", "Philippi East",
  ],
};
const ALL_TOWNS = Object.values(PROVINCE_TOWNS).flat();

const PROVINCE_MAP: Record<string, string> = {
  "kwazulu-natal": "KwaZulu-Natal", "kwazulu natal": "KwaZulu-Natal", "kzn": "KwaZulu-Natal",
  "gauteng": "Gauteng", "eastern cape": "Eastern Cape", "limpopo": "Limpopo",
  "mpumalanga": "Mpumalanga", "north west": "North West", "northwest": "North West",
  "free state": "Free State", "northern cape": "Northern Cape", "western cape": "Western Cape",
};
function normaliseProvince(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return PROVINCE_MAP[raw.toLowerCase().trim()] || null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeQueue<T>(arr: T[]) {
  let pool = shuffle(arr);
  let idx = 0;
  return {
    next(): T {
      if (idx >= pool.length) { pool = shuffle(arr); idx = 0; }
      return pool[idx++];
    },
  };
}
function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function FourRegnSalesPopup({ slug, isSubdomain }: { slug: string; isSubdomain: boolean }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const whoRef = useRef<HTMLDivElement>(null);
  const prodRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dismissed = false;
    let cycleTimer: ReturnType<typeof setInterval> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let controller: { next: () => PopupItem } | null = null;
    let visitorProvince: string | null = null;
    let cancelled = false;

    const sp = (path: string) => (isSubdomain ? path : `/store/${slug}${path}`);

    function detectProvince() {
      fetch("https://ipapi.co/json/")
        .then((r) => r.json())
        .then((d) => { visitorProvince = normaliseProvince(d.region); })
        .catch(() => {});
    }

    const nationalQueue = makeQueue(ALL_TOWNS);
    function pickFreeTown() {
      if (visitorProvince && PROVINCE_TOWNS[visitorProvince] && Math.random() < LOCAL_WEIGHT) {
        return rand(PROVINCE_TOWNS[visitorProvince]);
      }
      return nationalQueue.next();
    }

    const nativeQueue = makeQueue(NATIVE_FIRST_NAMES);
    const englishQueue = makeQueue(ENGLISH_FIRST_NAMES);
    function pickNameAndTown() {
      const firstName = Math.random() < 0.8 ? nativeQueue.next() : englishQueue.next();
      return { name: `${firstName} ${randInitial()}`, town: pickFreeTown() };
    }

    function getSeenOrders(): Record<string, { firstSeen: number; views: number }> {
      try {
        const raw = localStorage.getItem(SEEN_ORDERS_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw);
        const now = Date.now();
        const clean: Record<string, { firstSeen: number; views: number }> = {};
        for (const [key, val] of Object.entries(data) as [string, { firstSeen: number; views: number }][]) {
          if (now - val.firstSeen < ORDER_TTL_MS) clean[key] = val;
        }
        if (Object.keys(clean).length !== Object.keys(data).length) {
          localStorage.setItem(SEEN_ORDERS_KEY, JSON.stringify(clean));
        }
        return clean;
      } catch { return {}; }
    }
    function shouldShowOrder(k: string) {
      const s = getSeenOrders();
      return !s[k] || s[k].views < MAX_ORDER_VIEWS;
    }
    function markOrderSeen(k: string) {
      try {
        const s = getSeenOrders();
        s[k] = s[k] ? { ...s[k], views: s[k].views + 1 } : { firstSeen: Date.now(), views: 1 };
        localStorage.setItem(SEEN_ORDERS_KEY, JSON.stringify(s));
      } catch {}
    }

    function makeProductController(winterQueue: ReturnType<typeof makeQueue<PopupItem>>, wowQueue: ReturnType<typeof makeQueue<PopupItem>>) {
      let step = 0;
      return {
        next(): PopupItem {
          const isWow = step === 2;
          step = (step + 1) % 3;
          return isWow ? wowQueue.next() : winterQueue.next();
        },
      };
    }
    function makeHybridController(realOrders: PopupItem[], productCtrl: { next: () => PopupItem }) {
      const real = shuffle(realOrders);
      let realIdx = 0;
      let nextIsReal = real.length > 0;
      return {
        next(): PopupItem {
          if (nextIsReal && realIdx < real.length) {
            const item = real[realIdx++];
            if (item.orderKey) markOrderSeen(item.orderKey);
            nextIsReal = false;
            return item;
          }
          nextIsReal = false;
          return productCtrl.next();
        },
      };
    }

    function showPopup() {
      if (dismissed || !controller) return;
      const wrapper = wrapperRef.current, link = linkRef.current, imgWrap = imgWrapRef.current;
      const imgEl = imgRef.current, whoEl = whoRef.current, prodEl = prodRef.current;
      const timeEl = timeRef.current, bar = barRef.current;
      if (!wrapper || !link || !imgWrap || !imgEl || !whoEl || !prodEl || !timeEl || !bar) return;

      const item = controller.next();
      let name: string, city: string;
      if (item.isReal) {
        name = item.realName!;
        city = item.realCity!;
      } else {
        const p = pickNameAndTown();
        name = p.name;
        city = p.town;
      }

      link.href = item.url || "#";
      imgEl.style.display = "none";
      imgEl.src = "";
      imgWrap.classList.add("loading");
      if (item.image) {
        const tmp = new window.Image();
        tmp.onload = () => { imgEl.src = item.image as string; imgEl.style.display = "block"; imgWrap.classList.remove("loading"); };
        tmp.onerror = () => imgWrap.classList.remove("loading");
        tmp.src = item.image;
      } else {
        imgWrap.classList.remove("loading");
      }

      const displayMins = item.isReal ? item.minutesAgo : Math.round((item.offsetMs || 0) / 60000);
      whoEl.innerHTML = `<strong>${name}</strong> in ${city} purchased`;
      prodEl.textContent = item.title;
      timeEl.textContent = formatTimeAgo(displayMins);

      bar.classList.remove("running");
      bar.style.setProperty("--dur", DISPLAY_MS / 1000 + "s");
      void bar.offsetWidth; // restart the CSS drain animation
      bar.classList.add("running");
      wrapper.classList.add("visible");
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => wrapper.classList.remove("visible"), DISPLAY_MS);
    }

    function dismiss() {
      dismissed = true;
      if (hideTimer) clearTimeout(hideTimer);
      if (cycleTimer) clearInterval(cycleTimer);
      wrapperRef.current?.classList.remove("visible");
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
    }

    const closeBtn = wrapperRef.current?.querySelector<HTMLButtonElement>("#regn-popup-close");
    const onCloseClick = (e: Event) => { e.preventDefault(); e.stopPropagation(); dismiss(); };
    closeBtn?.addEventListener("click", onCloseClick);

    try { if (sessionStorage.getItem(SESSION_KEY)) dismissed = true; } catch {}

    if (!dismissed) {
      detectProvince();
      fetch(`/api/store/${slug}/sales-popup`)
        .then((r) => r.json())
        .then(async (data: { winterProducts: ApiProduct[]; wowProducts: ApiProduct[]; realOrders: ApiRealOrder[] }) => {
          if (cancelled) return;
          const toPopupItem = (p: ApiProduct): PopupItem => ({
            title: p.name,
            image: p.image,
            url: p.handle ? sp(`/products/${p.handle}`) : sp("/collections/winter-essentials"),
            isReal: false,
            offsetMs: randomOffsetMs(),
          });
          const winterProducts = (data.winterProducts || []).map(toPopupItem);
          const wowProducts = (data.wowProducts || []).map(toPopupItem);
          if (!winterProducts.length && !wowProducts.length) return;

          const realOrders: PopupItem[] = (data.realOrders || [])
            .filter((o) => o.displayName && shouldShowOrder(`${o.displayName}::${o.product}`))
            .map((o) => ({
              title: o.product,
              image: o.image,
              url: o.handle ? sp(`/products/${o.handle}`) : sp("/collections/winter-essentials"),
              isReal: true,
              realName: o.displayName!,
              realCity: o.city,
              minutesAgo: o.minutesAgo,
              orderKey: `${o.displayName}::${o.product}`,
            }));

          const winterQueue = makeQueue(winterProducts);
          const wowQueue = makeQueue(wowProducts.length ? wowProducts : winterProducts);
          const productCtrl = makeProductController(winterQueue, wowQueue);
          controller = makeHybridController(realOrders, productCtrl);

          setTimeout(() => {
            if (cancelled) return;
            showPopup();
            cycleTimer = setInterval(showPopup, INTERVAL_MS);
          }, START_DELAY_MS);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
      if (cycleTimer) clearInterval(cycleTimer);
      closeBtn?.removeEventListener("click", onCloseClick);
    };
  }, [slug, isSubdomain]);

  return (
    <div id="regn-popup-wrapper" ref={wrapperRef}>
      <a id="regn-popup-link" ref={linkRef} href="#" target="_blank" rel="noopener noreferrer">
        <div id="regn-popup-card">
          <div className="regn-popup-inner">
            <div className="regn-popup-img-wrap" id="regn-popup-img-wrap" ref={imgWrapRef}>
              {/* Deliberately a plain <img>, not next/image -- showPopup()
                  above swaps its .src imperatively via a manual preload
                  (new Image() + onload) so the loading spinner only clears
                  once the real photo is ready, same technique the original
                  Liquid used. next/image's declarative src prop doesn't fit
                  that swap-after-preload control. */}
              <img className="regn-popup-img" id="regn-popup-img" ref={imgRef} src="" alt="" style={{ display: "none" }} />
            </div>
            <div className="regn-popup-text">
              <div className="regn-popup-who" id="regn-popup-who" ref={whoRef} />
              <div className="regn-popup-product" id="regn-popup-product" ref={prodRef} />
              <div className="regn-popup-time" id="regn-popup-time" ref={timeRef} />
            </div>
          </div>
          <div className="regn-popup-progress">
            <div className="regn-popup-bar" id="regn-popup-bar" ref={barRef} />
          </div>
        </div>
      </a>
      <button id="regn-popup-close" aria-label="Close notification">✕</button>
    </div>
  );
}
