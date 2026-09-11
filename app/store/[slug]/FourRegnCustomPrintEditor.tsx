"use client";

import { useImperativeHandle, useRef, useState, forwardRef } from "react";

// Interactive artwork placement tool for 4regn's Custom Upload Studio
// products -- ported from UNIK Labs' own Step 3 tool
// (public/private-templates/unik-labs/upload.html) as closely as the two
// platforms' different architecture allows. Same core mechanics: a
// draggable "design layer" box on top of the garment photo, one
// bottom-right resize handle (aspect-ratio locked, width-driven), three
// corner buttons (change/remove/crop), a separate crop modal, and a
// front/back flip.
//
// Two pieces are ported byte-for-byte from upload.html rather than
// re-derived, because getting them wrong is exactly what broke the first
// version of this editor:
//
// 1. Print zone calibration (PRINT_ZONE below) -- upload.html's
//    CAL_DEFAULTS_BY_MODE table holds real, hand-calibrated percentages
//    per garment/side/colour against the exact same photos this file
//    uses (they were copied byte-for-byte from UNIK's own asset files --
//    see FourRegnStore.tsx's CUSTOM_PRINT_FRONT_TAG comment). A single
//    generic zone doesn't line up with the actual chest-print area on
//    every one of these photos, so artwork could be resized right off
//    the garment.
// 2. The flip's counter-rotation -- upload.html's updateStageView()
//    doesn't just rotate the outer card 0<->180deg, it also snaps the
//    INNER stage to the opposite rotation the instant the content swaps
//    (no transition). card(180) + stage(180) = 360deg, which reads
//    identically to 0deg -- that's what keeps back-view artwork and any
//    on-garment text un-mirrored. Rotating only the outer card (what the
//    first version of this editor did) leaves the back view mirrored.
//
// Deliberately NOT ported: the elastic drag-to-flip gesture (UNIK
// supports both click AND drag-to-flip; this is click-only, same visual
// result once flipped, less interaction surface to get right blind).
//
// State (url/x/y/w/h/ar per side) is owned here, not lifted to the
// parent -- FourRegnStore.tsx only needs a readiness check and a capture()
// call at Add to Cart time (see the exposed handle), mirroring exactly
// when UNIK's own captureCustomPreview() runs: once, at checkout-intent,
// never continuously while dragging.

type Side = "front" | "back";
type Garment = "hoodie" | "tee" | "cap";
type SideState = { url: string | null; x: number; y: number; w: number; h: number; ar: number };
const BLANK_SIDE: SideState = { url: null, x: 0, y: 0, w: 0, h: 0, ar: 1 };

