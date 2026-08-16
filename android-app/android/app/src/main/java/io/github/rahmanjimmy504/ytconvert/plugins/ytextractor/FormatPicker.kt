// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

/**
 * Pure format selection, ported from the website's src/lib/youtube-formats.ts
 * so the companion picks streams with the same rules as the server.
 *
 * Scope: progressive MP4 video, ORIGINAL audio (usually AAC in M4A), and a
 * stream-copy plan for adaptive H.264 MP4 + AAC. Selection stays deterministic
 * and side-effect free so it can be unit-tested on the JVM; OnDeviceMuxer does
 * the actual no-reencode container work.
 */

/** One playable stream as reported by Innertube (direct-URL entries only). */
data class PlayerFormat(
    val url: String,
    val mimeType: String,
    val qualityLabel: String?,
    val audioQuality: String?,
    val bitrate: Long,
    val width: Int,
    val height: Int,
    val itag: Int,
    /** Innertube client that minted this URL (diagnostics only). */
    val sourceClient: String,
    /** CDN payload length from Innertube, or -1 when omitted. */
    val contentLength: Long = -1L,
)

/** What it takes to honour a video quality request with the formats on hand. */
sealed class VideoPlan {
    data class Progressive(val video: PlayerFormat) : VideoPlan()
    data class Mux(val video: PlayerFormat, val audio: PlayerFormat) : VideoPlan()
}

object FormatPicker {

    private val PROGRESSIVE_MP4_ITAGS = setOf(18, 22, 37, 38, 59, 78)

    fun isProgressiveMp4Itag(itag: Int): Boolean = PROGRESSIVE_MP4_ITAGS.contains(itag)

    private fun hasAudio(f: PlayerFormat): Boolean =
        f.audioQuality != null || Regex("audio/", RegexOption.IGNORE_CASE).containsMatchIn(f.mimeType)

    /** A muxed video+audio MP4 (what the MVP can download directly). */
    fun isProgressiveMp4(f: PlayerFormat): Boolean {
        val mime = f.mimeType
        return Regex("video/mp4", RegexOption.IGNORE_CASE).containsMatchIn(mime) &&
            hasAudio(f) &&
            !Regex("audio/only", RegexOption.IGNORE_CASE).containsMatchIn(mime)
    }

    private fun isVideoOnlyMp4(f: PlayerFormat): Boolean =
        Regex("video/mp4", RegexOption.IGNORE_CASE).containsMatchIn(f.mimeType) && !hasAudio(f)

    private fun isAudioOnly(f: PlayerFormat): Boolean {
        if (Regex("video/", RegexOption.IGNORE_CASE).containsMatchIn(f.mimeType)) return false
        return Regex("audio/", RegexOption.IGNORE_CASE).containsMatchIn(f.mimeType) ||
            (f.audioQuality != null && f.qualityLabel == null && f.height == 0)
    }

    private fun isM4a(f: PlayerFormat): Boolean =
        Regex("audio/(mp4|aac|x-m4a)|mp4a", RegexOption.IGNORE_CASE).containsMatchIn(f.mimeType)

    private fun isRealMp3(f: PlayerFormat): Boolean =
        Regex("audio/(mpeg|mp3)", RegexOption.IGNORE_CASE).containsMatchIn(f.mimeType)

    private fun pickClosestHeight(list: List<PlayerFormat>, target: Int): PlayerFormat? {
        if (list.isEmpty()) return null
        // Prefer the highest resolution at or below the target.
        val atOrBelow = list.filter { it.height <= target }
        if (atOrBelow.isNotEmpty()) {
            return atOrBelow.sortedWith(
                compareByDescending<PlayerFormat> { it.height }.thenByDescending { it.bitrate },
            ).first()
        }
        // Nothing small enough: the lowest resolution available (closest above).
        return list.sortedWith(
            compareBy<PlayerFormat> { it.height }.thenBy { it.bitrate },
        ).first()
    }

    private fun pickClosestBitrate(list: List<PlayerFormat>, targetKbps: Int): PlayerFormat? {
        if (list.isEmpty()) return null
        val kbps = { f: PlayerFormat -> Math.round(f.bitrate / 1000.0).toInt() }
        val atOrBelow = list.filter { kbps(it) <= targetKbps }
        if (atOrBelow.isNotEmpty()) {
            return atOrBelow.maxByOrNull { it.bitrate }
        }
        return list.minByOrNull { it.bitrate }
    }

    private fun pickProgressiveForQuality(progressive: List<PlayerFormat>, quality: String): PlayerFormat? {
        if (quality == "best" || !Regex("""^\d+$""").matches(quality)) {
            return progressive.sortedWith(
                compareByDescending<PlayerFormat> { it.height }.thenByDescending { it.bitrate },
            ).firstOrNull()
        }
        return pickClosestHeight(progressive, quality.toInt())
    }

    /** Every URL handed to the picker must already pass MediaHosts; re-check anyway. */
    private fun usable(formats: List<PlayerFormat>): List<PlayerFormat> =
        formats.filter { MediaHosts.isAllowedMediaUrl(it.url) }

    /** Best progressive MP4 for a quality selection ('best' | numeric height). */
    fun pickVideo(formats: List<PlayerFormat>, quality: String): PlayerFormat? {
        val progressive = usable(formats).filter { isProgressiveMp4(it) }
        val picked = pickProgressiveForQuality(progressive, quality)
        if (picked != null) return picked
        // Fallback contract from the website: preserve progressive itag 18.
        return usable(formats).firstOrNull { it.itag == 18 && isProgressiveMp4Itag(18) }
    }

