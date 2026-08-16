// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import android.Manifest
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.concurrent.atomic.AtomicLong

/**
 * YTExtractor — on-device YouTube extraction for the YT Convert companion.
 *
 * The WebView asks for `extract({ url, format, quality })`; the plugin runs
 * the Innertube client table over the phone's own connection and answers with
 * ONE direct, allowlist-checked stream URL (progressive MP4 for video, the
 * original audio track for audio). `download(...)` then saves it in the
 * background via DownloadService: a data-sync foreground service streaming
 * into MediaStore.Downloads (API 29+) or Downloads/YTConvert (API 23–28),
 * with progress notifications AND a `downloadProgress` listener the UI
 * subscribes to. `cancelDownload(...)` stops an in-flight download and
 * discards the partial file.
 *
 * Invariants (see Innertube.kt / MediaHosts.kt):
 *  - no secrets in the APK (no API keys beyond YouTube's public web key, no
 *    tokens, no operator credentials);
 *  - no BotGuard emulation and no cookie harvesting;
 *  - every URL that leaves the plugin — and every URL the service fetches —
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
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications",
        ),
    ],
)
class YTExtractorPlugin : Plugin() {

    companion object {
        private val downloadIds = AtomicLong(System.currentTimeMillis() / 1000L)
    }

    private val progressListener =
        DownloadProgressBroadcaster.Listener { job, state, received, total, error ->
            val event = JSObject()
            event.put("downloadId", job.id)
            event.put("state", state)
            event.put("filename", job.filename)
            event.put("title", job.title)
            event.put("receivedBytes", received)
            event.put("totalBytes", total)
            event.put("percent", DownloadJob.progressPercent(received, total))
            if (error != null) event.put("error", error)
            notifyListeners("downloadProgress", event)
        }

    override fun load() {
        DownloadProgressBroadcaster.listener = progressListener
    }

    override fun handleOnDestroy() {
        if (DownloadProgressBroadcaster.listener === progressListener) {
            DownloadProgressBroadcaster.listener = null
        }
        super.handleOnDestroy()
    }

    /** Capability probe for diagnostics; `muxing` stays false until the
     *  on-device adaptive remux step lands. */
    @PluginMethod
    fun ping(call: PluginCall) {
        val ret = JSObject()
        ret.put("ok", true)
        ret.put("version", 2)
        ret.put("muxing", false)
        ret.put("backgroundDownloads", true)
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
        val mimeType = call.getString("mimeType") ?: ""
        val filename = FormatPicker.sanitizeDownloadFilename(title, extension)
        val id = downloadIds.incrementAndGet()

        // Permissions by Android generation:
        //  - 23–28: WRITE_EXTERNAL_STORAGE to write Downloads/YTConvert.
        //  - 33+:   POST_NOTIFICATIONS for the completion notice. The
        //           foreground-service progress notification shows either way,
        //           so a denial degrades, never blocks.
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            getPermissionState("storage") != PermissionState.GRANTED
        ) {
            needed.add("storage")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState("notifications") != PermissionState.GRANTED
        ) {
            needed.add("notifications")
        }
        if (needed.isEmpty()) {
            startDownloadService(call, id, url, filename, mimeType, title)
        } else {
            // Keep the job details on the call so the permission callback can
            // resume the same download (PluginCall is handed back unchanged).
            val data = call.getData()
            data.put("jobId", id)
            data.put("jobUrl", url)
            data.put("jobFilename", filename)
            data.put("jobMime", mimeType)
            data.put("jobTitle", title)
            requestPermissionForAliases(needed.toTypedArray(), call, "downloadAfterPermission")
        }
    }

    @PermissionCallback
    private fun downloadAfterPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            getPermissionState("storage") != PermissionState.GRANTED
        ) {
            call.reject("Storage permission is required to save downloads on this Android version.")
            return
        }
        // A denied notifications permission only hides the completion notice;
        // the foreground-service progress notification still appears.
        val data = call.getData()
        val id = data.optLong("jobId", -1L)
        val url = data.optString("jobUrl", "")
        val filename = data.optString("jobFilename", "")
        val mime = data.optString("jobMime", "")
        val title = data.optString("jobTitle", "download")
        if (id < 0 || url.isEmpty() || filename.isEmpty()) {
            call.reject("Download details were lost while asking for permission. Try again.")
            return
        }
        startDownloadService(call, id, url, filename, mime, title)
    }

    private fun startDownloadService(
        call: PluginCall,
        id: Long,
        url: String,
        filename: String,
        mimeType: String,
        title: String,
    ) {
        try {
            val intent = Intent(context, DownloadService::class.java).apply {
                putExtra(DownloadService.EXTRA_ID, id)
                putExtra(DownloadService.EXTRA_URL, url)
                putExtra(DownloadService.EXTRA_FILENAME, filename)
                putExtra(DownloadService.EXTRA_MIME, mimeType)
                putExtra(DownloadService.EXTRA_TITLE, title)
            }
            ContextCompat.startForegroundService(context, intent)
            val ret = JSObject()
            ret.put("downloadId", id)
            ret.put("filename", filename)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Could not start the background download: ${e.message ?: "unknown error"}")
        }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        val id = call.getLong("downloadId", -1L)
        if (id < 0) {
            call.reject("Missing downloadId.")
            return
        }
        DownloadService.cancel(id)
        val ret = JSObject()
        ret.put("ok", true)
        call.resolve(ret)
    }
}