// Ported verbatim (light theme only -- 4regn only ever uses UNIK's
// light-mode photo set) from upload.html's CAL_DEFAULTS_BY_MODE, hoodie
// and tee entries only (the other modes there are UNIK-only variants
// this catalog doesn't sell -- tee-budget, on-model shoots). wP/hP are
// the zone's width/height as a fraction of the stage box; cxP is the
// zone's horizontal center as a fraction of stage width; tP is the
// zone's top edge as a fraction of stage height.
//
// `clip`, when present, is the print panel's real outline (e.g. a cap's
// arched front panel) as an ordered list of points in the same
// stage-fraction terms, traced with the print-zone-calibrator tool. It's
// what actually masks the uploaded artwork; wP/hP/cxP/tP above are still
// kept in sync with its bounding box so the existing drag/resize/clamp
// logic (which only ever deals in rectangles) needs no changes -- the
// design layer is free to move/resize anywhere in that bounding box, and
// the clip shape (rendered relative to the design layer's current
// position, see getZoneClip/renders below) trims it down to the true
// panel edge wherever it currently overlaps.
type ZoneCal = { wP: number; hP: number; cxP: number; tP: number; clip?: { x: number; y: number }[] };
const PRINT_ZONE: Record<Garment, Record<Side, Record<string, ZoneCal>>> = {
  hoodie: {
    front: {
      black: { wP: 0.3328, hP: 0.1955, cxP: 0.4957, tP: 0.3477 },
      white: { wP: 0.3328, hP: 0.2045, cxP: 0.4957, tP: 0.3409 },
      beige: { wP: 0.3328, hP: 0.2045, cxP: 0.4957, tP: 0.3193 },
    },
    // Same rectangle for every colour -- the back-hoodie photo set shares
    // one framing/zoom across all three colours (see upload.html comment).
    back: {
      black: { wP: 0.4, hP: 0.3, cxP: 0.505, tP: 0.395 },
      white: { wP: 0.4, hP: 0.3, cxP: 0.505, tP: 0.395 },
      beige: { wP: 0.4, hP: 0.3, cxP: 0.505, tP: 0.395 },
    },
  },
  tee: {
    // Black/white use the square (1254x1254) flat-lay; beige is the
    // original 2:3 portrait photo -- different calibration per upload.html.
    front: {
      black: { wP: 0.3754, hP: 0.5, cxP: 0.5123, tP: 0.32 },
      white: { wP: 0.3754, hP: 0.5, cxP: 0.5123, tP: 0.32 },
      beige: { wP: 0.3853, hP: 0.352, cxP: 0.5044, tP: 0.4565 },
    },
    // Same 2:3 portrait photo for every colour.
    back: {
      black: { wP: 0.3735, hP: 0.3833, cxP: 0.4985, tP: 0.415 },
      white: { wP: 0.3735, hP: 0.3833, cxP: 0.4985, tP: 0.415 },
      beige: { wP: 0.3735, hP: 0.3833, cxP: 0.4985, tP: 0.415 },
    },
  },
  // Traced directly off the actual cap photo with the print-zone-calibrator
  // tool -- an arched front panel, not a rectangle, so `clip` carries the
  // real outline (wP/hP/cxP/tP are just its bounding box, kept for the
  // shared rect-based placement math -- see the ZoneCal comment above).
  // Caps only ever sell as CUSTOM_PRINT_FRONT_TAG (front only, no flip), so
  // "back" here is never rendered -- it's a copy of "front" purely to
  // satisfy the Record<Side, ...> shape. Only one colour calibrated so
  // far; re-run the calibrator per colour if other cap colours' panels
  // sit differently and add entries here the same way hoodie/tee do.
  cap: {
    front: {
      black: {
        wP: 0.5359, hP: 0.3115, cxP: 0.5027, tP: 0.2916,
        clip: [
          { x: 0.2347, y: 0.6031 }, { x: 0.4829, y: 0.5868 }, { x: 0.7680, y: 0.6021 },
          { x: 0.7706, y: 0.5232 }, { x: 0.7691, y: 0.4306 }, { x: 0.7262, y: 0.3411 },
          { x: 0.6159, y: 0.3075 }, { x: 0.5246, y: 0.2937 }, { x: 0.4806, y: 0.2916 },
          { x: 0.4215, y: 0.2995 }, { x: 0.3755, y: 0.3095 }, { x: 0.2915, y: 0.3442 },
          { x: 0.2584, y: 0.3725 }, { x: 0.2363, y: 0.4010 }, { x: 0.2353, y: 0.4294 },
          { x: 0.2360, y: 0.4863 },
        ],
      },
    },
    back: {
      black: {
        wP: 0.5359, hP: 0.3115, cxP: 0.5027, tP: 0.2916,
        clip: [
          { x: 0.2347, y: 0.6031 }, { x: 0.4829, y: 0.5868 }, { x: 0.7680, y: 0.6021 },
          { x: 0.7706, y: 0.5232 }, { x: 0.7691, y: 0.4306 }, { x: 0.7262, y: 0.3411 },
          { x: 0.6159, y: 0.3075 }, { x: 0.5246, y: 0.2937 }, { x: 0.4806, y: 0.2916 },
          { x: 0.4215, y: 0.2995 }, { x: 0.3755, y: 0.3095 }, { x: 0.2915, y: 0.3442 },
          { x: 0.2584, y: 0.3725 }, { x: 0.2363, y: 0.4010 }, { x: 0.2353, y: 0.4294 },
          { x: 0.2360, y: 0.4863 },
        ],
      },
    },
  },
};

