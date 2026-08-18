// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

/**
 * Pure byte framing for the on-device transcode targets (WAV / FLAC / Opus
 * headers, MP3 sizing, and a small linear resampler). No Android imports so
 * every helper stays JVM-unit-testable; AudioTranscoder does the MediaCodec
 * orchestration on top of these primitives.
 */
object AudioFormats {

    /* ---------- WAV (RIFF/WAVE, 16-bit PCM) ---------- */

    const val WAV_HEADER_SIZE = 44

    /** "RIFF" size field: everything after the first 8 bytes of the file. */
    fun wavRiffSize(dataBytes: Long): Long {
        require(dataBytes >= 0)
        val size = 36L + dataBytes
        require(size <= 0xFFFF_FFFFL) { "WAV cannot exceed 4 GiB." }
        return size
    }

    /**
     * Complete 44-byte canonical PCM WAV header. `dataBytes` may be 0 while
     * streaming; the sizes at offsets 4 and 40 are patched afterwards through
     * MediaStoreSaver.RawHandle.
     */
    fun wavHeader(dataBytes: Long, sampleRate: Int, channels: Int, bitsPerSample: Int = 16): ByteArray {
        require(sampleRate in 1..192_000)
        require(channels in 1..2) { "Only mono/stereo PCM is supported." }
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8
        val h = ByteArray(WAV_HEADER_SIZE)
        h[0] = 'R'.code.toByte(); h[1] = 'I'.code.toByte(); h[2] = 'F'.code.toByte(); h[3] = 'F'.code.toByte()
        putUint32Le(h, 4, wavRiffSize(dataBytes))
        h[8] = 'W'.code.toByte(); h[9] = 'A'.code.toByte(); h[10] = 'V'.code.toByte(); h[11] = 'E'.code.toByte()
        h[12] = 'f'.code.toByte(); h[13] = 'm'.code.toByte(); h[14] = 't'.code.toByte(); h[15] = ' '.code.toByte()
        putUint32Le(h, 16, 16) // PCM chunk size
        putUint16Le(h, 20, 1) // WAVE_FORMAT_PCM
        putUint16Le(h, 22, channels)
        putUint32Le(h, 24, sampleRate)
        putUint32Le(h, 28, byteRate)
        putUint16Le(h, 32, blockAlign)
        putUint16Le(h, 34, bitsPerSample)
        h[36] = 'd'.code.toByte(); h[37] = 'a'.code.toByte(); h[38] = 't'.code.toByte(); h[39] = 'a'.code.toByte()
        putUint32Le(h, 40, dataBytes)
        return h
    }

    /* ---------- FLAC native framing (fLaC + STREAMINFO) ---------- */

    /** Bytes 4..8 of a FLAC file. */
    const val FLAC_MAGIC = "fLaC"

    /** File offset of the 34-byte STREAMINFO block ("fLaC" + 4-byte header). */
    const val FLAC_STREAMINFO_FILE_OFFSET = 8

    /** Bit offsets inside the 34-byte STREAMINFO block (MSB-first packing). */
    const val STREAMINFO_MIN_BLOCK_BIT = 0
    const val STREAMINFO_MAX_BLOCK_BIT = 16
    const val STREAMINFO_SAMPLE_RATE_BIT = 80
    const val STREAMINFO_CHANNELS_BIT = 100
    const val STREAMINFO_BPS_BIT = 103
    const val STREAMINFO_TOTAL_SAMPLES_BIT = 108
    const val STREAMINFO_MD5_OFFSET = 18

    /** 4-byte metadata block header; STREAMINFO is type 0 and 34 bytes long. */
    fun flacMetadataBlockHeader(isLast: Boolean, blockType: Int, lengthBytes: Int): ByteArray {
        require(lengthBytes in 0..0xFFFFFF)
        val h = ByteArray(4)
        h[0] = (((if (isLast) 0x80 else 0) or (blockType and 0x7F)).toByte())
        h[1] = ((lengthBytes shr 16) and 0xFF).toByte()
        h[2] = ((lengthBytes shr 8) and 0xFF).toByte()
        h[3] = (lengthBytes and 0xFF).toByte()
        return h
    }

