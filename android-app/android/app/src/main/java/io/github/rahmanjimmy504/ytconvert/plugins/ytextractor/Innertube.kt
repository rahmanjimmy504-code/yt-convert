// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * On-device Innertube extraction, ported from the website's src/lib/extract.ts
 * so the phone can pull streams over its OWN connection (same-egress — the
 * consumer IP is exactly what clears YouTube's bot wall that blocks
 * datacenter hosts).
 *
 * Hard boundaries kept from the website:
 *  - The app NEVER emulates BotGuard and carries NO PO tokens: there is no
 *    token sidecar in the APK and minting requires a same-IP operator server,
 *    which the phone itself replaces.
 *  - The app NEVER sends user cookies: no session harvesting on device.
 *  - Every returned format URL passes MediaHosts before leaving the plugin.
 *  - The only "secret-looking" constant is the public Innertube API key shipped
 *    in every YouTube web player — not a secret (same value as the website).
 */
object Innertube {

    private const val PLAYER_ENDPOINT = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
    private const val CONNECT_TIMEOUT_MS = 8_000
    private const val READ_TIMEOUT_MS = 12_000

    /** One Innertube client identity, mirroring the website's InnertubeClient. */
    data class Client(
        val name: String,
        val clientName: String,
        val clientVersion: String,
        val userAgent: String,
        val clientId: String,
        val extra: Map<String, Any> = emptyMap(),
        val embed: Boolean = false,
        val apiKey: String? = null,
        val thirdPartyEmbedUrl: String? = null,
    )

    /**
     * Clients that still hand back direct `url` fields (no signatureCipher),
     * kept in step with the website table (which tracks yt-dlp's). Ordering
     * matters: the first client with playability OK and a direct URL wins a
     * round, and querying continues until both an audio and a video track are
     * collected. No ANDROID_TESTSUITE (retired by YouTube, dropped by yt-dlp).
     */
    val CLIENTS: List<Client> = listOf(
        // YouTube Music clients first: label/Topic uploads often return
        // SABR-only / empty streamingData on ANDROID but still serve direct
        // itag 18 + itag 140 here.
        Client(
            name = "android_music",
            clientName = "ANDROID_MUSIC",
            clientVersion = "7.27.52",
            userAgent = "com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 11) gzip",
            clientId = "21",
            extra = mapOf("androidSdkVersion" to 30, "osName" to "Android", "osVersion" to "11"),
        ),
        Client(
            name = "ios_music",
            clientName = "IOS_MUSIC",
            clientVersion = "7.27.0",
            userAgent = "com.google.ios.youtubemusic/7.27.0 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
            clientId = "26",
            extra = mapOf(
                "deviceMake" to "Apple",
                "deviceModel" to "iPhone16,2",
                "osName" to "iPhone",
                "osVersion" to "18.3.2.22D82",
            ),
        ),
        Client(
            name = "android",
            clientName = "ANDROID",
            clientVersion = "21.26.364",
            userAgent = "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip",
            clientId = "3",
            extra = mapOf("androidSdkVersion" to 30, "osName" to "Android", "osVersion" to "11"),
        ),
        Client(
            name = "ios",
            clientName = "IOS",
            clientVersion = "21.26.4",
            userAgent = "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
            clientId = "5",
            extra = mapOf(
                "deviceMake" to "Apple",
                "deviceModel" to "iPhone16,2",
                "osName" to "iPhone",
                "osVersion" to "18.3.2.22D82",
            ),
        ),
        Client(
            name = "android_vr",
            clientName = "ANDROID_VR",
            clientVersion = "1.65.10",
            userAgent = "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
            clientId = "28",
            extra = mapOf(
                "deviceMake" to "Oculus",
                "deviceModel" to "Quest 3",
                "androidSdkVersion" to 32,
                "osName" to "Android",
                "osVersion" to "12L",
            ),
        ),
        Client(
            name = "visionos",
            clientName = "VISIONOS",
            clientVersion = "1.02",
            userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
            clientId = "101",
            extra = mapOf(
                "deviceMake" to "Apple",
                "deviceModel" to "RealityDevice17,1",
                "osName" to "visionOS",
                "osVersion" to "26.5.23O471",
            ),
        ),
        // Web embedded player acting as a THIRD-PARTY embed (non-YouTube
        // embedUrl; youtube.com origins are refused since 2026-03, error 152).
        // Doubles as the automatic age-gate bypass. Carries the public,
        // non-secret Innertube API key required by this client.
        Client(
            name = "web_embedded",
            clientName = "WEB_EMBEDDED_PLAYER",
            clientVersion = "2.20260708.00.00",
            userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            clientId = "56",
            embed = true,
            apiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
            thirdPartyEmbedUrl = "https://www.reddit.com/",
        ),
        // TV client, tried last: only fires when every direct client refused.
        Client(
            name = "tv",
            clientName = "TVHTML5",
            clientVersion = "7.20260707.07.00",
            userAgent = "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
            clientId = "7",
        ),
    )