export type FourRegnCustomPrintCapture = {
  frontRawDataUrl: string;
  backRawDataUrl?: string;
  frontPreviewDataUrl: string;
  backPreviewDataUrl?: string;
};

export interface FourRegnCustomPrintEditorHandle {
  isReady: () => boolean;
  capture: () => Promise<FourRegnCustomPrintCapture | null>;
  reset: () => void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Downsizes anything absurdly large before it ever sits in state/gets
// uploaded -- same reasoning as UNIK's own compressArtwork: this is about
// not shipping a 12MB phone photo around, not about print quality (the
// upload API's own 20MB cap is the hard limit either way).
async function compressArtwork(dataUrl: string, mime: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const maxDim = 3000;
  if (img.naturalWidth <= maxDim && img.naturalHeight <= maxDim) return dataUrl;
  const scale = maxDim / Math.max(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mime === "image/png" ? "image/png" : "image/jpeg", 0.9);
}

interface Props {
  frontGarmentImage: string;
  backGarmentImage?: string;
  garment: Garment;
  colour?: string;
  onErrorMessage?: (message: string) => void;
}

const FourRegnCustomPrintEditor = forwardRef<FourRegnCustomPrintEditorHandle, Props>(function FourRegnCustomPrintEditor(
  { frontGarmentImage, backGarmentImage, garment, colour, onErrorMessage },
  ref
) {
  const both = !!backGarmentImage;
  const [curView, setCurView] = useState<Side>("front");
  const [flipRot, setFlipRot] = useState(0);
  const [sides, setSides] = useState<{ front: SideState; back: SideState }>({ front: { ...BLANK_SIDE }, back: { ...BLANK_SIDE } });
  const [controlsVisible, setControlsVisible] = useState(true);
  const [stageAspect, setStageAspect] = useState<{ front: number; back: number }>({ front: 3 / 4, back: 3 / 4 });
  const [cropOpen, setCropOpen] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const cropNaturalRef = useRef({ w: 0, h: 0 });
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ mode: "move" | "resize"; pointerId: number; mx: number; my: number; x: number; y: number; w: number; h: number } | null>(null);
  const cropDragRef = useRef<{ mode: "move" | "resize-tl" | "resize-tr" | "resize-bl" | "resize-br"; pointerId: number; mx: number; my: number; x: number; y: number; w: number; h: number } | null>(null);

  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);

  const zoneColour = (colour || "black").toLowerCase();

  const getZoneRect = (view: Side) => {
    const stage = stageRef.current;
    const w = stage?.clientWidth || 320;
    const h = stage?.clientHeight || 320;
    const table = PRINT_ZONE[garment][view];
    const cfg = table[zoneColour] || table.black;
    const zw = w * cfg.wP;
    const zh = h * cfg.hP;
    const zx = w * cfg.cxP - zw / 2;
    const zy = h * cfg.tP;
    return { x: zx, y: zy, w: zw, h: zh };
  };

  // The zone's true (possibly non-rectangular) outline, in absolute stage
  // pixels -- null for garments whose print area is just the plain
  // rectangle from getZoneRect (hoodie/tee). Points stay in stage-absolute
  // terms here; callers translate them into whatever element's local box
  // they're clipping (the moving design layer, or the fixed empty-state
  // button) by subtracting that element's own x/y.
  const getZoneClip = (view: Side): { x: number; y: number }[] | null => {
    const stage = stageRef.current;
    const w = stage?.clientWidth || 320;
    const h = stage?.clientHeight || 320;
    const table = PRINT_ZONE[garment][view];
    const cfg = table[zoneColour] || table.black;
    if (!cfg.clip) return null;
    return cfg.clip.map((p) => ({ x: p.x * w, y: p.y * h }));
  };

