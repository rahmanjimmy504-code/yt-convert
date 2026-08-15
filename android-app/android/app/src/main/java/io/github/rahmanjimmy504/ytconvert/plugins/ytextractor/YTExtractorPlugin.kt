// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import android.Manifest
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * YTExtractor — on-device YouTube extraction for the YT Convert companion.
 *
 * The WebView asks for `extract({ url, format, quality })`; the plugin runs
 * the Innertube client table over the phone's own connection and answers with
 * ONE direct, allowlist-checked stream URL (progressive MP4 for video, the
 * original audio track for audio). `download(...)` then saves it via the
 * system DownloadManager into Downloads/YTConvert.
 *
 * Invariants (see Innertube.kt / MediaHosts.kt):
 *  - no secrets in the APK (no API keys beyond YouTube's public web key, no
 *    tokens, no operator credentials);
 *  - no BotGuard emulation and no cookie harvesting;
 *  - every URL that leaves the plugin — and every URL handed to download —
 *    passes the MediaHosts SSRF allowlist.
 *
 * The React bundle discovers this plugin via Capacitor.isPluginAvailable()
 * (android-app/src/lib/runtime.ts) and only enables the real download button
 * when it is registered.
 */
@CapacitorPlugin(
    name = "YTExtractor",
    permissions = [
        Permission(
            strings = [Manifest.permission.WRITE_EXTERNAL_STORAGE],
            alias = "storage",
        ),
    ],
)
class YTExtractorPlugin : Plugin() {

    /** Capability probe for diagnostics; `muxing` stays false until the
     *  on-device adaptive remux step lands. */
    @PluginMethod
    fun ping(call: PluginCall) {
        val ret = JSObject()
        ret.put("ok", true)
        ret.put("version", 1)
        ret.put("muxing", false)
        call.resolve(ret)
    }

    @PluginMethod
    fun extract(call: PluginCall) {
        val pageUrl = call.getString("url")
        if (pageUrl.isNullOrBlank()) {
            call.reject("Missing url.")
            return
        }
        val format = call.getString("format") ?: "video"
        val quality = call.getString("quality") ?: "best"

        // Capacitor 7 already invokes plugin methods off the UI thread (the
        // "CapacitorPlugins" HandlerThread), but an extraction can hold that
        // single thread for tens of seconds, so the network runs on its own
        // worker and the call is resolved from there (resolve/reject post
        // back to the WebView internally).
        Thread({
            try {
                call.resolve(runExtraction(pageUrl.trim(), format, quality))
            } catch (e: Exception) {
                call.reject("On-device extraction failed: ${e.message ?: "unknown error"}")
            }
        }, "YTExtractor-query").start()
    }

