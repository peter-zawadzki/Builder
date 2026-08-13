// One-time (rerun-when-icon-set-changes) generator for the marker images used
// by ProposalBuilder's proposal-addendum map — Mapbox Static Images API's
// `url-` overlay needs a publicly-hosted PNG per marker, it can't render a
// Lucide icon directly the way the live site-assessment map does. These are
// built to visually match createDeviceMarkerElement's styling (deviceTypes.tsx)
// so the addendum map's icons match the assessment tool, not a generic pin.
//
// Usage: npx tsx scripts/generateMapIcons.ts
// Output: public/map-icons/*.png (checked into the repo — served as static
// assets, so Mapbox's renderer can fetch them from the deployed app's own
// origin; this only resolves once deployed, since Mapbox can't reach localhost).
import { chromium } from "playwright";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Server, Wifi, Zap, Building2, MapPin, Camera as CameraIcon, Flag, AlertTriangle } from "lucide-react";
import fs from "fs";

const OUT_DIR = "public/map-icons";
const SIZE = 80; // @2x-ish physical pixel size for a ~40px on-map marker

function markerHtml(Icon: any, bgColor: string, iconColor = "white") {
  const svg = renderToStaticMarkup(React.createElement(Icon, { size: SIZE * 0.45, color: iconColor, strokeWidth: 2.5 }));
  return `<!DOCTYPE html><html><head><style>
    html,body{margin:0;background:transparent;}
    .marker{
      width:${SIZE}px;height:${SIZE}px;border-radius:50%;
      background:${bgColor};border:${SIZE * 0.075}px solid white;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
      box-sizing:border-box;
    }
  </style></head><body><div class="marker">${svg}</div></body></html>`;
}

const CAMERA_COLOR_PRESETS = ["#f43f5e", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#84cc16"];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });

  const render = async (html: string, file: string) => {
    await page.setContent(html);
    await page.locator(".marker").screenshot({ path: `${OUT_DIR}/${file}`, omitBackground: true });
    console.log("✓", file);
  };

  for (const color of CAMERA_COLOR_PRESETS) {
    await render(markerHtml(CameraIcon, color), `camera-${color.replace("#", "")}.png`);
  }
  await render(markerHtml(Server, "#6366f1"), "server.png");
  await render(markerHtml(Wifi, "#0ea5e9"), "network.png");
  await render(markerHtml(Zap, "#f59e0b"), "power.png");
  await render(markerHtml(Building2, "#64748b"), "building.png");
  await render(markerHtml(MapPin, "#94a3b8"), "misc.png");
  await render(markerHtml(Flag, "#22c55e"), "start.png");
  await render(markerHtml(Flag, "#ef4444"), "finish.png");
  // 480V-power warning — black icon on yellow reads better than white-on-yellow.
  await render(markerHtml(AlertTriangle, "#facc15", "#1a1a1a"), "warning-480v.png");

  await browser.close();
}

main();