  const clipPathStyle = (clip: { x: number; y: number }[] | null, originX: number, originY: number): React.CSSProperties | undefined =>
    clip ? { clipPath: `polygon(${clip.map((p) => `${(p.x - originX).toFixed(2)}px ${(p.y - originY).toFixed(2)}px`).join(", ")})` } : undefined;

  // The calibration percentages above assume the stage box's own aspect
  // ratio exactly matches the photo (no letterbox/crop) -- upload.html
  // achieves that by setting the stage's CSS aspect-ratio per photo
  // (frontAspect()). Same idea here, measured at runtime off the actual
  // loaded image instead of hardcoded per file, so it's correct
  // regardless of the exact pixel dimensions of these copied assets.
  const onGarmentLoad = (view: Side, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    setStageAspect((prev) => (prev[view] === ratio ? prev : { ...prev, [view]: ratio }));
  };

  const fitIntoZone = (view: Side, url: string, ar: number) => {
    const zone = getZoneRect(view);
    let w = zone.w;
    let h = w * ar;
    if (h > zone.h) { h = zone.h; w = h / ar; }
    const x = zone.x + (zone.w - w) / 2;
    const y = zone.y + (zone.h - h) / 2;
    setSides((prev) => ({ ...prev, [view]: { url, x, y, w, h, ar } }));
    setControlsVisible(true);
  };

  const openPicker = (view: Side) => {
    (view === "front" ? frontInputRef : backInputRef).current?.click();
  };

  const handleFile = async (view: Side, file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      onErrorMessage?.("Please upload a PNG, JPEG, or WEBP image.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      onErrorMessage?.("That file is too large (max 20MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = String(reader.result || "");
      const compressed = await compressArtwork(raw, file.type === "image/png" ? "image/png" : "image/jpeg");
      const img = await loadImage(compressed);
      fitIntoZone(view, compressed, img.naturalHeight / img.naturalWidth);
    };
    reader.readAsDataURL(file);
  };

  // ── Move/resize the design layer ──
  const onDesignPointerDown = (e: React.PointerEvent, mode: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const s = sides[curView];
    dragRef.current = { mode, pointerId: e.pointerId, mx: e.clientX, my: e.clientY, x: s.x, y: s.y, w: s.w, h: s.h };
    setControlsVisible(true);
  };
  const onDesignPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const zone = getZoneRect(curView);
    const s = sides[curView];
    if (drag.mode === "move") {
      let nx = drag.x + (e.clientX - drag.mx);
      let ny = drag.y + (e.clientY - drag.my);
      nx = Math.max(zone.x, Math.min(zone.x + zone.w - s.w, nx));
      ny = Math.max(zone.y, Math.min(zone.y + zone.h - s.h, ny));
      setSides((prev) => ({ ...prev, [curView]: { ...prev[curView], x: nx, y: ny } }));
    } else {
      let nw = drag.w + (e.clientX - drag.mx);
      nw = Math.max(zone.w * 0.15, Math.min(zone.w, nw));
      let nh = nw * s.ar;
      if (drag.y + nh > zone.y + zone.h) { nh = zone.y + zone.h - drag.y; nw = nh / s.ar; }
      const nx = Math.max(zone.x, Math.min(zone.x + zone.w - nw, s.x));
      const ny = Math.max(zone.y, Math.min(zone.y + zone.h - nh, s.y));
      setSides((prev) => ({ ...prev, [curView]: { ...prev[curView], w: nw, h: nh, x: nx, y: ny } }));
    }
  };
  const onDesignPointerUp = () => { dragRef.current = null; };

  const removeDesign = () => setSides((prev) => ({ ...prev, [curView]: { ...BLANK_SIDE } }));

