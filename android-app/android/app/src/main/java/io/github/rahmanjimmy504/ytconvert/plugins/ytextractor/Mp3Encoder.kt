// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

/**
 * Thin Kotlin wrapper around the bundled LAME MP3 encoder (LGPL-2.1, vendored
 * under app/src/main/cpp/lame and built into libytconvert_mp3.so by the NDK
 * CMake build). Android ships no framework MP3 encoder, so the MP3 target is
 * real only when this library loads; callers must check [isAvailable] first
 * and fail with the honest "MP3 encoder not available" message otherwise.
 *
 * The handle returned by [open] is opaque; 0 means the encoder could not be
 * configured for these parameters.
 */
object Mp3Encoder {

    @Volatile
    private var loaded = false

    /** LAME quality preset: 2 = high quality, still fast on a phone. */
    const val DEFAULT_QUALITY = 2

    /** True when libytconvert_mp3.so is loadable on this device. */
    @Synchronized
    fun isAvailable(): Boolean {
        if (loaded) return true
        loaded = runCatching { System.loadLibrary("ytconvert_mp3") }.isSuccess
        return loaded
    }

    /**
     * Configure an encoder. [inSampleRate]/[channels] describe the decoded
     * PCM; [outSampleRate] lets the caller legalise odd rates (LAME also
     * resamples internally); [bitrateBps] is the target CBR bitrate.
     */
    fun open(inSampleRate: Int, channels: Int, outSampleRate: Int, bitrateBps: Int, quality: Int = DEFAULT_QUALITY): Long {
        if (!isAvailable()) return 0L
        return nativeOpen(inSampleRate, channels, outSampleRate, bitrateBps, quality)
    }

    /**
     * Encode [framesPerChannel] interleaved PCM16 frames; returns the MP3
     * bytes written into [out] (0 when the encoder buffered everything,
     * negative on error). Chunk to a few thousand frames per call.
     */
    fun encode(handle: Long, pcm: ShortArray, framesPerChannel: Int, out: ByteArray): Int {
        check(handle != 0L) { "MP3 encoder is not open." }
        return nativeEncode(handle, pcm, framesPerChannel, out)
    }

    /** Flush the encoder tail into [out]; negative on error. */
    fun flush(handle: Long, out: ByteArray): Int {
        check(handle != 0L) { "MP3 encoder is not open." }
        return nativeFlush(handle, out)
    }

    /** Release the encoder. Safe to call twice; ignores 0. */
    fun close(handle: Long) {
        if (handle != 0L) nativeClose(handle)
    }

    private external fun nativeOpen(inSampleRate: Int, channels: Int, outSampleRate: Int, bitrateBps: Int, quality: Int): Long
    private external fun nativeEncode(handle: Long, pcm: ShortArray, framesPerChannel: Int, out: ByteArray): Int
    private external fun nativeFlush(handle: Long, out: ByteArray): Int
    private external fun nativeClose(handle: Long)
}
