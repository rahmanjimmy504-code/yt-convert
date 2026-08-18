// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import android.content.ContentValues
import android.content.Context
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.provider.OpenableColumns
import java.io.Closeable
import java.io.File
import java.io.OutputStream
import java.io.RandomAccessFile

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

    /**
     * MediaMuxer plus the descriptor that must stay open for its lifetime.
     * close() releases the muxer before closing the MediaStore descriptor.
     */
    class MuxerHandle(
        val muxer: MediaMuxer,
        private val descriptor: ParcelFileDescriptor?,
    ) : Closeable {
        override fun close() {
            try {
                muxer.release()
            } finally {
                descriptor?.close()
            }
        }
    }

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

    /**
     * Open the final target as a seekable MP4 output. MediaStore targets only
     * exist on API 29+, where MediaMuxer's FileDescriptor constructor is
     * available; API 23–28 use the final public Downloads file path directly.
     */
    fun openMuxer(context: Context, target: Target): MuxerHandle? =
        openMuxer(context, target, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

    /**
     * [openMuxer] with an explicit [MediaMuxer.OutputFormat] — the OGG
     * container for Opus transcodes (API 26+). The caller is responsible for
     * gating formats newer than the muxer's FileDescriptor constructor.
     */
    fun openMuxer(context: Context, target: Target, outputFormat: Int): MuxerHandle? {
        return try {
            if (target.uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val descriptor = context.contentResolver.openFileDescriptor(target.uri, "rw") ?: return null
                try {
                    MuxerHandle(MediaMuxer(descriptor.fileDescriptor, outputFormat), descriptor)
                } catch (e: Exception) {
                    descriptor.close()
                    throw e
                }
            } else {
                val path = target.file?.absolutePath ?: return null
                MuxerHandle(MediaMuxer(path, outputFormat), null)
            }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Seekable raw byte target for the WAV/MP3/FLAC writers, which need to
     * patch header bytes (sizes, MD5) at EOF. The stream writes append; patch
     * repositions and rewrites. Exactly one of pfd (API 29+) / raf (23–28)
     * backs the handle.
     */
    class RawHandle(
        private val stream: OutputStream,
        private val descriptor: ParcelFileDescriptor?,
        private val randomAccess: RandomAccessFile?,
    ) : Closeable {
        private var count = 0L
        private val copy = ByteArray(16 * 1024)

        fun write(bytes: ByteArray, offset: Int, length: Int) {
            stream.write(bytes, offset, length)
            count += length
        }

        fun write(src: java.nio.ByteBuffer) {
            while (src.hasRemaining()) {
                val n = minOf(copy.size, src.remaining())
                src.get(copy, 0, n)
                stream.write(copy, 0, n)
                count += n
            }
        }

        /** Rewrite [bytes] at absolute file [offset] (headers are patched at EOS). */
        fun patch(offset: Long, bytes: ByteArray) {
            stream.flush()
            val raf = randomAccess
            if (raf != null) {
                raf.seek(offset)
                raf.write(bytes)
                return
            }
            val pfd = descriptor ?: return
            java.io.FileInputStream(pfd.fileDescriptor).use { fis ->
                val channel = fis.channel
                channel.position(offset)
                channel.write(java.nio.ByteBuffer.wrap(bytes))
            }
        }

        fun bytesWritten(): Long = count

        override fun close() {
            try {
                stream.flush()
            } catch (_: Exception) {
            }
            try {
                stream.close()
            } catch (_: Exception) {
            }
            descriptor?.let {
                try {
                    it.close()
                } catch (_: Exception) {
                }
            }
            randomAccess?.let {
                try {
                    it.close()
                } catch (_: Exception) {
                }
            }
        }
    }

    /** Open [target] for seekable raw byte writing (WAV/MP3/FLAC outputs). */
    fun openRaw(context: Context, target: Target): RawHandle? {
        return try {
            if (target.uri != null) {
                val pfd = context.contentResolver.openFileDescriptor(target.uri, "rw") ?: return null
                try {
                    RawHandle(java.io.FileOutputStream(pfd.fileDescriptor), pfd, null)
                } catch (e: Exception) {
                    pfd.close()
                    throw e
                }
            } else {
                val file = target.file ?: return null
                val raf = RandomAccessFile(file, "rw")
                try {
                    RawHandle(java.io.FileOutputStream(raf.getFD()), null, raf)
                } catch (e: Exception) {
                    raf.close()
                    throw e
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Final target size after the writer/muxer has closed, or -1 if unknown. */
    fun size(context: Context, target: Target): Long {
        target.file?.let { return if (it.exists()) it.length() else -1L }
        val uri = target.uri ?: return -1L
        return try {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                if (!cursor.moveToFirst()) return@use -1L
                val index = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (index < 0 || cursor.isNull(index)) -1L else cursor.getLong(index)
            } ?: -1L
        } catch (_: Exception) {
            -1L
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
