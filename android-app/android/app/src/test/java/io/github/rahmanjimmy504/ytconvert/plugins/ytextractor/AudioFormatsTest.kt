// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Byte-exact framing tests for the pure transcode helpers. Reference values
 * come from the RIFF/WAVE, native-FLAC, and Ogg-Opus format specifications —
 * a player rejecting these headers means the framing here is wrong.
 */
class AudioFormatsTest {

    /* ---------- WAV ---------- */

    @Test
    fun wavHeaderCarriesCanonicalPcmFields() {
        val h = AudioFormats.wavHeader(100, 44_100, 2)
        assertEquals(44, h.size)
        assertEquals("RIFF", String(h, 0, 4, Charsets.US_ASCII))
        assertEquals("WAVE", String(h, 8, 4, Charsets.US_ASCII))
        assertEquals("fmt ", String(h, 12, 4, Charsets.US_ASCII))
        assertEquals("data", String(h, 36, 4, Charsets.US_ASCII))
        assertEquals(136L, AudioFormats.wavRiffSize(100)) // 36 + data
    }

    @Test
    fun wavHeaderLittleEndianFieldsMatchReference() {
        val h = AudioFormats.wavHeader(100, 44_100, 2)
        // fmt chunk size 16
        assertArrayEquals(byteArrayOf(16, 0, 0, 0), h.copyOfRange(16, 20))
        // PCM tag 1, stereo
        assertArrayEquals(byteArrayOf(1, 0), h.copyOfRange(20, 22))
        assertArrayEquals(byteArrayOf(2, 0), h.copyOfRange(22, 24))
        // 44100 Hz
        assertArrayEquals(byteArrayOf(0x44, 0xAC.toByte(), 0, 0), h.copyOfRange(24, 28))
        // byte rate 176400, block align 4, bits 16
        assertArrayEquals(byteArrayOf(0x10, 0xB1.toByte(), 0x02, 0), h.copyOfRange(28, 32))
        assertArrayEquals(byteArrayOf(4, 0), h.copyOfRange(32, 34))
        assertArrayEquals(byteArrayOf(16, 0), h.copyOfRange(34, 36))
        // riff + data sizes with dataBytes = 100
        assertArrayEquals(byteArrayOf(136.toByte(), 0, 0, 0), h.copyOfRange(4, 8))
        assertArrayEquals(byteArrayOf(100, 0, 0, 0), h.copyOfRange(40, 44))
    }

    @Test(expected = IllegalArgumentException::class)
    fun wavRejectsFourGiBFiles() {
        AudioFormats.wavRiffSize(0xFFFF_FFFFL) // 36 + that overflows 32 bits
    }

    /* ---------- FLAC ---------- */

    @Test
    fun flacStreamInfoMatchesTheSpecificationBitLayout() {
        // 44100 Hz stereo 16-bit: the canonical "0A C4 42 F0" word.
        val si = AudioFormats.flacStreamInfo(44_100, 2, 16)
        assertEquals(34, si.size)
        assertArrayEquals(
            byteArrayOf(0x0A, 0xC4.toByte(), 0x42, 0xF0.toByte()),
            si.copyOfRange(10, 14),
        )
        // 48000 Hz: "0B B8 02 F0".
        val si48 = AudioFormats.flacStreamInfo(48_000, 2, 16)
        assertArrayEquals(
            byteArrayOf(0x0B, 0xB8.toByte(), 0x02, 0xF0.toByte()),
            si48.copyOfRange(10, 14),
        )
        // Block size 4096 default.
        assertArrayEquals(byteArrayOf(0x10, 0x00), si.copyOfRange(0, 2))
        assertArrayEquals(byteArrayOf(0x10, 0x00), si.copyOfRange(2, 4))
        // MD5 and total-samples start zeroed (patched at EOS).
        assertArrayEquals(ByteArray(16), si.copyOfRange(18, 34))
    }

    @Test
    fun flacTotalSamplesPatchesAcrossByteBoundaries() {
        val si = AudioFormats.flacStreamInfo(44_100, 2, 16)
        AudioFormats.writeBits(si, AudioFormats.STREAMINFO_TOTAL_SAMPLES_BIT, 36, 44_100)
        // 36-bit big-endian field at bit 108: F0 00 00 AC 44.
        assertArrayEquals(
            byteArrayOf(0xF0.toByte(), 0, 0, 0xAC.toByte(), 0x44),
            si.copyOfRange(13, 18),
        )
        AudioFormats.writeBits(si, AudioFormats.STREAMINFO_TOTAL_SAMPLES_BIT, 36, 0)
        assertArrayEquals(byteArrayOf(0, 0, 0, 0, 0), si.copyOfRange(13, 18))
    }

    @Test
    fun flacBlockHeaderIsLastTypeZeroLength34() {
        assertArrayEquals(
            byteArrayOf(0x80, 0, 0, 34),
            AudioFormats.flacMetadataBlockHeader(isLast = true, blockType = 0, lengthBytes = 34),
        )
        assertArrayEquals(
            byteArrayOf(0x00, 0x01, 0x00, 0x00),
            AudioFormats.flacMetadataBlockHeader(isLast = false, blockType = 1, lengthBytes = 0x10000),
        )
    }

