// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Build
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

/**
 * On-device audio transcoder: MediaExtractor + MediaCodec decode an
 * allowlist-checked YouTube audio stream (or the audio track of a progressive
 * MP4) into PCM16, then re-encode into the format-picker target:
 *
 *  - WAV  — streaming RIFF/WAVE writer, no encoder, sizes patched at EOS;
 *  - MP3  — bundled LAME (LGPL-2.1) via [Mp3Encoder] JNI, no framework encoder
 *           exists on Android;
 *  - FLAC — MediaCodec "audio/flac" encoder, "fLaC" + STREAMINFO framed by
 *           hand (Android has no FLAC muxer), MD5/total-samples patched at EOS;
 *  - Opus — MediaCodec "audio/opus" encoder into a MediaMuxer OGG container
 *           (csd-0/csd-1 OpusHead/OpusTags, synthesized when the encoder does
 *           not emit them), 44.1 kHz sources linearly resampled to 48 kHz.
 *
 * Nothing is written to disk except the final MediaStore/file target; decoded
 * PCM flows through memory in bounded chunks. Progress is decoded-PCM bytes
 * against the duration-derived estimate (or indeterminate when unknown).
 */
object AudioTranscoder {

    private const val TIMEOUT_US = 10_000L
    private const val BROWSER_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    private const val MAX_INPUT_STALLS = 1_000
    private const val COPY_CHUNK = 16 * 1024

    /**
     * Decode [sourceUrl] and re-encode into [outputTarget]
     * ("mp3" | "wav" | "flac" | "opus") written to [target].
     * [audioBitrateBps] <= 0 selects a per-codec default. Returns the bytes
     * written to the target.
     */
    fun transcode(
        context: Context,
        target: MediaStoreSaver.Target,
        sourceUrl: String,
        outputTarget: String,
        audioBitrateBps: Int,
        isCancelled: () -> Boolean,
        onProgress: (Long, Long) -> Unit,
    ): Long {
        // Defense in depth: the plugin and DownloadService already checked.
        if (!MediaHosts.isAllowedMediaUrl(sourceUrl)) {
            throw SecurityException("Refusing to convert a host outside the on-device allowlist.")
        }
        if (!FormatPicker.isTranscodeTarget(outputTarget)) {
            throw IllegalStateException("$outputTarget is not an on-device transcode target.")
        }
        if (!FormatPicker.targetSupportedOnApi(outputTarget, Build.VERSION.SDK_INT)) {
            throw IllegalStateException(
                "This device\u2019s Android version cannot encode ${outputTarget.uppercase()} files.",
            )
        }
        if (outputTarget == "mp3" && !Mp3Encoder.isAvailable()) {
            throw IllegalStateException("MP3 encoder not available on this device.")
        }
        if (isCancelled()) throw OnDeviceMuxer.CancelledException()

        val source = openAudioTrack(sourceUrl)
        var decoder: MediaCodec? = null
        var sink: PcmSink? = null
        var outRate = 0
        var outChannels = 0
        try {
            val sourceMime = source.format.getString(MediaFormat.KEY_MIME).orEmpty()
            if (sourceMime.isBlank()) {
                throw IllegalStateException("The source stream has no decodable audio track.")
            }
            val durationUs = maxOf(
                if (source.format.containsKey(MediaFormat.KEY_DURATION)) source.format.getLong(MediaFormat.KEY_DURATION) else -1L,
                try {
                    source.extractor.duration
                } catch (_: Exception) {
                    -1L
                },
            )
            val estTotalBytes = { rate: Int, channels: Int ->
                if (durationUs > 0) durationUs * rate / 1_000_000L * channels * 2L else -1L
            }

            decoder = MediaCodec.createDecoderByType(sourceMime)
            decoder.configure(source.format, null, null, 0)
            decoder.start()
            source.extractor.selectTrack(source.index)

            /** Create the sink once the decoder's real PCM shape is known. */
            fun ensureSink(decoderFormat: MediaFormat) {
                if (sink != null) return
                val rate = if (decoderFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) decoderFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE) else 0
                val channels = if (decoderFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) decoderFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT) else 0
                if (rate <= 0 || channels <= 0 || channels > 2) {
                    throw IllegalStateException("This audio stream is not mono/stereo PCM-decodable on this device.")
                }
                outRate = rate
                outChannels = channels
                sink = createSink(context, target, outputTarget, rate, channels, audioBitrateBps)
            }

