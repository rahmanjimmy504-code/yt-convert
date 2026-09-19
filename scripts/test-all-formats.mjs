const API = process.env.YT_CONVERT_API || "https://yt-convert.rahmanjimmy504.workers.dev";
const VIDEO = process.env.YT_TEST_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const FORMATS = ["flac", "mp3", "m4a", "aac", "opus", "mp4"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mediaSignature(format, bytes) {
  if (bytes.length < 4) return false;
  if (format === "flac") return String.fromCharCode(...bytes.slice(0, 4)) === "fLaC";
  if (format === "mp3") {
    return String.fromCharCode(...bytes.slice(0, 3)) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (format === "m4a" || format === "mp4") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (format === "aac") return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
  if (format === "opus") return bytes.length >= 36 && String.fromCharCode(...bytes.slice(0, 4)) === "OggS" && String.fromCharCode(...bytes.slice(28, 36)) === "OpusHead";
  return false;
}

function headerHex(bytes, length = 16) {
  return [...bytes.slice(0, length)].map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join(" ");
}

async function getLocalCaptchaToken() {
  console.log("🔐 Getting local math CAPTCHA...");
  const challengeResponse = await fetch(API + "/api/captcha?backup=1&mode=math", { headers: { Accept: "application/json" } });
  const challengeText = await challengeResponse.text();
  assert(challengeResponse.ok, "CAPTCHA challenge failed: HTTP " + challengeResponse.status + " " + challengeText);
  const challenge = JSON.parse(challengeText);
  assert(challenge.provider === "local" && typeof challenge.challengeId === "string" && typeof challenge.question === "string", "Unexpected CAPTCHA response: " + challengeText);
  const match = challenge.question.match(/^What is (\d+) \+ (\d+)?$/) || challenge.question.match(/^What is (\d+) \+ (\d+)\?$/);
  assert(match, "Unexpected math CAPTCHA question: " + challenge.question);
  const answer = String(Number(match[1]) + Number(match[2]));
  const verifyResponse = await fetch(API + "/api/captcha", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ challengeId: challenge.challengeId, answer: answer })
  });
  const verifyText = await verifyResponse.text();
  assert(verifyResponse.ok, "CAPTCHA verification failed: HTTP " + verifyResponse.status + " " + verifyText);
  const verified = JSON.parse(verifyText);
  assert(typeof verified.token === "string" && verified.token.length > 0, "CAPTCHA verification returned no token: " + verifyText);
  console.log("   ✅ CAPTCHA solved\n");
  return verified.token;
}

async function lookupVideo(captchaToken) {
  console.log("🔎 Looking up video...");
  const endpoint = new URL("/api/video-info", API);
  endpoint.searchParams.set("url", VIDEO);
  const response = await fetch(endpoint, { headers: { Accept: "application/json", "X-Captcha-Token": captchaToken } });
  const text = await response.text();
  assert(response.ok, "Video lookup failed: HTTP " + response.status + " " + text);
  const info = JSON.parse(text);
  assert(info.convertTicket, "Lookup succeeded but no convertTicket was returned: " + text);
  console.log("   ✅ " + (info.title || "Video"));
  console.log("   Platform: " + (info.platform || "unknown"));
  console.log("   Can convert: " + info.canConvert);
  console.log("   ✅ Convert ticket received\n");
  return info;
}

async function testFormat(format, info) {
  console.log("🧪 " + format.toUpperCase());
  const endpoint = new URL("/api/convert", API);
  endpoint.searchParams.set("url", VIDEO);
  endpoint.searchParams.set("format", format);
  endpoint.searchParams.set("quality", "best");
  endpoint.searchParams.set("ticket", info.convertTicket);
  endpoint.searchParams.set("title", info.title || "yt-convert-test");
  const response = await fetch(endpoint, { headers: { Accept: "application/octet-stream, audio/*, video/*, application/json" } });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const error = await response.text();
    console.log("   ❌ HTTP " + response.status);
    console.log("   " + error.slice(0, 500) + "\n");
    return { format: format, passed: false, status: response.status, contentType: contentType, bytes: 0, reason: error.slice(0, 500) };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const signatureOk = mediaSignature(format, bytes);
  console.log("   HTTP: " + response.status);
  console.log("   Content-Type: " + contentType);
  console.log("   Received: " + bytes.length.toLocaleString() + " bytes");
  console.log("   Header: " + headerHex(bytes));
  if (!signatureOk) {
    console.log("   ❌ FAIL — returned bytes do not match the requested format\n");
    return { format: format, passed: false, status: response.status, contentType: contentType, bytes: bytes.length, reason: "Media signature does not match requested format" };
  }
  console.log("   ✅ PASS\n");
  return { format: format, passed: true, status: response.status, contentType: contentType, bytes: bytes.length };
}

async function main() {
  console.log("========================================");
  console.log("       YT-CONVERT FORMAT TEST");
  console.log("========================================");
  console.log("API:   " + API);
  console.log("Video: " + VIDEO);
  console.log("Formats: " + FORMATS.join(", "));
  console.log("========================================\n");
  const captchaToken = await getLocalCaptchaToken();
  const info = await lookupVideo(captchaToken);
  const results = [];
  for (const format of FORMATS) results.push(await testFormat(format, info));
  console.log("========================================");
  console.log("              RESULTS");
  console.log("========================================");
  for (const result of results) console.log((result.passed ? "✅" : "❌") + " " + result.format.toUpperCase().padEnd(5) + " HTTP " + result.status + " " + result.bytes.toLocaleString() + " bytes " + result.contentType);
  const passed = results.filter(function (result) { return result.passed; }).length;
  console.log("----------------------------------------");
  console.log(passed + "/" + results.length + " formats passed");
  console.log((results.length - passed) + " failed");
  console.log("========================================");
  if (passed !== results.length) process.exitCode = 1;
}

main().catch(function (error) {
  console.error("\n💥 FORMAT TEST ABORTED");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});