    data class PlayerRequest(
        val endpoint: String,
        val headers: Map<String, String>,
        val body: JSONObject,
    )

    /**
     * Build the exact Innertube player request for one client — parity with
     * the website's buildInnertubePlayerRequest(), minus cookies and PO
     * tokens, which the app deliberately never attaches (see file header).
     */
    fun buildPlayerRequest(client: Client, videoId: String): PlayerRequest {
        val headers = linkedMapOf(
            "Content-Type" to "application/json",
            "User-Agent" to client.userAgent,
            "X-YouTube-Client-Name" to client.clientId,
            "X-YouTube-Client-Version" to client.clientVersion,
        )
        // Embedded clients carry a Referer matching the third-party embedUrl.
        if (client.embed && client.thirdPartyEmbedUrl != null) {
            headers["Referer"] = client.thirdPartyEmbedUrl
        }

        val clientContext = JSONObject()
        clientContext.put("clientName", client.clientName)
        clientContext.put("clientVersion", client.clientVersion)
        clientContext.put("hl", "en")
        clientContext.put("gl", "US")
        clientContext.put("utcOffsetMinutes", 0)
        clientContext.put("userAgent", client.userAgent)
        for ((key, value) in client.extra) clientContext.put(key, value)

        val context = JSONObject()
        context.put("client", clientContext)
        if (client.embed) {
            val thirdParty = JSONObject()
            thirdParty.put(
                "embedUrl",
                client.thirdPartyEmbedUrl ?: "https://www.youtube.com/watch?v=$videoId",
            )
            context.put("thirdParty", thirdParty)
        }

        val body = JSONObject()
        body.put("videoId", videoId)
        body.put("contentCheckOk", true)
        body.put("racyCheckOk", true)
        body.put("context", context)
        // Never serviceIntegrityDimensions: the app mints no PO tokens.

        val endpoint = if (client.apiKey != null) {
            "$PLAYER_ENDPOINT&key=${URLEncoder.encode(client.apiKey, "UTF-8")}"
        } else {
            PLAYER_ENDPOINT
        }
        return PlayerRequest(endpoint, headers, body)
    }

    /** True when YouTube's refusal is a BotGuard challenge, not a real gate. */
    fun isBotChallenge(status: String?, reason: String?): Boolean {
        if (reason.isNullOrEmpty()) return false
        if (status != null && status != "LOGIN_REQUIRED" && status != "ERROR" && status != "UNPLAYABLE") {
            return false
        }
        return Regex(
            """confirm\s+you['’]?re\s+not\s+a\s+bot|not\s+a\s+bot|unusual\s+traffic|suspicious\s+activity""",
            RegexOption.IGNORE_CASE,
        ).containsMatchIn(reason)
    }

    private val PLAYABILITY_MESSAGES = mapOf(
        "LOGIN_REQUIRED" to "This video is age-restricted or private, so YouTube requires a signed-in account.",
        "AGE_VERIFICATION_REQUIRED" to "This video is age-restricted, so YouTube requires a verified account.",
        "UNPLAYABLE" to "YouTube marked this video as unplayable (it may be private, removed, or region-locked).",
        "ERROR" to "YouTube could not load this video (it may have been removed).",
        "CONTENT_CHECK_REQUIRED" to "This video is flagged as sensitive and needs a confirmation YouTube only accepts from a signed-in account.",
        "LIVE_STREAM_OFFLINE" to "This live stream is offline, so there is no file to download.",
    )

    /**
     * Human-readable message for a non-OK playabilityStatus. App wording: the
     * bot check points at the free Android apps the UI shows below the error
     * (they download over the visitor's own connection too).
     */
    fun playabilityMessage(status: String?, reason: String?): String {
        if (status == null || status == "OK") return ""
        if (isBotChallenge(status, reason)) {
            return "YouTube served a bot check (\u201cSign in to confirm you\u2019re not a bot\u201d) for this phone\u2019s connection. Try one of the free Android apps below."
        }
        val base = PLAYABILITY_MESSAGES[status]
        if (base != null) return base
        return if (!reason.isNullOrEmpty()) "YouTube refused playback: $reason"
        else "YouTube refused playback ($status)."
    }

    /** Result of running the client table for one video. */
    data class Result(
        val formats: List<PlayerFormat>,
        val title: String?,
        val status: String?,
        val reason: String?,
        val botChallenged: Boolean,
    )

