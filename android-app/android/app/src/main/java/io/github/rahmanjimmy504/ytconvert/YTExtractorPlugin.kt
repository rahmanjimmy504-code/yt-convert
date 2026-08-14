/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * YTExtractor: the native bridge the web UI calls instead of the website's
 * /api/convert and /api/video-info routes.
 *
 * THIS IS DELIBERATELY AN EMPTY PLUGIN (build plan step 2). It compiles,
 * registers, and answers honestly that on-device extraction is not available
 * yet, so the debug APK can be installed and verified (step 4) before any
 * extraction or download logic is added (steps 5+). The method signatures and
 * event names already match src/lib/extractor.ts, so filling them in later
 * requires no change to the user interface.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

package io.github.rahmanjimmy504.ytconvert

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "YTExtractor")
class YTExtractorPlugin : Plugin() {

    companion object {
        /**
         * Flip to true only when getInfo/startDownload are really implemented
         * (NewPipeExtractor + OkHttp downloader, build plan step 5). While
         * this is false the UI keeps the Download here panel visible but
         * honestly disabled instead of pretending it works.
         */
        private const val EXTRACTION_AVAILABLE = false

        private const val ENGINE = "stub"
        private const val UNAVAILABLE_REASON =
            "This build ships the interface only. On-device extraction is not enabled yet."

        /** Error code the web layer checks for; keep in sync with extractor.ts. */
        private const val NOT_IMPLEMENTED = "NOT_IMPLEMENTED"

        /** Event names emitted to the web layer once downloading exists. */
        const val EVENT_PROGRESS = "downloadProgress"
        const val EVENT_COMPLETE = "downloadComplete"
        const val EVENT_FAILED = "downloadFailed"
    }

    /** Whether on-device extraction can be used right now. Never rejects. */
    @PluginMethod
    fun getStatus(call: PluginCall) {
        val result = JSObject()
        result.put("available", EXTRACTION_AVAILABLE)
        result.put("engine", ENGINE)
        if (!EXTRACTION_AVAILABLE) {
            result.put("reason", UNAVAILABLE_REASON)
        }
        call.resolve(result)
    }

    /**
     * Resolve public metadata for a link on the device.
     *
     * Step 5 replaces the rejection below with a NewPipeExtractor lookup that
     * returns title, author, thumbnail, duration, views, published, platform
     * and videoQualityPlans. No network call happens in this stub.
     */
    @PluginMethod
    fun getInfo(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("A url is required")
            return
        }
        call.reject(UNAVAILABLE_REASON, NOT_IMPLEMENTED)
    }

    /**
     * Start a foreground download.
     *
     * Step 6/7 replaces this with an OkHttp download running in a foreground
     * service that emits EVENT_PROGRESS, writes through MediaStore, and
     * finishes with EVENT_COMPLETE (or EVENT_FAILED).
     */
    @PluginMethod
    fun startDownload(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("A url is required")
            return
        }
        call.reject(UNAVAILABLE_REASON, NOT_IMPLEMENTED)
    }

    /**
     * Cancel an in-flight download. Resolving instead of rejecting keeps the
     * UI's cancel path harmless while no download can be running.
     */
    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        call.resolve()
    }

    /**
     * Helper the download implementation will use to report progress.
     * Present now so the event contract is visible in one place.
     */
    @Suppress("unused")
    fun emitProgress(id: String, percent: Double, bytesWritten: Long, totalBytes: Long) {
        val payload = JSObject()
        payload.put("id", id)
        payload.put("percent", percent)
        payload.put("bytesWritten", bytesWritten)
        payload.put("totalBytes", totalBytes)
        notifyListeners(EVENT_PROGRESS, payload)
    }
}
