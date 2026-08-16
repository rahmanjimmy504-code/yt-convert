// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.nio.ByteBuffer

/**
 * Stream-copy remux for YouTube's adaptive H.264 MP4 + AAC tracks, plus
 * audio-only extraction from a progressive video+AAC MP4.
 *
 * MediaExtractor reads allowlist-checked CDN URLs directly and MediaMuxer
 * writes directly to the pending MediaStore/file target. There is no decoded
 * frame, re-encode, or intermediate file: only compressed samples move from
 * the source containers into the final M4A/MP4 container.
 */
object OnDeviceMuxer {

    private const val INITIAL_BUFFER_SIZE = 1024 * 1024
    private const val MAX_BUFFER_SIZE = 16 * 1024 * 1024
    private const val BROWSER_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

    /** Raised at sample boundaries when the foreground-service job is cancelled. */
    class CancelledException : Exception("Download cancelled.")

    private data class SourceTrack(
        val extractor: MediaExtractor,
        val sourceIndex: Int,
        val format: MediaFormat,
        var outputIndex: Int = -1,
        var ended: Boolean = false,
    )

    /**
     * Remux both network sources directly into [target]. [onProgress] receives
     * compressed sample bytes copied and the source Content-Length hint (or
     * -1 when Innertube did not provide both lengths).
     */
    fun mux(
        context: Context,
        target: MediaStoreSaver.Target,
        videoUrl: String,
        audioUrl: String,
        expectedBytes: Long,
        isCancelled: () -> Boolean,
        onProgress: (Long, Long) -> Unit,
    ): Long {
        // Defense in depth in addition to the checks in both the plugin and
        // DownloadService. Never hand an untrusted URI to MediaExtractor.
        if (!MediaHosts.isAllowedMediaUrl(videoUrl) || !MediaHosts.isAllowedMediaUrl(audioUrl)) {
            throw SecurityException("Refusing to mux a host outside the on-device allowlist.")
        }
        if (isCancelled()) throw CancelledException()

        var video: SourceTrack? = null
        var audio: SourceTrack? = null
        var muxerHandle: MediaStoreSaver.MuxerHandle? = null
        var muxerStarted = false
        var muxerStopped = false
        try {
            video = openTrack(videoUrl, "video/")
            if (isCancelled()) throw CancelledException()
            audio = openTrack(audioUrl, "audio/")

            val videoMime = video.format.getString(MediaFormat.KEY_MIME).orEmpty().lowercase()
            val audioMime = audio.format.getString(MediaFormat.KEY_MIME).orEmpty().lowercase()
            if (videoMime != "video/avc" || audioMime != "audio/mp4a-latm") {
                throw IllegalStateException(
                    "This quality is not an H.264/AAC pair that Android can combine into MP4.",
                )
            }

            muxerHandle = MediaStoreSaver.openMuxer(context, target)
                ?: throw IllegalStateException("Could not open the MP4 destination for muxing.")
            val muxer = muxerHandle.muxer
            video.outputIndex = muxer.addTrack(video.format)
            audio.outputIndex = muxer.addTrack(audio.format)
            if (video.format.containsKey(MediaFormat.KEY_ROTATION)) {
                val rotation = video.format.getInteger(MediaFormat.KEY_ROTATION)
                if (rotation == 0 || rotation == 90 || rotation == 180 || rotation == 270) {
                    muxer.setOrientationHint(rotation)
                }
            }

            video.extractor.selectTrack(video.sourceIndex)
            audio.extractor.selectTrack(audio.sourceIndex)
            muxer.start()
            muxerStarted = true

            val declaredBuffer = maxOf(maxInputSize(video.format), maxInputSize(audio.format))
            var buffer = ByteBuffer.allocateDirect(declaredBuffer)
            val info = MediaCodec.BufferInfo()
            var copied = 0L

            while (!video.ended || !audio.ended) {
                if (isCancelled()) throw CancelledException()
                val source = nextSource(video, audio) ?: break
                buffer.clear()
                var size = source.extractor.readSampleData(buffer, 0)
                if (size < 0) {
                    source.ended = true
                    continue
                }
                // MediaExtractor does not advance when readSampleData returns a
                // sample larger than the supplied buffer, so retry that sample
                // with a bounded larger buffer.
                if (size > buffer.capacity()) {
                    if (size > MAX_BUFFER_SIZE) {
                        throw IllegalStateException("A media sample is too large to combine safely on this device.")
                    }
                    buffer = ByteBuffer.allocateDirect(size)
                    size = source.extractor.readSampleData(buffer, 0)
                    if (size < 0 || size > buffer.capacity()) {
                        throw IllegalStateException("Could not read a complete media sample.")
                    }
                }

                val presentationTimeUs = source.extractor.sampleTime
                if (presentationTimeUs < 0) {
                    source.ended = true
                    continue
                }
                info.set(0, size, presentationTimeUs, source.extractor.sampleFlags)
                muxer.writeSampleData(source.outputIndex, buffer, info)
                copied += size.toLong()
                onProgress(copied, expectedBytes)
                if (!source.extractor.advance()) source.ended = true
            }

            if (copied <= 0L) {
                throw IllegalStateException("The adaptive tracks contained no media samples.")
            }
            muxer.stop()
            muxerStopped = true
            return copied
        } finally {
            if (muxerStarted && !muxerStopped) {
                try {
                    muxerHandle?.muxer?.stop()
                } catch (_: Exception) {
                    // A failed/cancelled target is discarded by DownloadService.
                }
            }
            muxerHandle?.close()
            video?.extractor?.release()
            audio?.extractor?.release()
        }
    }

