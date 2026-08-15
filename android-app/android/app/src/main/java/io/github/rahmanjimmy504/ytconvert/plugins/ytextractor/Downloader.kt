// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import java.io.File

/**
 * MVP file download via Android's DownloadManager: a visible notification
 * with progress, completion handling, and storage in the public Downloads
 * directory (inside a YTConvert sub-folder).
 *
 * This is deliberately the boring system component — the foreground-service
 * download with MediaStore scanning lands in the next roadmap step. URL
 * enforcement happens here AGAIN (defense in depth): even a tampered reply
 * from the WebView cannot make the app fetch a non-allowlisted host.
 */
object Downloader {

    private const val SUBDIR = "YTConvert"

    /**
     * Enqueue a download; returns the DownloadManager id. Throws
     * IllegalArgumentException for non-allowlisted URLs.
     */
    fun enqueue(
        context: Context,
        url: String,
        filename: String,
        mimeType: String?,
        notificationTitle: String,
    ): Long {
        require(MediaHosts.isAllowedMediaUrl(url)) {
            "Refusing to download a host outside the on-device allowlist."
        }

        // On Android 6–9 the public Downloads sub-directory must exist before
        // the DownloadManager writes into it (scoped storage does it for us
        // from Android 10 on).
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            @Suppress("DEPRECATION")
            val dir = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                SUBDIR,
            )
            if (!dir.exists()) dir.mkdirs()
        }

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle(notificationTitle.take(80))
            .setDescription(filename)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "$SUBDIR/$filename")
        if (!mimeType.isNullOrBlank()) request.setMimeType(mimeType)
        return dm.enqueue(request)
    }
}