    /** Flatten streamingData; keep only direct-URL formats (cipher entries dropped). */
    fun collectFormats(data: JSONObject, sourceClient: String): List<PlayerFormat> {
        val streaming = data.optJSONObject("streamingData") ?: return emptyList()
        val out = mutableListOf<PlayerFormat>()
        for (arrayKey in listOf("formats", "adaptiveFormats")) {
            val arr = streaming.optJSONArray(arrayKey) ?: continue
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val url = item.optString("url", "").trim()
                if (url.isEmpty()) continue // signatureCipher entries: never deciphered
                out.add(
                    PlayerFormat(
                        url = url,
                        mimeType = item.optString("mimeType", ""),
                        qualityLabel = item.optString("qualityLabel", "").ifEmpty { null },
                        audioQuality = item.optString("audioQuality", "").ifEmpty { null },
                        bitrate = item.optLong("bitrate", 0L),
                        width = item.optInt("width", 0),
                        height = item.optInt("height", 0),
                        itag = item.optInt("itag", 0),
                        sourceClient = sourceClient,
                    ),
                )
            }
        }
        return out
    }

    private fun hasAudioAndVideo(formats: List<PlayerFormat>): Boolean {
        val audio = formats.any { Regex("audio/", RegexOption.IGNORE_CASE).containsMatchIn(it.mimeType) }
        val video = formats.any { Regex("video/", RegexOption.IGNORE_CASE).containsMatchIn(it.mimeType) }
        return audio && video
    }

    private fun dedupeByItag(formats: List<PlayerFormat>): List<PlayerFormat> {
        val seen = mutableSetOf<String>()
        val out = mutableListOf<PlayerFormat>()
        for (f in formats) {
            val key = if (f.itag != 0) f.itag.toString() else f.url
            if (!seen.add(key)) continue
            out.add(f)
        }
        return out
    }

    /** One blocking POST; null on any transport or parse failure. */
    private fun postPlayer(request: PlayerRequest): JSONObject? {
        var conn: HttpURLConnection? = null
        return try {
            conn = URL(request.endpoint).openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.instanceFollowRedirects = true
            for ((key, value) in request.headers) conn.setRequestProperty(key, value)
            conn.setRequestProperty("Accept", "application/json")
            conn.doOutput = true
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(request.body.toString()) }
            val code = conn.responseCode
            if (code !in 200..299) return null
            val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            JSONObject(text)
        } catch (_: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Run the client table for one video id. Keeps querying until both an
     * audio and a video track are collected (parity with the website: one
     * progressive-only client must not cap quality or break audio downloads),
     * then merges and de-duplicates by itag.
     */
    fun queryClients(videoId: String): Result {
        var lastStatus: String? = null
        var lastReason: String? = null
        var botChallenged = false
        var title: String? = null
        val collected = mutableListOf<PlayerFormat>()

        for (client in CLIENTS) {
            val data = postPlayer(buildPlayerRequest(client, videoId)) ?: continue
            if (title == null) {
                val t = data.optJSONObject("videoDetails")?.optString("title", "") ?: ""
                if (t.isNotEmpty()) title = t
            }
            val playability = data.optJSONObject("playabilityStatus")
            val status = playability?.optString("status", "")?.ifEmpty { null }
            val reason = playability?.optString("reason", "")?.ifEmpty { null }
            if (isBotChallenge(status, reason)) botChallenged = true
            if (status != null && status != "OK") {
                lastStatus = status
                lastReason = reason
                continue
            }
            // Only accept a client that returns at least one playable direct
            // URL: OK with SABR-only / cipher-only streamingData is not a win.
            val formats = collectFormats(data, client.clientName)
            if (formats.isEmpty()) continue
            collected.addAll(formats)
            if (hasAudioAndVideo(collected)) break
        }

        return Result(
            formats = dedupeByItag(collected),
            title = title,
            status = lastStatus,
            reason = lastReason,
            botChallenged = botChallenged,
        )
    }

    /** 11-character YouTube video id from common URL shapes (website parity). */
    fun extractYouTubeId(url: String): String? {
        val m = Regex("""(?:v=|youtu\.be/|shorts/|live/|embed/|clip/|/v/)([a-zA-Z0-9_-]{11})(?![\w-])""", RegexOption.IGNORE_CASE)
            .find(url) ?: return null
        return m.groupValues[1]
    }

    /** Convenience used by tests: flatten a JSONArray of formats. */
    fun formatsFromArray(arr: JSONArray?, sourceClient: String): List<PlayerFormat> {
        if (arr == null) return emptyList()
        val wrapper = JSONObject()
        wrapper.put("streamingData", JSONObject().put("formats", arr))
        return collectFormats(wrapper, sourceClient)
    }
}
