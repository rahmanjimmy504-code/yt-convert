// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Background download as a data-sync foreground service: the download keeps
 * running when the app is backgrounded or the screen turns off, with a
 * visible progress notification (Android requires this for foreground
 * services — it is the honest "we are using your connection" indicator).
 *
 * Storage: MediaStore.Downloads on API 29+ (scoped storage, no permission),
 * plain Downloads/YTConvert file on API 23–28 (permission requested by the
 * plugin before the service starts). Adaptive H.264/AAC jobs are stream-copy
 * muxed directly into that same final target by OnDeviceMuxer, and a
 * combined-stream audio download has only its AAC track stream-copied into an
 * audio-only M4A (never the whole video).
 *
 * Progress flows two ways: the notification, and DownloadProgressBroadcaster
 * → YTExtractorPlugin → the WebView's downloadProgress listener.
 */
class DownloadService : Service() {

    companion object {
        const val CHANNEL_ID = "yt-convert-downloads"
        const val EXTRA_ID = "yt-convert-download-id"
        const val EXTRA_URL = "yt-convert-download-url"
        const val EXTRA_AUDIO_URL = "yt-convert-download-audio-url"
        const val EXTRA_EXPECTED_BYTES = "yt-convert-download-expected-bytes"
        const val EXTRA_EXTRACT_AUDIO = "yt-convert-download-extract-audio"
        const val EXTRA_FILENAME = "yt-convert-download-filename"
        const val EXTRA_MIME = "yt-convert-download-mime"
        const val EXTRA_TITLE = "yt-convert-download-title"

        private const val CONNECT_TIMEOUT_MS = 8_000
        private const val READ_TIMEOUT_MS = 30_000
        private const val BUFFER_SIZE = 64 * 1024
        private const val NOTIFICATION_ID_BASE = 42_000
        private const val PROGRESS_NOTIFY_MIN_INTERVAL_MS = 500L

        private val BROWSER_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

        private val cancelFlags = ConcurrentHashMap<Long, AtomicBoolean>()
        private val activeJobs = AtomicInteger(0)

        /** Ask a running download to stop. Unknown ids are ignored. */
        fun cancel(id: Long) {
            cancelFlags[id]?.set(true)
        }

        fun notificationIdFor(id: Long): Int = NOTIFICATION_ID_BASE + (Math.abs(id) % 10_000).toInt()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val job = intent?.let {
            val id = it.getLongExtra(EXTRA_ID, -1L)
            val url = it.getStringExtra(EXTRA_URL)
            val filename = it.getStringExtra(EXTRA_FILENAME)
            if (id < 0 || url.isNullOrBlank() || filename.isNullOrBlank()) null
            else DownloadJob(
                id = id,
                url = url,
                filename = filename,
                mimeType = it.getStringExtra(EXTRA_MIME) ?: "",
                title = it.getStringExtra(EXTRA_TITLE) ?: filename,
                audioUrl = it.getStringExtra(EXTRA_AUDIO_URL)?.ifBlank { null },
                expectedBytes = it.getLongExtra(EXTRA_EXPECTED_BYTES, -1L),
                extractAudio = it.getBooleanExtra(EXTRA_EXTRACT_AUDIO, false),
            )
        }
        if (job == null) {
            stopSelfIfIdle()
            return START_NOT_STICKY
        }

        ensureChannel()
        // A foreground service must present itself immediately; the real
        // progress updates replace this initial notification.
        startForegroundCompat(notificationIdFor(job.id), progressNotification(job, 0, 0L, -1L))
        activeJobs.incrementAndGet()
        cancelFlags[job.id] = AtomicBoolean(false)

        Thread({ runDownload(job) }, "YTConvert-download-${job.id}").start()
        return START_NOT_STICKY
    }

    private data class TransferResult(val received: Long, val total: Long)

    private fun runDownload(job: DownloadJob) {
        val notificationId = notificationIdFor(job.id)
        val cancelFlag = cancelFlags[job.id] ?: AtomicBoolean(false)
        var target: MediaStoreSaver.Target? = null
        try {
            // Defense in depth: every URL was allowlist-checked by the plugin,
            // and both adaptive tracks are re-checked where network I/O occurs.
            if (!MediaHosts.isAllowedMediaUrl(job.url) ||
                (job.audioUrl != null && !MediaHosts.isAllowedMediaUrl(job.audioUrl))
            ) {
                throw SecurityException("Refusing to download a host outside the on-device allowlist.")
            }

            target = MediaStoreSaver.createTarget(this, job.filename, job.mimeType)
                ?: throw IllegalStateException("Could not create a file in Downloads/YTConvert.")

            var lastNotifyAt = 0L
            val publishProgress: (Long, Long) -> Unit = { received, total ->
                val now = System.currentTimeMillis()
                if (now - lastNotifyAt >= PROGRESS_NOTIFY_MIN_INTERVAL_MS) {
                    lastNotifyAt = now
                    val percent = DownloadJob.progressPercent(received, total)
                    notify(notificationId, progressNotification(job, percent, received, total))
                    DownloadProgressBroadcaster.publish(job, DownloadState.PROGRESS, received, total)
                }
            }

            val transfer = if (job.extractAudio) {
                // Audio-only remux of a combined progressive MP4: stream-copy
                // just its AAC track into an audio-only M4A. Runs before the
                // adaptive two-track branch so an extractAudio job can never
                // fall through to saving the whole video file.
                val copied = OnDeviceMuxer.extractAudio(
                    context = this,
                    target = target,
                    sourceUrl = job.url,
                    isCancelled = { cancelFlag.get() },
                    onProgress = publishProgress,
                )
                // Indeterminate total: the combined source length includes
                // the discarded video bytes.
                TransferResult(copied, -1L)
            } else if (job.muxing) {
                val audioUrl = job.audioUrl
                    ?: throw IllegalStateException("The adaptive audio track is missing.")
                val copied = OnDeviceMuxer.mux(
                    context = this,
                    target = target,
                    videoUrl = job.url,
                    audioUrl = audioUrl,
                    expectedBytes = job.expectedBytes,
                    isCancelled = { cancelFlag.get() },
                    onProgress = publishProgress,
                )
                TransferResult(copied, job.expectedBytes)
            } else {
                downloadSingleTrack(job, target, cancelFlag, publishProgress)
            }

            val finalSize = MediaStoreSaver.size(this, target).let {
                if (it > 0L) it else transfer.received
            }
            MediaStoreSaver.publish(this, target)
            DownloadProgressBroadcaster.publish(job, DownloadState.COMPLETED, finalSize, finalSize)
            notify(notificationId, completedNotification(job, finalSize))
        } catch (cancelled: OnDeviceMuxer.CancelledException) {
            target?.let { MediaStoreSaver.discard(this, it) }
            DownloadProgressBroadcaster.publish(job, DownloadState.CANCELLED, 0, -1)
            notify(notificationId, cancelledNotification(job))
        } catch (e: Exception) {
            target?.let { MediaStoreSaver.discard(this, it) }
            val message = e.message ?: "Unknown download error"
            DownloadProgressBroadcaster.publish(job, DownloadState.FAILED, 0, -1, message)
            notify(notificationId, failedNotification(job, message))
        } finally {
            cancelFlags.remove(job.id)
            activeJobs.decrementAndGet()
            stopSelfIfIdle()
        }
    }