    /**
     * STREAMINFO with known-upfront fields filled and MD5/total-samples left
     * zero; the caller patches those two once the audio has streamed through.
     */
    fun flacStreamInfo(sampleRate: Int, channels: Int, bitsPerSample: Int, blockSize: Int = 4096): ByteArray {
        require(sampleRate in 1..655_350)
        require(channels in 1..8)
        require(bitsPerSample in 1..32)
        val b = ByteArray(34)
        writeBits(b, STREAMINFO_MIN_BLOCK_BIT, 16, blockSize.toLong())
        writeBits(b, STREAMINFO_MAX_BLOCK_BIT, 16, blockSize.toLong())
        writeBits(b, STREAMINFO_SAMPLE_RATE_BIT, 20, sampleRate.toLong())
        writeBits(b, STREAMINFO_CHANNELS_BIT, 3, (channels - 1).toLong())
        writeBits(b, STREAMINFO_BPS_BIT, 5, (bitsPerSample - 1).toLong())
        return b
    }

    /** MSB-first bit writer for FLAC header fields. */
    fun writeBits(buf: ByteArray, bitOffset: Int, bitCount: Int, value: Long) {
        require(bitCount in 1..64)
        var bit = bitOffset
        for (i in bitCount - 1 downTo 0) {
            val index = bit ushr 3
            if (index >= buf.size) throw IllegalArgumentException("Bit field exceeds the buffer.")
            val mask = (0x80 shr (bit and 7))
            val set = (value ushr i) and 1L
            buf[index] = if (set == 1L) {
                (buf[index].toInt() or mask).toByte()
            } else {
                (buf[index].toInt() and mask.inv()).toByte()
            }
            bit++
        }
    }

    /**
     * Some FLAC encoder implementations prepend the whole "fLaC" + metadata
     * preamble to their first output buffer. If [buf] starts with the magic,
     * return the offset of the first audio frame (past all metadata blocks);
     * otherwise -1 and the caller keeps the buffer as-is.
     */
    fun flacSkipStreamHeader(buf: ByteArray, size: Int): Int {
        if (size < 8) return -1
        if (!(buf[0] == 'f'.code.toByte() && buf[1] == 'L'.code.toByte() &&
                buf[2] == 'a'.code.toByte() && buf[3] == 'C'.code.toByte())
        ) {
            return -1
        }
        var offset = 4
        while (offset + 4 <= size) {
            val header = buf[offset].toInt() and 0xFF
            val isLast = (header and 0x80) != 0
            val length = ((buf[offset + 1].toInt() and 0xFF) shl 16) or
                ((buf[offset + 2].toInt() and 0xFF) shl 8) or
                (buf[offset + 3].toInt() and 0xFF)
            offset += 4 + length
            if (isLast) break
        }
        return if (offset in 1..size) offset else -1
    }

    /* ---------- Opus-in-Ogg header packets ---------- */

    /** Opus tools operate on 48 kHz regardless of the original input rate. */
    const val OPUS_SAMPLE_RATE = 48_000

    fun isOpusHead(buf: ByteArray, size: Int): Boolean =
        size >= 8 && magicMatches(buf, "OpusHead")

    fun isOpusTags(buf: ByteArray, size: Int): Boolean =
        size >= 8 && magicMatches(buf, "OpusTags")

    /** Minimal Ogg Opus ID header (19 bytes, mapping family 0). */
    fun opusHead(inputSampleRate: Int, channels: Int, preSkip: Int, outputGain: Int = 0): ByteArray {
        require(channels in 1..2) { "Mapping family 0 covers mono/stereo only." }
        val b = ByteArray(19)
        val magic = "OpusHead".toByteArray(Charsets.US_ASCII)
        System.arraycopy(magic, 0, b, 0, 8)
        b[8] = 1 // version
        b[9] = channels.toByte()
        putUint16Le(b, 10, preSkip)
        putUint32Le(b, 12, inputSampleRate)
        putUint16Le(b, 16, outputGain)
        b[18] = 0 // mapping family
        return b
    }

