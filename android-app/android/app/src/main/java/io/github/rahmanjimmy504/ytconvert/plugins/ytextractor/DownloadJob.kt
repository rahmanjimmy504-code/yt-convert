// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

/**
 * One in-flight download shared between the plugin, the foreground service,
 * and the WebView progress events. Pure data + pure helpers so the math and
 * naming rules stay JVM-unit-testable.
 */
data class DownloadJob(
    val id: Long,
    val url: String,
    val filename: String,
    val mimeType: String,
    val title: String,
) {
    companion object {
        /** Whole-percent progress; total <= 0 (unknown length) reports -1. */
        fun progressPercent(received: Long, total: Long): Int {
            if (total <= 0 || received < 0) return -1
            val pct = (received * 100L) / total
            return pct.coerceIn(0L, 100L).toInt()
        }

        /** Compact human byte count for notifications and the progress row. */
        fun humanBytes(bytes: Long): String {
            if (bytes < 0) return ""
            val units = arrayOf("B", "KB", "MB", "GB")
            var value = bytes.toDouble()
            var unit = 0
            while (value >= 1024.0 && unit < units.size - 1) {
                value /= 1024.0
                unit++
            }
            return if (unit == 0) "${bytes} ${units[0]}"
            else String.format(java.util.Locale.US, "%.1f %s", value, units[unit])
        }
    }
}

/** States reported to the WebView's downloadProgress listener. */
object DownloadState {
    const val PROGRESS = "progress"
    const val COMPLETED = "completed"
    const val FAILED = "failed"
    const val CANCELLED = "cancelled"
}

/** Progress broadcast bus: the service publishes, the plugin forwards. */
object DownloadProgressBroadcaster {
    fun interface Listener {
        fun onEvent(job: DownloadJob, state: String, received: Long, total: Long, error: String?)
    }

    @Volatile
    var listener: Listener? = null

    fun publish(job: DownloadJob, state: String, received: Long, total: Long, error: String? = null) {
        listener?.onEvent(job, state, received, total, error)
    }
}