    private fun runExtraction(pageUrl: String, format: String, quality: String): JSObject {
        val videoId = Innertube.extractYouTubeId(pageUrl)
            ?: throw IllegalArgumentException("Invalid YouTube URL.")

        val result = Innertube.queryClients(videoId)
        if (result.formats.isEmpty()) {
            val explained = Innertube.playabilityMessage(result.status, result.reason)
            val message = when {
                explained.isNotEmpty() -> explained
                result.botChallenged ->
                    "YouTube served a bot check for this phone\u2019s connection. Try one of the free Android apps below."
                else ->
                    "YouTube did not return a playable stream. This can happen for music-label videos, region-locked uploads, or recently removed content."
            }
            throw IllegalStateException(message)
        }

        val wantAudio = format == "audio" || format == "mp3"
        val ret = JSObject()
        ret.put("videoId", videoId)
        ret.put("title", result.title ?: videoId)

        if (wantAudio) {
            val pick = FormatPicker.pickAudio(result.formats, quality)
                ?: throw IllegalStateException(
                    "No playable audio stream is available for this video.",
                )
            val combined = FormatPicker.isProgressiveMp4(pick)
            ret.put("url", pick.url)
            ret.put("mimeType", if (combined) "video/mp4" else normalizeAudioMime(pick.mimeType))
            ret.put("extension", FormatPicker.extensionForMime(pick.mimeType))
            pick.qualityLabel?.let { ret.put("qualityLabel", it) }
            if (pick.bitrate > 0) ret.put("bitrate", pick.bitrate)
            ret.put("sourceClient", pick.sourceClient)
            ret.put(
                "note",
                if (combined) {
                    "This video exposes no separate audio track; the combined stream (MP4) carries its audio."
                } else {
                    "Original audio track — saved without transcoding."
                },
            )
            return ret
        }

        // Video: progressive MP4 only (the MVP cannot remux adaptive tracks yet).
        val plan = FormatPicker.planVideoDownload(result.formats, quality)
        val pick = when (plan) {
            is VideoPlan.Progressive -> plan.video
            is VideoPlan.Mux ->
                // The asked-for height only exists as separate video + audio
                // tracks. Honest fallback: deliver the best progressive file
                // and say so; on-device HD muxing arrives in a later step.
                FormatPicker.pickVideo(result.formats, "best")
                    ?: throw IllegalStateException(
                        "No progressive MP4 with audio is available for this video.",
                    )
            null -> FormatPicker.pickVideo(result.formats, quality)
                ?: throw IllegalStateException(
                    "No progressive MP4 with audio is available for this video.",
                )
        }

        ret.put("url", pick.url)
        ret.put("mimeType", "video/mp4")
        ret.put("extension", "mp4")
        pick.qualityLabel?.let { ret.put("qualityLabel", it) }
        if (pick.height > 0) ret.put("height", pick.height)
        if (pick.bitrate > 0) ret.put("bitrate", pick.bitrate)
        ret.put("sourceClient", pick.sourceClient)
        if (plan is VideoPlan.Mux) {
            val asked = plan.video.qualityLabel ?: "${plan.video.height}p"
            ret.put(
                "note",
                "$asked needs combining separate video + audio tracks — on-device muxing arrives in a later release. The closest single-file stream is used for now.",
            )
        }
        return ret
    }

    private fun normalizeAudioMime(mime: String): String {
        val m = mime.lowercase()
        return when {
            Regex("audio/(mp4|aac|x-m4a)").containsMatchIn(m) -> "audio/mp4"
            Regex("audio/mpeg|audio/mp3").containsMatchIn(m) -> "audio/mpeg"
            Regex("audio/webm|opus").containsMatchIn(m) -> "audio/webm"
            Regex("audio/ogg").containsMatchIn(m) -> "audio/ogg"
            else -> mime
        }
    }

    @PluginMethod
    fun download(call: PluginCall) {
        // Android 6–9 needs the runtime storage permission; Android 10+ saves
        // into public Downloads via scoped storage with no permission at all.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            getPermissionState("storage") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("storage", call, "downloadAfterPermission")
            return
        }
        startDownload(call)
    }

    @PermissionCallback
    private fun downloadAfterPermission(call: PluginCall) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            startDownload(call)
        } else {
            call.reject("Storage permission is required to save downloads on this Android version.")
        }
    }

    private fun startDownload(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("Missing url.")
            return
        }
        if (!MediaHosts.isAllowedMediaUrl(url)) {
            call.reject("Refusing to download a host outside the on-device allowlist.")
            return
        }
        val title = call.getString("title") ?: "download"
        val extension = call.getString("extension") ?: "bin"
        val mimeType = call.getString("mimeType")
        val filename = FormatPicker.sanitizeDownloadFilename(title, extension)

        try {
            val id = Downloader.enqueue(context, url, filename, mimeType, "YT Convert \u2014 $title")
            val ret = JSObject()
            ret.put("downloadId", id)
            ret.put("filename", filename)
            call.resolve(ret)
        } catch (e: IllegalArgumentException) {
            call.reject(e.message ?: "Download rejected by the allowlist.")
        } catch (e: Exception) {
            call.reject("Could not start the download: ${e.message ?: "unknown error"}")
        }
    }
}