    @Test
    fun flacHeaderSnifferSkipsMetadataBlocksAndLeavesFrames() {
        val block = ByteArray(64)
        "fLaC".toByteArray(Charsets.US_ASCII).copyInto(block, 0)
        AudioFormats.flacMetadataBlockHeader(true, 0, 34).copyInto(block, 4)
        val si = AudioFormats.flacStreamInfo(44_100, 2, 16)
        si.copyInto(block, 8)
        block[8 + 34] = 0xFF.toByte() // first frame byte
        assertEquals(8 + 34, AudioFormats.flacSkipStreamHeader(block, block.size))
        assertEquals(-1, AudioFormats.flacSkipStreamHeader(si, si.size))
    }

    /* ---------- Opus ---------- */

    @Test
    fun opusHeadMatchesTheReferenceEncoding() {
        val h = AudioFormats.opusHead(44_100, 2, preSkip = 312)
        assertEquals(19, h.size)
        assertEquals("OpusHead", String(h, 0, 8, Charsets.US_ASCII))
        assertArrayEquals(
            byteArrayOf(1, 2, 0x38, 0x01, 0x80, 0xBB.toByte(), 0, 0, 0, 0, 0),
            h.copyOfRange(8, 19),
        )
        assertTrue(AudioFormats.isOpusHead(h, h.size))
        assertFalse(AudioFormats.isOpusTags(h, h.size))
    }

    @Test
    fun opusTagsEncodesOneVendorAndZeroComments() {
        val t = AudioFormats.opusTags("yt-convert-android")
        val vendor = "yt-convert-android".toByteArray(Charsets.US_ASCII)
        assertEquals(8 + 4 + vendor.size + 4, t.size)
        assertEquals("OpusTags", String(t, 0, 8, Charsets.US_ASCII))
        assertTrue(AudioFormats.isOpusTags(t, t.size))
        // vendor length (LE) + vendor + comment count 0 (LE)
        assertArrayEquals(
            byteArrayOf(vendor.size, 0, 0, 0) + vendor + byteArrayOf(0, 0, 0, 0),
            t.copyOfRange(8, t.size),
        )
    }

    @Test
    fun oddRatesSnapIntoTheOpusFamily() {
        assertEquals(48_000, AudioFormats.nearestOpusRate(44_100))
        assertEquals(48_000, AudioFormats.nearestOpusRate(96_000))
        assertEquals(24_000, AudioFormats.nearestOpusRate(22_050))
        assertEquals(16_000, AudioFormats.nearestOpusRate(16_000))
        assertEquals(12_000, AudioFormats.nearestOpusRate(11_025))
        assertEquals(8_000, AudioFormats.nearestOpusRate(8_000))
    }

    /* ---------- resampler ---------- */

    @Test
    fun resamplerPreservesDcAndHitsTheLengthRatio() {
        val r = AudioFormats.LinearResampler(1, 44_100, 48_000)
        var out = ShortArray(0)
        // 1 second of DC in 10 blocks.
        repeat(10) {
            val block = ShortArray(4_410) { 1_000 }
            out += r.process(block, block.size)
        }
        out += r.finish() ?: ShortArray(0)
        // 1 s at 48 kHz (a step of float accumulation is allowed), and linear
        // interpolation of DC is exact DC.
        assertTrue("unexpected length ${out.size}", out.size in 47_998..48_002)
        assertTrue(out.all { it == 1_000.toShort() })
    }

    @Test
    fun resamplerKeepsStereoChannelsInterleaved() {
        val r = AudioFormats.LinearResampler(2, 44_100, 48_000)
        val block = ShortArray(2 * 4_410)
        for (i in 0 until 4_410) {
            block[2 * i] = 5_000
            block[2 * i + 1] = -5_000
        }
        val out = r.process(block, 4_410) + (r.finish() ?: ShortArray(0))
        assertEquals(true, out.size % 2 == 0)
        // DC per channel: left positive, right negative throughout.
        var i = 0
        while (i < out.size) {
            assertTrue(out[i] > 0)
            assertTrue(out[i + 1] < 0)
            i += 2
        }
    }

    @Test
    fun resamplerProducesNothingWithoutInput() {
        val r = AudioFormats.LinearResampler(1, 48_000, 48_000)
        assertNull(r.finish())
        assertEquals(0, r.process(ShortArray(0), 0).size)
    }

    /* ---------- MP3 sizing ---------- */

    @Test
    fun mp3BufferFollowsLamesWorstCaseFormula() {
        // LAME: 1.25 * samples + 7200 (integer division).
        assertEquals(21_600, AudioFormats.mp3OutputBufferSize(11_520))
        assertEquals(8_336, AudioFormats.mp3OutputBufferSize(909))
    }
}
