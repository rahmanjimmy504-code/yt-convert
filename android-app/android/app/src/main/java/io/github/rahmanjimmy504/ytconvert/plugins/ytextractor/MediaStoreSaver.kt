// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.OutputStream

/**
 * Where finished bytes land, per Android generation:
 *
 *  - API 29+ (scoped storage): a MediaStore.Downloads entry in
 *    Download/YTConvert, written while IS_PENDING=1 and published when the
 *    stream completes. No runtime permission is needed for this collection.
 *  - API 23–28: a plain file in the public Downloads/YTConvert directory,
 *    which needs the WRITE_EXTERNAL_STORAGE permission the plugin requests
 *    (declared with maxSdkVersion 28).
 *
 * A re-download of the same filename replaces the previous entry instead of
 * piling up near-duplicates.
 */
object MediaStoreSaver {

    private const val RELATIVE_PATH = "Download/YTConvert"

    /** Opaque write target: exactly one of uri (29+) / file (23–28) is set. */
    data class Target(val uri: Uri?, val file: File?)

    fun createTarget(context: Context, filename: String, mimeType: String): Target? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            deleteExisting(resolver, filename)
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, filename)
                put(MediaStore.Downloads.MIME_TYPE, mimeType.ifBlank { "application/octet-stream" })
                put(MediaStore.Downloads.RELATIVE_PATH, RELATIVE_PATH)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return null
            Target(uri, null)
        } else {
            @Suppress("DEPRECATION")
            val dir = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "YTConvert",
            )
            if (!dir.exists() && !dir.mkdirs()) return null
            val file = File(dir, filename)
            if (file.exists() && !file.delete()) return null
            Target(null, file)
        }
    }

    fun openOutput(context: Context, target: Target): OutputStream? {
        return try {
            if (target.uri != null) context.contentResolver.openOutputStream(target.uri, "w")
            else target.file?.outputStream()
        } catch (_: Exception) {
            null
        }
    }

    /** Clear IS_PENDING so other apps (gallery, file managers) see the file. */
    fun publish(context: Context, target: Target) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && target.uri != null) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.IS_PENDING, 0)
            }
            try {
                context.contentResolver.update(target.uri, values, null, null)
            } catch (_: Exception) {
                // The file is still on disk; publishing only affects visibility.
            }
        }
    }

    /** Remove a partially-written target (failed or cancelled download). */
    fun discard(context: Context, target: Target) {
        try {
            if (target.uri != null) context.contentResolver.delete(target.uri, null, null)
            else target.file?.delete()
        } catch (_: Exception) {
            // Best effort; a stray pending entry is harmless and replaces on retry.
        }
    }

    private fun deleteExisting(
        resolver: android.content.ContentResolver,
        filename: String,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        try {
            val selection = "${MediaStore.Downloads.DISPLAY_NAME} = ? AND ${MediaStore.Downloads.RELATIVE_PATH} = ?"
            resolver.delete(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                selection,
                arrayOf(filename, "$RELATIVE_PATH/"),
            )
        } catch (_: Exception) {
            // Duplicate display names are legal in MediaStore; cleanup is cosmetic.
        }
    }
}