  // ── Crop modal ──
  const openCrop = () => {
    const s = sides[curView];
    if (!s.url) return;
    setCropOpen(true);
  };
  const onCropImgLoad = () => {
    const img = cropImgRef.current;
    if (!img) return;
    cropNaturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
    requestAnimationFrame(() => {
      const rect = cropStageRef.current?.getBoundingClientRect();
      const w = rect?.width || 300;
      const h = rect?.height || 300;
      setCropRect({ x: 0, y: 0, w, h });
    });
  };
  const onCropPointerDown = (e: React.PointerEvent, mode: "move" | "resize-tl" | "resize-tr" | "resize-bl" | "resize-br") => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    cropDragRef.current = { mode, pointerId: e.pointerId, mx: e.clientX, my: e.clientY, ...cropRect };
  };
  const onCropPointerMove = (e: React.PointerEvent) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const rect = cropStageRef.current?.getBoundingClientRect();
    const imgW = rect?.width || 300;
    const imgH = rect?.height || 300;
    const dx = e.clientX - drag.mx;
    const dy = e.clientY - drag.my;
    const MIN = 24;
    let { x, y, w, h } = drag;
    if (drag.mode === "move") {
      x = Math.max(0, Math.min(imgW - w, x + dx));
      y = Math.max(0, Math.min(imgH - h, y + dy));
    } else if (drag.mode === "resize-br") {
      w = Math.max(MIN, Math.min(imgW - x, w + dx));
      h = Math.max(MIN, Math.min(imgH - y, h + dy));
    } else if (drag.mode === "resize-tl") {
      const nx = Math.max(0, Math.min(x + w - MIN, x + dx));
      const ny = Math.max(0, Math.min(y + h - MIN, y + dy));
      w = x + w - nx; h = y + h - ny; x = nx; y = ny;
    } else if (drag.mode === "resize-tr") {
      const ny = Math.max(0, Math.min(y + h - MIN, y + dy));
      w = Math.max(MIN, Math.min(imgW - x, w + dx)); h = y + h - ny; y = ny;
    } else if (drag.mode === "resize-bl") {
      const nx = Math.max(0, Math.min(x + w - MIN, x + dx));
      w = x + w - nx; h = Math.max(MIN, Math.min(imgH - y, h + dy)); x = nx;
    }
    setCropRect({ x, y, w, h });
  };
  const onCropPointerUp = () => { cropDragRef.current = null; };

  const applyCrop = async () => {
    const s = sides[curView];
    const img = cropImgRef.current;
    const rect = cropStageRef.current?.getBoundingClientRect();
    if (!s.url || !img || !rect) { setCropOpen(false); return; }
    const scaleX = cropNaturalRef.current.w / rect.width;
    const scaleY = cropNaturalRef.current.h / rect.height;
    const sx = Math.max(0, Math.round(cropRect.x * scaleX));
    const sy = Math.max(0, Math.round(cropRect.y * scaleY));
    const sw = Math.max(1, Math.round(cropRect.w * scaleX));
    const sh = Math.max(1, Math.round(cropRect.h * scaleY));
    const isPng = /^data:image\/png/.test(s.url);
    const canvas = document.createElement("canvas");
    canvas.width = sw; canvas.height = sh;
    canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const cropped = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.92);
    fitIntoZone(curView, cropped, sh / sw);
    setCropOpen(false);
  };

  // ── Front/back flip ──
  // The outer .fr-cpe-card animates rotateY 0<->180 over the CSS
  // transition; the inner .fr-cpe-stage-inner snaps (no transition) to
  // the counter-rotation the instant curView changes. Ported straight
  // from upload.html's updateStageView() -- see file header comment for
  // why this specific mechanism (not backface-visibility face-swapping)
  // is what keeps back-view content readable instead of mirrored.
  const flipTo = (view: Side) => {
    if (view === curView) return;
    setFlipRot(view === "back" ? 180 : 0);
    window.setTimeout(() => { setCurView(view); setControlsVisible(true); }, 220);
  };

  useImperativeHandle(ref, () => ({
    isReady: () => !!sides.front.url && (!both || !!sides.back.url),
    reset: () => { setSides({ front: { ...BLANK_SIDE }, back: { ...BLANK_SIDE } }); setCurView("front"); setFlipRot(0); },
    capture: async () => {
      if (!sides.front.url) return null;
      if (both && !sides.back.url) return null;
      // stageW is always the stage box's rendered width -- constant across
      // front/back since both sit in the same 100%-width container. stageH
      // is NOT constant: the front and back stage each get their own
      // aspect-ratio (see stageAspect/onGarmentLoad above), so
      // stageRef.current.clientHeight only ever reflects whichever view is
      // currently on screen. sides.front/back's x/y/w/h were each recorded
      // against their OWN view's height at placement time, so re-deriving
      // stageH per side from stageAspect (rather than reading whatever
      // height happens to be rendered right now) is what keeps the
      // composite's scale factor correct for both sides regardless of
      // which one the customer is looking at when they hit Add to Cart.
      const stageW = stageRef.current?.clientWidth || 320;

      const compositeSide = async (view: Side, garmentSrc: string): Promise<string> => {
        const s = sides[view];
        const stageH = stageW / (stageAspect[view] || 1);
        const [garmentImg, design] = await Promise.all([loadImage(garmentSrc), loadImage(s.url!)]);
        const canvas = document.createElement("canvas");
        canvas.width = 720;
        canvas.height = Math.round(720 * (garmentImg.naturalHeight / garmentImg.naturalWidth));
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(garmentImg, 0, 0, canvas.width, canvas.height);
        const sx = canvas.width / stageW;
        const sy = canvas.height / stageH;
        // cfg.clip's points are already stage-fraction (0-1), the same
        // fraction the canvas itself represents of the garment photo, so
        // they map onto canvas.width/height directly -- no sx/sy needed
        // here, unlike the design placement below (which is in stage px).
        // Without this the composited preview/print would show artwork
        // spilling past a non-rectangular panel's true edge (e.g. a cap's
        // arched crown) even though the live editor clips it correctly.
        const table = PRINT_ZONE[garment][view];
        const cfg = table[zoneColour] || table.black;
        if (cfg.clip) {
          ctx.save();
          ctx.beginPath();
          cfg.clip.forEach((p, i) => {
            const px = p.x * canvas.width, py = p.y * canvas.height;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.clip();
        }
        ctx.drawImage(design, s.x * sx, s.y * sy, s.w * sx, s.h * sy);
        if (cfg.clip) ctx.restore();
        return canvas.toDataURL("image/jpeg", 0.88);
      };

      const frontPreviewDataUrl = await compositeSide("front", frontGarmentImage);
      const backPreviewDataUrl = both ? await compositeSide("back", backGarmentImage!) : undefined;

      return {
        frontRawDataUrl: sides.front.url,
        backRawDataUrl: both ? sides.back.url! : undefined,
        frontPreviewDataUrl,
        backPreviewDataUrl,
      };
    },
  }), [sides, both, frontGarmentImage, backGarmentImage, stageAspect, garment, zoneColour]);

  const s = sides[curView];
  const garmentSrc = curView === "front" ? frontGarmentImage : backGarmentImage || frontGarmentImage;
  const innerCounterRot = curView === "back" ? 180 : 0;
  const zone = getZoneRect(curView);
  const zoneClip = getZoneClip(curView);

  return (
    <div className="fr-cpe">
      <div className="fr-cpe-perspective">
        <div className="fr-cpe-card" style={{ transform: `rotateY(${flipRot}deg)` }}>
          <div
            className="fr-cpe-stage-inner"
            style={{ transform: `rotateY(${innerCounterRot}deg)`, aspectRatio: String(stageAspect[curView]) }}
          >
            <div
              className="fr-cpe-stage"
              ref={stageRef}
              onClick={(e) => { if (s.url && !(e.target as HTMLElement).closest(".fr-cpe-design-layer")) setControlsVisible(false); }}
            >
              <img src={garmentSrc} alt="" className="fr-cpe-garment-img" draggable={false} onLoad={(e) => onGarmentLoad(curView, e)} />
              {!s.url && (
                <button
                  type="button"
                  className={"fr-cpe-empty" + (zoneColour === "white" ? " fr-cpe-empty-light" : "")}
                  style={{ left: zone.x, top: zone.y, width: zone.w, height: zone.h, ...clipPathStyle(zoneClip, zone.x, zone.y) }}
                  onClick={() => openPicker(curView)}
                >
                  <span className="fr-cpe-plus">+</span>
                  <span className="fr-cpe-empty-hint">Tap to upload</span>
                </button>
              )}
              {s.url && (
                <div
                  className={"fr-cpe-design-layer" + (controlsVisible ? "" : " fr-cpe-controls-hidden")}
                  style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
                  onPointerDown={(e) => onDesignPointerDown(e, "move")}
                  onPointerMove={onDesignPointerMove}
                  onPointerUp={onDesignPointerUp}
                  onClick={(e) => { e.stopPropagation(); setControlsVisible(true); }}
                >
                  {/* Clip lives on the <img> alone, not this whole layer --
                      the drag handle and corner buttons stay outside it so
                      they're never accidentally hit-tested out of existence
                      when they land in a "cut corner" the panel's true
                      outline excludes (e.g. beside a cap's arched crown). */}
                  <img src={s.url} alt="Your design" draggable={false} style={clipPathStyle(zoneClip, s.x, s.y)} />
                  <button type="button" className="fr-cpe-btn-change" aria-label="Change upload" onClick={(e) => { e.stopPropagation(); openPicker(curView); }}>+</button>
                  <button type="button" className="fr-cpe-btn-remove" aria-label="Remove upload" onClick={(e) => { e.stopPropagation(); removeDesign(); }}>−</button>
                  <button type="button" className="fr-cpe-btn-crop" aria-label="Crop image" onClick={(e) => { e.stopPropagation(); openCrop(); }}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 1v9a2 2 0 0 0 2 2h9" /><path d="M12 15V6a2 2 0 0 0-2-2H1" /></svg>
                  </button>
                  <div
                    className="fr-cpe-handle"
                    onPointerDown={(e) => onDesignPointerDown(e, "resize")}
                    onPointerMove={onDesignPointerMove}
                    onPointerUp={onDesignPointerUp}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {both && (
        <div className="fr-cpe-flip-ctrls">
          <button type="button" onClick={() => flipTo("front")} className={curView === "front" ? "active" : ""}>Front</button>
          <button type="button" onClick={() => flipTo("back")} className={curView === "back" ? "active" : ""}>Back</button>
        </div>
      )}
      <input ref={frontInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile("front", f); e.target.value = ""; }} />
      {both && <input ref={backInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile("back", f); e.target.value = ""; }} />}

      {cropOpen && s.url && (
        <div className="fr-cpe-crop-modal" role="dialog" aria-modal="true" aria-label="Crop your image">
          <div className="fr-cpe-crop-card">
            <p className="fr-cpe-crop-title">Crop your image</p>
            <p className="fr-cpe-crop-sub">Drag the corners to trim empty space so your design fills more of the print area.</p>
            <div className="fr-cpe-crop-stage" ref={cropStageRef}>
              <img ref={cropImgRef} src={s.url} alt="" onLoad={onCropImgLoad} draggable={false} />
              <div
                className="fr-cpe-crop-rect"
                style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
                onPointerDown={(e) => onCropPointerDown(e, "move")}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
              >
                {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                  <div
                    key={corner}
                    className={`fr-cpe-crop-handle ${corner}`}
                    onPointerDown={(e) => onCropPointerDown(e, `resize-${corner}` as "resize-tl" | "resize-tr" | "resize-bl" | "resize-br")}
                    onPointerMove={onCropPointerMove}
                    onPointerUp={onCropPointerUp}
                  />
                ))}
              </div>
            </div>
            <div className="fr-cpe-crop-actions">
              <button type="button" onClick={() => setCropOpen(false)}>Cancel</button>
              <button type="button" onClick={applyCrop}>Apply crop</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default FourRegnCustomPrintEditor;
