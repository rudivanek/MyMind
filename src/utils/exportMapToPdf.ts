import { getViewportForBounds, type Node, type Rect } from "@xyflow/react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import type { Item, Connection } from "@/types";
import { renderAppendix, type ReadingOrderEntry } from "@/utils/pdfAppendix";

const MAX_DIM = 8000;
const TARGET_LONG_EDGE = 2400;
const MAX_RASTER_PIXELS = 25_000_000;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function formatFilename(mapName: string): string {
  const sanitized = (mapName ?? "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const name = sanitized || "Map";
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const HH = String(now.getHours()).padStart(2, "0");
  const MIN = String(now.getMinutes()).padStart(2, "0");
  return `MyMind_${name} ${dd}-${mm}-${yy} ${HH}.${MIN}`;
}

export async function exportMapToPdf(opts: {
  nodes: Node[];
  bounds: Rect;
  mapName: string;
  includeAppendix?: boolean;
  items?: Item[];
  connections?: Connection[];
  readingOrder?: ReadingOrderEntry[];
}): Promise<void> {
  const { nodes, bounds, mapName, includeAppendix = false, items = [], connections = [], readingOrder = [] } = opts;
  if (nodes.length === 0) return;

  if (!isFiniteNumber(bounds.width) || !isFiniteNumber(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error(
      `Export aborted: invalid bounds (width=${bounds.width}, height=${bounds.height}). ` +
      "The nodes passed in lack measurements — ensure useReactFlow().getNodes() is used, not Zustand state."
    );
  }

  const aspect = bounds.width / bounds.height;

  let imageWidth: number;
  let imageHeight: number;
  if (bounds.width >= bounds.height) {
    imageWidth = Math.min(TARGET_LONG_EDGE, MAX_DIM);
    imageHeight = Math.round(imageWidth / aspect);
    if (imageHeight > MAX_DIM) {
      imageHeight = MAX_DIM;
      imageWidth = Math.round(imageHeight * aspect);
    }
  } else {
    imageHeight = Math.min(TARGET_LONG_EDGE, MAX_DIM);
    imageWidth = Math.round(imageHeight * aspect);
    if (imageWidth > MAX_DIM) {
      imageWidth = MAX_DIM;
      imageHeight = Math.round(imageWidth / aspect);
    }
  }

  let pixelRatio = 2;

  // Clamp total raster pixels — browsers silently return a blank canvas past the area limit.
  const totalPixels = imageWidth * imageHeight * pixelRatio * pixelRatio;
  if (totalPixels > MAX_RASTER_PIXELS) {
    pixelRatio = 1;
    const stillOver = imageWidth * imageHeight * pixelRatio * pixelRatio > MAX_RASTER_PIXELS;
    if (stillOver) {
      const scale = Math.sqrt(MAX_RASTER_PIXELS / (imageWidth * imageHeight));
      imageWidth = Math.floor(imageWidth * scale);
      imageHeight = Math.floor(imageHeight * scale);
    }
  }

  const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.2, 4, 0.1);
  const { x, y, zoom } = viewport;

  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(zoom)) {
    throw new Error(`Export aborted: non-finite viewport (x=${x}, y=${y}, zoom=${zoom}).`);
  }

  const viewportEl = document.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!viewportEl) throw new Error("Could not find the canvas viewport element (.react-flow__viewport).");

  const captureOpts = {
    backgroundColor: "#ffffff" as const,
    width: imageWidth,
    height: imageHeight,
    pixelRatio,
    cacheBust: true,
    style: {
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
    filter: (el: HTMLElement) => {
      if (!el.classList) return true;
      const skip = [
        "react-flow__minimap",
        "react-flow__controls",
        "react-flow__panel",
        "react-flow__attribution",
        "react-flow__handle",
        "react-flow__resize-control",
        "react-flow__nodesselection",
        "react-flow__selection",
      ];
      return !skip.some((c) => el.classList.contains(c));
    },
  };

  let dataUrl: string;
  try {
    dataUrl = await toPng(viewportEl, captureOpts);
  } catch (err) {
    try {
      dataUrl = await toPng(viewportEl, { ...captureOpts, skipFonts: true } as Parameters<typeof toPng>[1]);
    } catch (err2) {
      throw err2;
    }
  }

  // Guard against blank/invalid output.
  if (!dataUrl || dataUrl.length < 5000 || !dataUrl.startsWith("data:image/png")) {
    throw new Error(
      `Export aborted: captured image is blank or invalid (length=${dataUrl?.length}, prefix=${dataUrl?.slice(0, 20)}).`
    );
  }

  const orientation: "landscape" | "portrait" = imageWidth >= imageHeight ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;

  const ratio = imageWidth / imageHeight;
  let drawW = availW;
  let drawH = drawW / ratio;
  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * ratio;
  }
  const offsetX = (pageW - drawW) / 2;
  const offsetY = (pageH - drawH) / 2;

  if (!Number.isFinite(drawW) || !Number.isFinite(drawH) || drawW < 1 || drawH < 1) {
    throw new Error(
      `Export aborted: invalid image placement (drawW=${drawW}, drawH=${drawH}, ratio=${ratio}, imgPxW=${imageWidth}, imgPxH=${imageHeight}).`
    );
  }

  pdf.addImage(dataUrl, "PNG", offsetX, offsetY, drawW, drawH);

  if (includeAppendix && items.length > 0 && readingOrder.length > 0) {
    pdf.addPage();
    renderAppendix(pdf, items, connections, readingOrder);
  }

  const filename = formatFilename(mapName);
  pdf.save(`${filename}.pdf`);
}