    /**
     * Best audio-only track for a bitrate selection ('best' | numeric kbps).
     * Prefers M4A/AAC (universally playable). A real MP3 stream would win if
     * one ever existed on-device (parity with the website); Innertube never
     * serves MP3, so in practice this is original AAC/Opus audio.
     */
    fun pickAudio(formats: List<PlayerFormat>, quality: String): PlayerFormat? {
        val audio = usable(formats).filter { isAudioOnly(it) }
        val realMp3 = audio.filter { isRealMp3(it) }
        if (realMp3.isNotEmpty()) {
            return if (quality == "best" || !Regex("""^\d+$""").matches(quality)) {
                realMp3.maxByOrNull { it.bitrate }
            } else {
                pickClosestBitrate(realMp3, quality.toInt())
            }
        }
        val preferred = audio.filter { isM4a(it) }
        val pool = if (preferred.isNotEmpty()) preferred else audio
        if (pool.isEmpty()) {
            // Music-label uploads can expose only a progressive itag 18 with no
            // adaptive audio. Hand back that combined stream; the caller labels
            // it honestly (MP4 container, note explains there is no separate
            // audio track) instead of pretending to save a music-only file.
            return pickProgressiveForQuality(usable(formats).filter { isProgressiveMp4(it) }, "best")
        }
        return if (quality == "best" || !Regex("""^\d+$""").matches(quality)) {
            pool.maxByOrNull { it.bitrate }
        } else {
            pickClosestBitrate(pool, quality.toInt())
        }
    }

    /** Highest height available across usable formats (0 when unknown). */
    private fun maxHeight(formats: List<PlayerFormat>): Int =
        usable(formats).maxOfOrNull { it.height } ?: 0

    /**
     * Port of planVideoDownload(): use a single progressive file when it meets
     * the request, otherwise pair compatible H.264 video-only MP4 and AAC/M4A
     * tracks for OnDeviceMuxer. Never promise a silent or incompatible file.
     */
    fun planVideoDownload(formats: List<PlayerFormat>, quality: String): VideoPlan? {
        val usableFormats = usable(formats)
        if (usableFormats.isEmpty()) return null

        val progressive = usableFormats.filter { isProgressiveMp4(it) }
        val progressivePick = pickProgressiveForQuality(progressive, quality)

        val numeric = Regex("""^\d+$""").matches(quality)
        val target = if (numeric) quality.toInt() else maxHeight(usableFormats)

        if (progressivePick != null && progressivePick.height >= target) {
            return VideoPlan.Progressive(progressivePick)
        }

        // Mux path is deliberately strict: MediaMuxer emits an MP4, so only
        // H.264/avc1 video and AAC/M4A audio are compatible. VP9/AV1 or Opus
        // must fall back to progressive rather than fail halfway through.
        val videoOnly = usableFormats.filter { isVideoOnlyMp4(it) }
        val avc1 = videoOnly.filter { Regex("avc1", RegexOption.IGNORE_CASE).containsMatchIn(it.mimeType) }
        val videoPick = if (avc1.isNotEmpty()) pickClosestHeight(avc1, target) else null

        val audioOnly = usableFormats.filter { isAudioOnly(it) }
        val m4a = audioOnly.filter { isM4a(it) }
        val audioPick = m4a.maxByOrNull { it.bitrate }

        if (videoPick != null && audioPick != null) {
            return VideoPlan.Mux(videoPick, audioPick)
        }

        return if (progressivePick != null) VideoPlan.Progressive(progressivePick) else null
    }

    /** File extension that matches the real container. Never labels AAC as .mp3. */
    fun extensionForMime(mime: String): String {
        val m = mime.lowercase()
        if (Regex("video/mp4|application/mp4").containsMatchIn(m)) return "mp4"
        if (Regex("video/webm").containsMatchIn(m)) return "webm"
        if (Regex("audio/mpeg|audio/mp3").containsMatchIn(m)) return "mp3"
        if (Regex("audio/(mp4|aac|x-m4a)").containsMatchIn(m)) return "m4a"
        if (!m.startsWith("video/") && m.contains("mp4a")) return "m4a"
        if (Regex("audio/ogg|application/ogg").containsMatchIn(m)) return "ogg"
        if (Regex("audio/webm|opus").containsMatchIn(m)) return "webm"
        return "bin"
    }

    /**
     * Filename safe for every filesystem, ported from the website's
     * sanitizeDownloadFilename(): NFKD-normalised, control chars and
     * \/:*?"<>| stripped, whitespace collapsed, capped at 80 chars.
     */
    fun sanitizeDownloadFilename(title: String, ext: String): String {
        val normalized = java.text.Normalizer.normalize(title, java.text.Normalizer.Form.NFKD)
        val base = normalized
            .replace(Regex("""[\u0000-\u001F\u007F]"""), "")
            .replace(Regex("""[\\/:*?"<>|]+"""), "")
            .replace(Regex("""\s+"""), " ")
            .trim()
            .take(80)
        val safeBase = if (base.isEmpty()) "download" else base
        val cleanExt = ext.replace(Regex("""[^a-zA-Z0-9]"""), "")
        val safeExt = if (cleanExt.isEmpty()) "bin" else cleanExt.lowercase()
        return "$safeBase.$safeExt"
    }
}