            val info = MediaCodec.BufferInfo()
            var inputDone = false
            var outputDone = false
            var decodedBytes = 0L
            var stalls = 0

            while (!outputDone) {
                if (isCancelled()) throw OnDeviceMuxer.CancelledException()

                if (!inputDone) {
                    val inIndex = decoder.dequeueInputBuffer(TIMEOUT_US)
                    if (inIndex >= 0) {
                        val input = decoder.getInputBuffer(inIndex)
                        if (input == null) {
                            decoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            input.clear()
                            val size = source.extractor.readSampleData(input, 0)
                            if (size > input.capacity()) {
                                throw IllegalStateException("This audio stream has samples too large to decode on this device.")
                            }
                            if (size < 0) {
                                decoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputDone = true
                            } else {
                                val pts = source.extractor.sampleTime
                                if (pts < 0) {
                                    decoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                    inputDone = true
                                } else {
                                    decoder.queueInputBuffer(inIndex, 0, size, pts, 0)
                                    source.extractor.advance()
                                }
                            }
                        }
                        stalls = 0
                    }
                }

                val outIndex = decoder.dequeueOutputBuffer(info, TIMEOUT_US)
                when {
                    outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        // The decoder's real PCM shape (Opus decodes at 48 kHz
                        // regardless of the container's nominal rate).
                        ensureSink(decoder.outputFormat)
                        stalls = 0
                    }
                    outIndex >= 0 -> {
                        val out = decoder.getOutputBuffer(outIndex)
                        val eos = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                        if (out != null && info.size > 0) {
                            ensureSink(decoder.outputFormat)
                            val channels = outChannels
                            out.order(ByteOrder.LITTLE_ENDIAN)
                            out.position(info.offset)
                            out.limit(info.offset + info.size)
                            val frames = info.size / (2 * channels)
                            if (frames > 0) {
                                sink!!.writePcm(out.slice(), frames)
                                decodedBytes += frames * channels * 2L
                                onProgress(decodedBytes, estTotalBytes(outRate, channels))
                            }
                        }
                        decoder.releaseOutputBuffer(outIndex, false)
                        if (eos) outputDone = true
                        stalls = 0
                    }
                    outIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                        if (inputDone) {
                            stalls++
                            if (stalls > MAX_INPUT_STALLS) {
                                throw IllegalStateException("This device\u2019s audio decoder stalled mid-stream.")
                            }
                        }
                    }
                    else -> {}
                }
            }

            val finished = sink
                ?: throw IllegalStateException("The source stream contained no decodable audio.")
            finished.finish()
            return finished.bytesWritten()
        } finally {
            try {
                decoder?.stop()
            } catch (_: Exception) {
                // Already failing or never started; release below is what counts.
            }
            decoder?.release()
            try {
                sink?.close()
            } catch (_: Exception) {
                // DownloadService discards the partial target on failure.
            }
            source.extractor.release()
        }
    }

    /* ---------- source track ---------- */

    private class AudioTrack(val extractor: MediaExtractor, val index: Int, val format: MediaFormat)

    /** Open the URL and select the highest-bitrate audio track. */
    private fun openAudioTrack(url: String): AudioTrack {
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(url, mapOf("User-Agent" to BROWSER_UA))
            var best: AudioTrack? = null
            var bestBitrate = -1L
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
                if (!mime.startsWith("audio/", ignoreCase = true)) continue
                val bitrate = if (format.containsKey(MediaFormat.KEY_BIT_RATE)) format.getLong(MediaFormat.KEY_BIT_RATE) else -1L
                if (best == null || bitrate > bestBitrate) {
                    best = AudioTrack(extractor, i, format)
                    bestBitrate = bitrate
                }
            }
            return best ?: throw IllegalStateException("The source has no audio track.")
        } catch (e: Exception) {
            try {
                extractor.release()
            } catch (_: Exception) {
            }
            throw e
        }
    }

    /* ---------- sinks ---------- */

    /** Receives interleaved little-endian PCM16 frames; implemented per target. */
    private interface PcmSink {
        fun writePcm(buffer: ByteBuffer, frames: Int)
        fun finish()
        fun close()
        fun bytesWritten(): Long
    }

    private fun createSink(
        context: Context,
        target: MediaStoreSaver.Target,
        outputTarget: String,
        sampleRate: Int,
        channels: Int,
        audioBitrateBps: Int,
    ): PcmSink {
        val bitrate = if (audioBitrateBps > 0) audioBitrateBps else FormatPicker.encoderBitrateFor(outputTarget, "best")
        val raw = { MediaStoreSaver.openRaw(context, target) }
        return when (outputTarget) {
            "wav" -> WavSink(raw() ?: throw destinationError(), sampleRate, channels)
            "mp3" -> Mp3Sink(raw() ?: throw destinationError(), sampleRate, channels, bitrate)
            "flac" -> FlacSink(raw() ?: throw destinationError(), sampleRate, channels)
            "opus" -> OpusSink(context, target, sampleRate, channels, bitrate)
            else -> throw IllegalStateException("$outputTarget is not an on-device transcode target.")
        }
    }

    private fun destinationError(): IllegalStateException =
        IllegalStateException("Could not open the destination for writing.")

    /** Streaming RIFF/WAVE writer: header placeholders patched at EOS. */
    private class WavSink(private val handle: MediaStoreSaver.RawHandle, private val sampleRate: Int, private val channels: Int) : PcmSink {
        private var dataBytes = 0L
        private val copy = ByteArray(COPY_CHUNK)

        init {
            handle.write(AudioFormats.wavHeader(0, sampleRate, channels), 0, AudioFormats.WAV_HEADER_SIZE)
        }

        override fun writePcm(buffer: ByteBuffer, frames: Int) {
            var remaining = frames * channels * 2
            while (remaining > 0) {
                val n = minOf(copy.size, remaining)
                buffer.get(copy, 0, n)
                handle.write(copy, 0, n)
                remaining -= n
            }
            dataBytes += frames * channels * 2L
        }

        override fun finish() {
            val patch = ByteArray(4)
            AudioFormats.putUint32Le(patch, 0, AudioFormats.wavRiffSize(dataBytes))
            handle.patch(4, patch)
            AudioFormats.putUint32Le(patch, 0, dataBytes)
            handle.patch(40, patch)
        }

        override fun close() = handle.close()
        override fun bytesWritten(): Long = AudioFormats.WAV_HEADER_SIZE + dataBytes
    }

    /** LAME-backed MP3 writer; chunked to bound the encode call size. */
    private class Mp3Sink(
        private val handle: MediaStoreSaver.RawHandle,
        private val sampleRate: Int,
        private val channels: Int,
        bitrateBps: Int,
    ) : PcmSink {
        private val encoderHandle: Long
        private var bytes = 0L
        private val chunkFrames = 11_520
        private val chunk = ShortArray(chunkFrames * channels)
        private var chunkFill = 0
        private val out = ByteArray(AudioFormats.mp3OutputBufferSize(chunkFrames))

        init {
            val h = Mp3Encoder.open(sampleRate, channels, sampleRate, bitrateBps)
            check(h != 0L) { "MP3 encoder not available on this device." }
            encoderHandle = h
        }

        override fun writePcm(buffer: ByteBuffer, frames: Int) {
            buffer.order(ByteOrder.LITTLE_ENDIAN)
            var remaining = frames
            val shorts = buffer.asShortBuffer()
            while (remaining > 0) {
                val take = minOf(chunkFrames - chunkFill, remaining)
                shorts.get(chunk, chunkFill * channels, take * channels)
                chunkFill += take
                remaining -= take
                if (chunkFill == chunkFrames) drainChunk()
            }
        }

        private fun drainChunk() {
            if (chunkFill == 0) return
            val n = Mp3Encoder.encode(encoderHandle, chunk, chunkFill, out)
            if (n < 0) throw IllegalStateException("The MP3 encoder failed (code $n).")
            if (n > 0) {
                handle.write(out, 0, n)
                bytes += n
            }
            chunkFill = 0
        }

        override fun finish() {
            drainChunk()
            var guard = 0
            while (guard++ < 4) {
                val n = Mp3Encoder.flush(encoderHandle, out)
                if (n < 0) throw IllegalStateException("The MP3 encoder failed while flushing (code $n).")
                if (n == 0) break
                handle.write(out, 0, n)
                bytes += n
            }
            Mp3Encoder.close(encoderHandle)
        }

        override fun close() {
            // finish() normally closed it; a failure mid-stream still must not
            // leak the native encoder.
            runCatching { Mp3Encoder.close(encoderHandle) }
            handle.close()
        }

        override fun bytesWritten(): Long = bytes
    }

    /**
     * MediaCodec FLAC encoder writing a hand-framed native FLAC: "fLaC" +
     * last-flagged STREAMINFO metadata block + raw encoded frames. MD5 and
     * total-samples are patched into the header at EOS.
     */
    private class FlacSink(private val handle: MediaStoreSaver.RawHandle, private val sampleRate: Int, private val channels: Int) : PcmSink {
        private val encoder: MediaCodec
        private val streamInfo = AudioFormats.flacStreamInfo(sampleRate, channels, 16)
        private val md5 = MessageDigest.getInstance("MD5")
        private var totalSamplesPerChannel = 0L
        private var bytes = 0L
        private var firstBuffer = true
        private val copy = ByteArray(COPY_CHUNK)

        init {
            handle.write(FLAC_MAGIC_BYTES, 0, 4)
            val blockHeader = AudioFormats.flacMetadataBlockHeader(isLast = true, blockType = 0, lengthBytes = streamInfo.size)
            handle.write(blockHeader, 0, blockHeader.size)
            handle.write(streamInfo, 0, streamInfo.size)
            val format = MediaFormat.createAudioFormat(MIME_FLAC, sampleRate, channels)
            format.setInteger(KEY_FLAC_COMPRESSION_LEVEL, 5)
            encoder = MediaCodec.createEncoderByType(MIME_FLAC)
            encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            encoder.start()
        }

        override fun writePcm(buffer: ByteBuffer, frames: Int) {
            md5.update(buffer.duplicate())
            buffer.order(ByteOrder.LITTLE_ENDIAN)
            feedEncoder(buffer, frames)
            drainOutputs(endOfStream = false)
            totalSamplesPerChannel += frames
        }

        private fun feedEncoder(buffer: ByteBuffer, frames: Int) {
            val shorts = buffer.asShortBuffer()
            var offset = 0
            val total = frames
            while (offset < total) {
                val inIndex = encoder.dequeueInputBuffer(TIMEOUT_US)
                if (inIndex < 0) {
                    // Input buffers full: the encoder needs its output drained
                    // before it can accept more PCM (otherwise this deadlocks).
                    drainOutputs(endOfStream = false)
                    continue
                }
                val input = encoder.getInputBuffer(inIndex) ?: continue
                input.clear()
                input.order(ByteOrder.LITTLE_ENDIAN)
                val capacityFrames = input.capacity() / (2 * channels)
                val take = minOf(capacityFrames, total - offset)
                input.asShortBuffer().put(shorts, offset * channels, take * channels)
                val ptsUs = (totalSamplesPerChannel + offset) * 1_000_000L / sampleRate
                encoder.queueInputBuffer(inIndex, 0, take * channels * 2, ptsUs, 0)
                offset += take
            }
        }

        private fun drainOutputs(endOfStream: Boolean) {
            val info = MediaCodec.BufferInfo()
            var stalls = 0
            while (true) {
                val index = encoder.dequeueOutputBuffer(info, TIMEOUT_US)
                when {
                    index >= 0 -> {
                        val eos = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                        val out = encoder.getOutputBuffer(index)
                        if (out != null && info.size > 0) {
                            var start = info.offset
                            var size = info.size
                            if (firstBuffer) {
                                firstBuffer = false
                                // Some encoders prepend "fLaC" + metadata to the
                                // first coded buffer; we already wrote our own
                                // header, so skip theirs.
                                val sniffLen = minOf(size, 64)
                                val sniff = ByteArray(sniffLen)
                                out.order(ByteOrder.LITTLE_ENDIAN)
                                out.position(start)
                                out.limit(start + sniffLen)
                                out.get(sniff)
                                val skip = AudioFormats.flacSkipStreamHeader(sniff, sniffLen)
                                if (skip > 0) {
                                    start += skip
                                    size -= skip
                                }
                            }
                            if (size > 0) {
                                out.order(ByteOrder.LITTLE_ENDIAN)
                                out.position(start)
                                out.limit(start + size)
                                while (out.hasRemaining()) {
                                    val n = minOf(copy.size, out.remaining())
                                    out.get(copy, 0, n)
                                    handle.write(copy, 0, n)
                                    bytes += n
                                }
                            }
                        }
                        encoder.releaseOutputBuffer(index, false)
                        if (eos) return
                        stalls = 0
                    }
                    index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        // csd arrives in the output format; our STREAMINFO is
                        // built from the known stream parameters instead.
                    }
                    else -> { // INFO_TRY_AGAIN_LATER or other transient codes
                        if (!endOfStream) return
                        if (++stalls > MAX_INPUT_STALLS) return // encoder never flagged EOS
                    }
                }
            }
        }

        override fun finish() {
            val inIndex = encoder.dequeueInputBuffer(TIMEOUT_US)
            if (inIndex >= 0) {
                encoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            }
            drainOutputs(endOfStream = true)

            // Patch STREAMINFO: total samples (36 bits from bit 108) + MD5.
            AudioFormats.writeBits(streamInfo, AudioFormats.STREAMINFO_TOTAL_SAMPLES_BIT, 36, totalSamplesPerChannel)
            val digest = md5.digest()
            System.arraycopy(digest, 0, streamInfo, AudioFormats.STREAMINFO_MD5_OFFSET, digest.size)
            val totalPatch = ByteArray(5)
            System.arraycopy(streamInfo, 13, totalPatch, 0, 5)
            handle.patch(
                (AudioFormats.FLAC_STREAMINFO_FILE_OFFSET + 13).toLong(),
                totalPatch,
            )
            handle.patch(
                (AudioFormats.FLAC_STREAMINFO_FILE_OFFSET + AudioFormats.STREAMINFO_MD5_OFFSET).toLong(),
                streamInfo.copyOfRange(AudioFormats.STREAMINFO_MD5_OFFSET, streamInfo.size),
            )
        }

        override fun close() {
            try {
                encoder.stop()
            } catch (_: Exception) {
            }
            encoder.release()
            handle.close()
        }

        override fun bytesWritten(): Long = bytes
    }

    /**
     * MediaCodec Opus encoder into a MediaMuxer OGG target. Collects or
     * synthesizes OpusHead/OpusTags (csd-0/csd-1), then writes the coded
     * frames; odd source rates are resampled into the 48 kHz Opus family.
     */
    private class OpusSink(
        context: Context,
        target: MediaStoreSaver.Target,
        sourceRate: Int,
        private val channels: Int,
        bitrateBps: Int,
    ) : PcmSink {
        private val encoderRate = AudioFormats.nearestOpusRate(sourceRate)
        private val resampler =
            if (sourceRate != encoderRate) AudioFormats.LinearResampler(channels, sourceRate, encoderRate) else null
        private val encoder: MediaCodec
        private var muxerHandle: MediaStoreSaver.MuxerHandle? = null
        private var muxer: MediaMuxer? = null
        private var trackIndex = -1
        private var muxerStarted = false
        private var head: ByteArray? = null
        private var tags: ByteArray? = null
        private var pendingFrame: ByteArray? = null
        private var pendingPtsUs: Long = 0
        private var fedFrames = 0L
        private var bytes = 0L

        init {
            val format = MediaFormat.createAudioFormat(MIME_OPUS, encoderRate, channels)
            format.setInteger(MediaFormat.KEY_BIT_RATE, bitrateBps)
            encoder = MediaCodec.createEncoderByType(MIME_OPUS)
            encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            encoder.start()
            muxerHandle = MediaStoreSaver.openMuxer(context, target, MediaMuxer.OutputFormat.MUXER_OUTPUT_OGG)
                ?: throw IllegalStateException("Could not open the OGG destination for muxing.")
            muxer = muxerHandle!!.muxer
        }

        override fun writePcm(buffer: ByteBuffer, frames: Int) {
            buffer.order(ByteOrder.LITTLE_ENDIAN)
            val pcm = ShortArray(frames * channels)
            buffer.asShortBuffer().get(pcm)
            val stream = resampler?.process(pcm, frames) ?: pcm
            val streamFrames = stream.size / channels
            if (streamFrames > 0) {
                feedEncoder(stream, streamFrames)
                drainOutputs(endOfStream = false)
            }
        }

        private fun feedEncoder(pcm: ShortArray, frames: Int) {
            var offset = 0
            while (offset < frames) {
                val inIndex = encoder.dequeueInputBuffer(TIMEOUT_US)
                if (inIndex < 0) {
                    // Input buffers full: drain output or this deadlocks.
                    drainOutputs(endOfStream = false)
                    continue
                }
                val input = encoder.getInputBuffer(inIndex) ?: continue
                input.clear()
                input.order(ByteOrder.LITTLE_ENDIAN)
                val capacityFrames = input.capacity() / (2 * channels)
                val take = minOf(capacityFrames, frames - offset)
                input.asShortBuffer().put(pcm, offset * channels, take * channels)
                val ptsUs = fedFrames * 1_000_000L / encoderRate
                encoder.queueInputBuffer(inIndex, 0, take * channels * 2, ptsUs, 0)
                fedFrames += take
                offset += take
            }
        }

        private fun drainOutputs(endOfStream: Boolean) {
            val info = MediaCodec.BufferInfo()
            var stalls = 0
            while (true) {
                val index = encoder.dequeueOutputBuffer(info, TIMEOUT_US)
                when {
                    index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        val fmt = encoder.outputFormat
                        fmt.getByteBuffer("csd-0")?.let { head = copyBytes(it) }
                        fmt.getByteBuffer("csd-1")?.let { tags = copyBytes(it) }
                        maybeStartMuxer()
                    }
                    index >= 0 -> {
                        val eos = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                        val out = encoder.getOutputBuffer(index)
                        if (out != null && info.size > 0) {
                            val frame = ByteArray(info.size)
                            out.position(info.offset)
                            out.limit(info.offset + info.size)
                            out.get(frame)
                            if (!muxerStarted) {
                                when {
                                    head == null && AudioFormats.isOpusHead(frame, frame.size) -> head = frame
                                    tags == null && AudioFormats.isOpusTags(frame, frame.size) -> tags = frame
                                    pendingFrame == null -> {
                                        pendingFrame = frame
                                        pendingPtsUs = info.presentationTimeUs
                                    }
                                    else -> throw IllegalStateException("The Opus encoder emitted unexpected header packets.")
                                }
                                maybeStartMuxer()
                                // maybeStartMuxer() wrote the pending frame itself.
                            } else if (
                                !AudioFormats.isOpusHead(frame, frame.size) &&
                                !AudioFormats.isOpusTags(frame, frame.size)
                            ) {
                                // Late in-band headers must never become samples.
                                writeFrame(frame, info.presentationTimeUs)
                            }
                        }
                        encoder.releaseOutputBuffer(index, false)
                        if (eos) return
                        stalls = 0
                    }
                    else -> { // INFO_TRY_AGAIN_LATER or other transient codes
                        if (!endOfStream) return
                        if (++stalls > MAX_INPUT_STALLS) return // encoder never flagged EOS
                    }
                }
            }
        }

        private fun maybeStartMuxer() {
            if (muxerStarted) return
            // Start as soon as the ID header is known (real or synthesized);
            // the first data frame only pends until this point.
            if (head == null && pendingFrame == null) return
            val realHead = head ?: AudioFormats.opusHead(encoderRate, channels, preSkip = 312)
            val realTags = tags ?: AudioFormats.opusTags("yt-convert-android")
            val trackFormat = MediaFormat.createAudioFormat(MIME_OPUS, AudioFormats.OPUS_SAMPLE_RATE, channels)
            trackFormat.setByteBuffer("csd-0", ByteBuffer.wrap(realHead))
            trackFormat.setByteBuffer("csd-1", ByteBuffer.wrap(realTags))
            val m = muxer ?: return
            trackIndex = m.addTrack(trackFormat)
            m.start()
            muxerStarted = true
            pendingFrame?.let { frame ->
                writeFrame(frame, pendingPtsUs)
                pendingFrame = null
            }
        }

        private fun writeFrame(frame: ByteArray, ptsUs: Long) {
            val m = muxer ?: return
            val info = MediaCodec.BufferInfo()
            info.set(0, frame.size, ptsUs, 0)
            m.writeSampleData(trackIndex, ByteBuffer.wrap(frame), info)
            bytes += frame.size
        }

        override fun finish() {
            resampler?.finish()?.let { tail ->
                val frames = tail.size / channels
                if (frames > 0) {
                    feedEncoder(tail, frames)
                }
            }
            val inIndex = encoder.dequeueInputBuffer(TIMEOUT_US)
            if (inIndex >= 0) {
                encoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            }
            drainOutputs(endOfStream = true)
            if (!muxerStarted) {
                throw IllegalStateException("The Opus encoder produced no audio.")
            }
            try {
                muxer?.stop()
            } catch (_: Exception) {
                // A failed stop leaves the discarded target to DownloadService.
            }
        }

        override fun close() {
            try {
                muxerHandle?.close()
            } catch (_: Exception) {
            }
            try {
                encoder.stop()
            } catch (_: Exception) {
            }
            encoder.release()
        }

        override fun bytesWritten(): Long = bytes

        private fun copyBytes(buffer: ByteBuffer): ByteArray {
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)
            return bytes
        }
    }

    private companion object {
        const val MIME_FLAC = "audio/flac"
        const val MIME_OPUS = "audio/opus"
        // Framework MediaFormat key (MediaFormat.KEY_FLAC_COMPRESSION_LEVEL);
        // the raw string is used because the constant is not on minSdk 23.
        const val KEY_FLAC_COMPRESSION_LEVEL = "flac-compression-level"
        val FLAC_MAGIC_BYTES = byteArrayOf('f'.code.toByte(), 'L'.code.toByte(), 'a'.code.toByte(), 'C'.code.toByte())
    }
}
