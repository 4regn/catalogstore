"use client";

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

// Interactive artwork placement tool for 4regn's Custom Upload Studio
// products -- ported from UNIK Labs' own Step 3 tool (upload.html) as
// closely as the two platforms' different architecture allows. Same core
// mechanics: a draggable "design layer" box on top of the garment photo,
// one bottom-right resize handle (aspect-ratio locked, width-driven),
// three corner buttons (change/remove/crop), a separate crop modal, and a
// front/back flip using the identical rotateY 3D-transform technique as
// the product card's own auto-flip (FourRegnStore.tsx's .fr-pimg-flip).
//
// Deliberately NOT ported: UNIK's per-garment/per-colour calibrated print
// zone (getZoneRect() -- pixel rects tuned to their exact product photos,
// data this codebase doesn't have) and the elastic drag-to-flip gesture
// (UNIK supports both click AND drag-to-flip; this is click-only, same
// visual result, less interaction surface to get right blind). A single
// reasonable default zone (roughly the chest area) is used instead of
// per-product calibration.
//
// State (url/x/y/w/h/ar per side) is owned here, not lifted to the
// parent -- FourRegnStore.tsx only needs a readiness check and a capture()
// call at Add to Cart time (see the exposed handle), mirroring exactly
// when UNIK's own captureCustomPreview() runs: once, at checkout-intent,
// never continuously while dragging.

type Side = "front" | "back";
type SideState = { url: string | null; x: number; y: number; w: number; h: number; ar: number };
const BLANK_SIDE: SideState = { url: null, x: 0, y: 0, w: 0, h: 0, ar: 1 };

// Default print zone as a fraction of the stage box -- roughly a garment's
// chest area. Not per-garment calibrated (see file comment above).
const ZONE = { x: 0.26, y: 0.2, w: 0.48, h: 0.42 };

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
  onErrorMessage?: (message: string) => void;
}

const FourRegnCustomPrintEditor = forwardRef<FourRegnCustomPrintEditorHandle, Props>(function FourRegnCustomPrintEditor(
  { frontGarmentImage, backGarmentImage, onErrorMessage },
  ref
) {
  const both = !!backGarmentImage;
  const [curView, setCurView] = useState<Side>("front");
  const [flipRot, setFlipRot] = useState(0);
  const [sides, setSides] = useState<{ front: SideState; back: SideState }>({ front: { ...BLANK_SIDE }, back: { ...BLANK_SIDE } });
  const [controlsVisible, setControlsVisible] = useState(true);
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

  const getZoneRect = () => {
    const stage = stageRef.current;
    const w = stage?.clientWidth || 320;
    const h = stage?.clientHeight || 400;
    return { x: ZONE.x * w, y: ZONE.y * h, w: ZONE.w * w, h: ZONE.h * h };
  };

  const fitIntoZone = (view: Side, url: string, ar: number) => {
    const zone = getZoneRect();
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
    const zone = getZoneRect();
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

  // ── Front/back flip (click only -- see file comment) ──
  const flipTo = (view: Side) => {
    setFlipRot(view === "back" ? 180 : 0);
    window.setTimeout(() => setCurView(view), 180);
  };

  useImperativeHandle(ref, () => ({
    isReady: () => !!sides.front.url && (!both || !!sides.back.url),
    reset: () => setSides({ front: { ...BLANK_SIDE }, back: { ...BLANK_SIDE } }),
    capture: async () => {
      if (!sides.front.url) return null;
      if (both && !sides.back.url) return null;
      const stage = stageRef.current;
      const stageW = stage?.clientWidth || 320;
      const stageH = stage?.clientHeight || 400;

      const compositeSide = async (view: Side, garmentSrc: string): Promise<string> => {
        const s = sides[view];
        const [garment, design] = await Promise.all([loadImage(garmentSrc), loadImage(s.url!)]);
        const canvas = document.createElement("canvas");
        canvas.width = 720;
        canvas.height = Math.round(720 * (garment.naturalHeight / garment.naturalWidth));
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(garment, 0, 0, canvas.width, canvas.height);
        const sx = canvas.width / stageW;
        const sy = canvas.height / stageH;
        ctx.drawImage(design, s.x * sx, s.y * sy, s.w * sx, s.h * sy);
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
  }), [sides, both, frontGarmentImage, backGarmentImage]);

  const s = sides[curView];
  const garmentSrc = curView === "front" ? frontGarmentImage : backGarmentImage || frontGarmentImage;

  return (
    <div className="fr-cpe">
      <div className="fr-cpe-perspective">
        <div className="fr-cpe-card" style={{ transform: `rotateY(${flipRot}deg)` }}>
          <div
            className="fr-cpe-stage"
            ref={stageRef}
            onClick={(e) => { if (s.url && !(e.target as HTMLElement).closest(".fr-cpe-design-layer")) setControlsVisible(false); }}
          >
            <img src={garmentSrc} alt="" className="fr-cpe-garment-img" draggable={false} />
            {!s.url && (
              <button type="button" className="fr-cpe-empty" onClick={() => openPicker(curView)}>
                <span className="fr-cpe-plus">+</span>
                <span>Tap to upload your design</span>
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
                <img src={s.url} alt="Your design" draggable={false} />
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