    /** Minimal Ogg Opus comment header: one vendor string, zero comments. */
    fun opusTags(vendor: String): ByteArray {
        val v = vendor.toByteArray(Charsets.US_ASCII)
        val b = ByteArray(8 + 4 + v.size + 4)
        val magic = "OpusTags".toByteArray(Charsets.US_ASCII)
        System.arraycopy(magic, 0, b, 0, 8)
        putUint32Le(b, 8, v.size)
        System.arraycopy(v, 0, b, 12, v.size)
        putUint32Le(b, 12 + v.size, 0)
        return b
    }

    /** Nearest legal Opus input rate for an odd source rate. */
    fun nearestOpusRate(rate: Int): Int = when {
        rate >= 32_000 -> 48_000
        rate >= 20_000 -> 24_000
        rate >= 14_000 -> 16_000
        rate >= 10_000 -> 12_000
        else -> 8_000
    }

    /* ---------- resampling (Opus needs 48 kHz-family input) ---------- */

    /**
     * Stateful linear resampler over interleaved 16-bit frames, continuous
     * across process() calls (fractional cursor carried between blocks).
     * Quality is plenty for a phone-side transcode of a lossy source.
     */
    class LinearResampler(private val channels: Int, fromRate: Int, toRate: Int) {
        init {
            require(channels in 1..2)
            require(fromRate > 0 && toRate > 0)
        }

        private val step = fromRate.toDouble() / toRate
        /** Absolute input-frame position of the next output frame. */
        private var cursor = 0.0
        /** Absolute count of input frames consumed so far. */
        private var consumed = 0L
        private var history = ShortArray(channels)

        /** Resample [frames] interleaved input frames; may return an empty array. */
        fun process(input: ShortArray, frames: Int): ShortArray {
            if (frames <= 0) return ShortArray(0)
            val maxOut = (frames * step).toInt() + 2
            val out = ShortArray(maxOut * channels)
            var written = 0
            val start = consumed
            while (true) {
                val i0 = Math.floor(cursor).toLong()
                if (i0 + 1 >= start + frames) break // need the next block
                val frac = cursor - i0
                for (c in 0 until channels) {
                    val a = frameSample(input, start, i0, c, frames)
                    val b = frameSample(input, start, i0 + 1, c, frames)
                    out[written++] = (a + (b - a) * frac).toInt().toShort()
                }
                cursor += step
            }
            // Keep the final input frame as interpolation history.
            for (c in 0 until channels) history[c] = input[(frames - 1) * channels + c]
            consumed += frames
            return out.copyOf(written)
        }

        /** Emit the (at most two) tail frames an EOS leaves behind, holding the last frame. */
        fun finish(): ShortArray? {
            if (consumed == 0L || cursor >= consumed) return null
            var produced: ShortArray? = null
            while (cursor < consumed) {
                produced = if (produced == null) history.copyOf() else produced + history
                cursor += step
            }
            return produced
        }

        /** Sample an absolute frame index against the current block + history. */
        private fun frameSample(input: ShortArray, start: Long, index: Long, channel: Int, frames: Int): Short {
            return if (index == start - 1) {
                history[channel]
            } else {
                input[((index - start).toInt() * channels + channel)]
            }
        }
    }

    /* ---------- MP3 (LAME) sizing ---------- */

    /** LAME's documented worst-case output for one encode call. */
    fun mp3OutputBufferSize(framesPerChannel: Int): Int = 5 * framesPerChannel / 4 + 7200

    /* ---------- little-endian primitives ---------- */

    fun putUint16Le(buf: ByteArray, offset: Int, value: Int) {
        require(value in 0..0xFFFF)
        buf[offset] = (value and 0xFF).toByte()
        buf[offset + 1] = ((value shr 8) and 0xFF).toByte()
    }

    fun putUint32Le(buf: ByteArray, offset: Int, value: Long) {
        require(value in 0..0xFFFF_FFFFL)
        buf[offset] = (value and 0xFF).toByte()
        buf[offset + 1] = ((value shr 8) and 0xFF).toByte()
        buf[offset + 2] = ((value shr 16) and 0xFF).toByte()
        buf[offset + 3] = ((value shr 24) and 0xFF).toByte()
    }

    private fun magicMatches(buf: ByteArray, magic: String): Boolean {
        val m = magic.toByteArray(Charsets.US_ASCII)
        for (i in m.indices) {
            if (buf[i] != m[i]) return false
        }
        return true
    }
}