    /**
     * Remux only the AAC audio track of a progressive video+AAC MP4 into an
     * audio-only M4A target. Used when Innertube exposes no separate audio
     * stream for a music upload, so the user asked for audio and must not
     * receive a video file. Samples are stream-copied with their timestamps
     * and flags — no decode, re-encode, or intermediate file.
     *
     * The combined source's Content-Length covers the discarded video too, so
     * [onProgress] receives -1 as the total: byte progress stays honest as
     * indeterminate until the final file size is known.
     */
    fun extractAudio(
        context: Context,
        target: MediaStoreSaver.Target,
        sourceUrl: String,
        isCancelled: () -> Boolean,
        onProgress: (Long, Long) -> Unit,
    ): Long {
        // Defense in depth in addition to the checks in both the plugin and
        // DownloadService. Never hand an untrusted URI to MediaExtractor.
        if (!MediaHosts.isAllowedMediaUrl(sourceUrl)) {
            throw SecurityException("Refusing to extract audio from a host outside the on-device allowlist.")
        }
        if (isCancelled()) throw CancelledException()

        var track: SourceTrack? = null
        var muxerHandle: MediaStoreSaver.MuxerHandle? = null
        var muxerStarted = false
        var muxerStopped = false
        try {
            track = openTrack(sourceUrl, "audio/")
            if (isCancelled()) throw CancelledException()

            val trackMime = track.format.getString(MediaFormat.KEY_MIME).orEmpty().lowercase()
            if (trackMime != "audio/mp4a-latm") {
                throw IllegalStateException(
                    "This combined stream does not contain an AAC audio track that Android can save as M4A.",
                )
            }

            muxerHandle = MediaStoreSaver.openMuxer(context, target)
                ?: throw IllegalStateException("Could not open the M4A destination for muxing.")
            val muxer = muxerHandle.muxer
            track.outputIndex = muxer.addTrack(track.format)
            track.extractor.selectTrack(track.sourceIndex)
            muxer.start()
            muxerStarted = true

            val declaredBuffer = maxInputSize(track.format)
            var buffer = ByteBuffer.allocateDirect(declaredBuffer)
            val info = MediaCodec.BufferInfo()
            var copied = 0L

            while (!track.ended) {
                if (isCancelled()) throw CancelledException()
                buffer.clear()
                var size = track.extractor.readSampleData(buffer, 0)
                if (size < 0) {
                    track.ended = true
                    break
                }
                // MediaExtractor does not advance when readSampleData returns a
                // sample larger than the supplied buffer, so retry that sample
                // with a bounded larger buffer.
                if (size > buffer.capacity()) {
                    if (size > MAX_BUFFER_SIZE) {
                        throw IllegalStateException("A media sample is too large to save safely on this device.")
                    }
                    buffer = ByteBuffer.allocateDirect(size)
                    size = track.extractor.readSampleData(buffer, 0)
                    if (size < 0 || size > buffer.capacity()) {
                        throw IllegalStateException("Could not read a complete media sample.")
                    }
                }

                val presentationTimeUs = track.extractor.sampleTime
                if (presentationTimeUs < 0) {
                    track.ended = true
                    break
                }
                info.set(0, size, presentationTimeUs, track.extractor.sampleFlags)
                muxer.writeSampleData(track.outputIndex, buffer, info)
                copied += size.toLong()
                // Indeterminate total: the source length includes the video
                // bytes that were never read, let alone saved.
                onProgress(copied, -1L)
                if (!track.extractor.advance()) track.ended = true
            }

            if (copied <= 0L) {
                throw IllegalStateException("The combined stream contained no audio samples.")
            }
            muxer.stop()
            muxerStopped = true
            return copied
        } finally {
            if (muxerStarted && !muxerStopped) {
                try {
                    muxerHandle?.muxer?.stop()
                } catch (_: Exception) {
                    // A failed/cancelled target is discarded by DownloadService.
                }
            }
            muxerHandle?.close()
            track?.extractor?.release()
        }
    }

    private fun openTrack(url: String, mimePrefix: String): SourceTrack {
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(url, mapOf("User-Agent" to BROWSER_UA))
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
                if (mime.startsWith(mimePrefix, ignoreCase = true)) {
                    return SourceTrack(extractor, i, format)
                }
            }
            throw IllegalStateException("The source has no ${mimePrefix.removeSuffix("/")} track.")
        } catch (e: Exception) {
            extractor.release()
            throw e
        }
    }

    private fun maxInputSize(format: MediaFormat): Int {
        val declared = if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
            format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)
        } else {
            0
        }
        if (declared > MAX_BUFFER_SIZE) {
            throw IllegalStateException("This track needs media samples that are too large for this device.")
        }
        return maxOf(INITIAL_BUFFER_SIZE, declared)
    }

    /** Choose the next presentation timestamp so the output stays interleaved. */
    private fun nextSource(video: SourceTrack, audio: SourceTrack): SourceTrack? {
        val videoTime = if (video.ended) -1L else video.extractor.sampleTime
        val audioTime = if (audio.ended) -1L else audio.extractor.sampleTime
        if (videoTime < 0) video.ended = true
        if (audioTime < 0) audio.ended = true
        return when {
            video.ended && audio.ended -> null
            video.ended -> audio
            audio.ended -> video
            videoTime <= audioTime -> video
            else -> audio
        }
    }
}
