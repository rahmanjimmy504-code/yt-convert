// Rebuild public/snapchat-logo.png as the official Snapchat badge:
// white Ghostface Chillah (Simple Icons path) with a thin black outline,
// centered on the brand-yellow #FFFC00 squircle, on a transparent canvas.
//
// Proportions (from the official badge reference):
//   - Yellow squircle fills 92.6% of the 512x512 canvas (transparent margin).
//   - Corner radius ~22% of squircle side (official app-icon curvature).
//   - Ghost silhouette is the accurate Simple Icons "Ghostface Chillah" path.
//   - Black outline = 1.30% of the ghost width (official measurement),
//     drawn as a centered stroke behind a white-filled copy of the same path.
// Rendered at 4x (2048) then Lanczos-downscaled to 512 for anti-aliased edges.
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const GHOST = 'M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.06.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z';

const FINAL = 512;
const SCALE = 4; // supersample
const S = FINAL * SCALE; // 2048

// Squircle: 92.6% of canvas, centered.
const sqPct = 0.926;
const sq = S * sqPct;
const sqX = (S - sq) / 2;
const sqY = (S - sq) / 2;
// Official iOS-style app icon corner radius is 22.37% of the icon side.
const radius = sq * 0.2237;

// Ghost scaling: the Simple Icons ghost intrinsic width is ~24 units and it
// fills the viewBox. In the official badge the ghost occupies ~78% of the
// canvas width (~84% of the squircle). Scale accordingly.
const ghostCanvasFrac = 0.782;
const ghostPxW = S * ghostCanvasFrac;
const gScale = ghostPxW / 24; // user units -> px
const ghostCx = S / 2;
const ghostCy = S / 2; // vertically centered; matches official badge

// Outline: 1.30% of ghost width, in the ghost's own user units (so it scales
// with the ghost). A centered stroke of width w adds w/2 outward each side.
const ghostIntrinsicW = 24;
const strokeW = 0.0126 * ghostIntrinsicW; // 0.3024 user units = 1.26% of ghost width (official: 1.30%)

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect x="${sqX}" y="${sqY}" width="${sq}" height="${sq}" rx="${radius}" ry="${radius}" fill="#FFFC00"/>
  <g transform="translate(${ghostCx} ${ghostCy}) scale(${gScale}) translate(-12 -12)">
    <path d="${GHOST}" fill="#000000" stroke="#000000" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${GHOST}" fill="#FFFFFF"/>
  </g>
</svg>`;

fs.writeFileSync('/tmp/snapchat-built.svg', svg);

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: S },
  background: 'rgba(0,0,0,0)',
  font: { loadSystemFonts: false },
});
const rendered = resvg.render();
const big = rendered.asPng();
fs.writeFileSync('/tmp/snapchat-2048.png', big);

// Downscale 2048 -> 512 with high-quality resampling (Lanczos via ImageMagick,
// which is available in the environment).
const out = path.join(__dirname, '..', 'public', 'snapchat-logo.png');
const { execFileSync } = require('child_process');
execFileSync('convert', [
  '/tmp/snapchat-2048.png',
  '-filter', 'Lanczos',
  '-resize', `${FINAL}x${FINAL}`,
  '-define', 'png:compression-level=9',
  'PNG32:' + out,
], { stdio: 'inherit' });

console.log('wrote', out);
console.log('squircle', sq, 'radius', radius.toFixed(1));
console.log('ghost px width', ghostPxW, 'scale', gScale.toFixed(4));
console.log('stroke user units', strokeW, '-> px @512', (strokeW * gScale / SCALE).toFixed(2));
