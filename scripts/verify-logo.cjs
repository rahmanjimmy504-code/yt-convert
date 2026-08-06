// Verify the rebuilt snapchat-logo.png against the documented official specs:
//  - 512x512 RGBA
//  - transparent margin (corners alpha 0)
//  - yellow #FFFC00 squircle
//  - squircle fills 92.6% of canvas
//  - black outline ~1.30% of ghost width (the old PR #12 build was 5.5%)
//  - ghost is white, centered
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const { execFileSync } = require('child_process');

const FILE = require('path').join(__dirname, '..', 'public', 'snapchat-logo.png');

// Decode PNG to raw RGBA via resvg (render a tiny SVG that <image>s the PNG).
function loadPng(p) {
  const b64 = fs.readFileSync(p).toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><image href="data:image/png;base64,${b64}" width="512" height="512"/></svg>`;
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } });
  const img = r.render();
  return { w: img.width, h: img.height, px: img.pixels };
}

const { w, h, px } = loadPng(FILE);
console.log('dimensions', w + 'x' + h);

function alpha(x, y) { return px[(y * w + x) * 4 + 3]; }
function rgba(x, y) { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]]; }

// Corners must be transparent.
const corners = [[0, 0], [511, 0], [0, 511], [511, 511]].map(([x, y]) => alpha(x, y));
console.log('corner alphas (should be 0):', corners.join(','));

// Find yellow squircle bbox: pixels where r,g are high (~255), b low (~0) and
// alpha=255. Sample center column/row.
function isYellow(i) {
  return px[i + 3] > 200 && px[i] > 230 && px[i + 1] > 230 && px[i + 2] < 40;
}
let xMin = w, xMax = 0, yMin = h, yMax = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (isYellow((y * w + x) * 4)) {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
}
const sqW = xMax - xMin + 1, sqH = yMax - yMin + 1;
console.log('squircle bbox:', { xMin, xMax, yMin, yMax });
console.log('squircle size:', sqW + 'x' + sqH, '-> % of canvas:', (sqW / w * 100).toFixed(2) + '% (target 92.6%)');

// Center pixel should be on the white ghost or yellow; check a point known to
// be yellow (just inside the left edge mid-height) and confirm exact #FFFC00.
const ySample = rgba(Math.round((xMin + xMax) / 2), 40);
console.log('yellow sample near top center RGBA:', ySample.join(','), '(target 255,252,0,255)');

// Measure the ghost's black outline thickness on the upper-left shoulder.
// We scan a horizontal line through the dome and find the black ring width,
// but a cleaner global measure: for each column find topmost black pixel and
// the next white pixel below it; the gap is the outline thickness.
function isBlack(i) { return px[i + 3] > 200 && px[i] < 60 && px[i + 1] < 60 && px[i + 2] < 60; }
function isWhite(i) { return px[i + 3] > 200 && px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200; }

// Ghost bbox via white pixels.
let gxMin = w, gxMax = 0, gyMin = h, gyMax = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  if (isWhite(i)) {
    if (x < gxMin) gxMin = x; if (x > gxMax) gxMax = x;
    if (y < gyMin) gyMin = y; if (y > gyMax) gyMax = y;
  }
}
const ghostW = gxMax - gxMin + 1;
const ghostH = gyMax - gyMin + 1;
console.log('white ghost bbox:', { gxMin, gxMax, gyMin, gyMax }, 'size', ghostW + 'x' + ghostH);
console.log('ghost width % of canvas:', (ghostW / w * 100).toFixed(2) + '%');

// Measure outline thickness at the top dome: scan the center column from top
// down, find first black (outer edge) then first white (inner edge) -> thickness.
function outlineAtColumn(cx) {
  let outerY = -1, innerY = -1;
  for (let y = 0; y < h; y++) {
    const i = (y * w + cx) * 4;
    if (outerY === -1 && isBlack(i)) outerY = y;
    else if (outerY !== -1 && isWhite(i)) { innerY = y; break; }
  }
  return outerY !== -1 && innerY !== -1 ? innerY - outerY : -1;
}
const cx = Math.round((gxMin + gxMax) / 2);
const topStroke = outlineAtColumn(cx);
// Also measure on a vertical scan across the left dome at the widest row.
function outlineAtRow(cy) {
  let outerX = -1, innerX = -1;
  for (let x = 0; x < w; x++) {
    const i = (cy * w + x) * 4;
    if (outerX === -1 && isBlack(i)) outerX = x;
    else if (outerX !== -1 && isWhite(i)) { innerX = x; break; }
  }
  return outerX !== -1 && innerX !== -1 ? innerX - outerX : -1;
}
// sample a few rows through the dome/body and average
const rows = [Math.round(gyMin + ghostH * 0.18), Math.round(gyMin + ghostH * 0.30), Math.round(gyMin + ghostH * 0.45)];
const sideStrokes = rows.map(outlineAtRow);
const allStrokes = [topStroke, ...sideStrokes].filter(s => s > 0);
const avgStroke = allStrokes.reduce((a, b) => a + b, 0) / allStrokes.length;
console.log('top-dome outline px:', topStroke, '| side outlines px:', sideStrokes.join(','), '| avg:', avgStroke.toFixed(2));
console.log('outline as %% of ghost width: top=%.2f%% avg=%.2f%% (target 1.30%%)', topStroke / ghostW * 100, avgStroke / ghostW * 100);
console.log('(PR #12 old thick variant was ~5.5%%)');