    /** Existing zero-copy single-stream path for progressive video/original audio. */
    private fun downloadSingleTrack(
        job: DownloadJob,
        target: MediaStoreSaver.Target,
        cancelFlag: AtomicBoolean,
        onProgress: (Long, Long) -> Unit,
    ): TransferResult {
        var conn: HttpURLConnection? = null
        try {
            conn = URL(job.url).openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", BROWSER_UA)
            val code = conn.responseCode
            if (code !in 200..299) {
                throw IllegalStateException("YouTube's CDN answered HTTP $code. Try again, or use one of the free Android apps below.")
            }
            // contentLengthLong only exists from API 24; minSdk is 23.
            val total = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                conn.contentLengthLong
            } else {
                conn.contentLength.toLong()
            }
            val output = MediaStoreSaver.openOutput(this, target)
                ?: throw IllegalStateException("Could not open the destination for writing.")

            val input: InputStream = conn.inputStream
            var received = 0L
            val buffer = ByteArray(BUFFER_SIZE)
            output.use { out ->
                input.use { stream ->
                    while (true) {
                        if (cancelFlag.get()) throw OnDeviceMuxer.CancelledException()
                        val read = stream.read(buffer)
                        if (read < 0) break
                        out.write(buffer, 0, read)
                        received += read
                        onProgress(received, total)
                    }
                }
                out.flush()
            }
            return TransferResult(received, total)
        } finally {
            conn?.disconnect()
        }
    }

    private fun stopSelfIfIdle() {
        if (activeJobs.get() <= 0) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_DETACH)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(false)
            }
            stopSelf()
        }
    }

    private fun startForegroundCompat(id: Int, notification: android.app.Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(id, notification)
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Downloads",
                    NotificationManager.IMPORTANCE_LOW,
                )
                channel.description = "Progress and results of YT Convert downloads."
                manager.createNotificationChannel(channel)
            }
        }
    }

    private fun launchIntent(): PendingIntent? {
        val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        return PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun baseBuilder(job: DownloadJob, ongoing: Boolean): NotificationCompat.Builder {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("YT Convert \u2014 ${job.title.take(70)}")
            .setOnlyAlertOnce(true)
            .setOngoing(ongoing)
        launchIntent()?.let { builder.setContentIntent(it) }
        return builder
    }

    private fun progressNotification(
        job: DownloadJob,
        percent: Int,
        received: Long,
        total: Long,
    ): android.app.Notification {
        val builder = baseBuilder(job, ongoing = true)
        val action = when {
            job.extractAudio -> "Saving audio"
            job.muxing -> "Combining on device"
            else -> "Downloading"
        }
        if (percent in 0..100 && total > 0) {
            builder.setProgress(100, percent, false)
            builder.setContentText(
                "$action \u00b7 $percent% \u00b7 ${DownloadJob.humanBytes(received)} of ${DownloadJob.humanBytes(total)}",
            )
        } else {
            builder.setProgress(0, 0, true)
            builder.setContentText("$action\u2026 ${DownloadJob.humanBytes(received)}")
        }
        return builder.build()
    }

    private fun completedNotification(job: DownloadJob, bytes: Long): android.app.Notification =
        baseBuilder(job, ongoing = false)
            .setContentText("Saved to Downloads/YTConvert \u00b7 ${DownloadJob.humanBytes(bytes)}")
            .build()

    private fun failedNotification(job: DownloadJob, message: String): android.app.Notification =
        baseBuilder(job, ongoing = false)
            .setContentText("Failed: ${message.take(100)}")
            .build()

    private fun cancelledNotification(job: DownloadJob): android.app.Notification =
        baseBuilder(job, ongoing = false)
            .setContentText("Download cancelled.")
            .build()

    private fun notify(id: Int, notification: android.app.Notification) {
        try {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(id, notification)
        } catch (_: Exception) {
            // Notifications are best effort; the WebView listener still reports.
        }
    }

}
