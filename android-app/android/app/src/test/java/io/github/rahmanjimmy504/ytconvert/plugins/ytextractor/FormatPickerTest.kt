// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun fmt(
    itag: Int,
    mime: String,
    height: Int = 0,
    bitrate: Long = 0,
    audioQuality: String? = null,
    qualityLabel: String? = null,
    url: String = "https://rr---sn-test.googlevideo.com/videoplayback?itag=$itag",
): PlayerFormat = PlayerFormat(
    url = url,
    mimeType = mime,
    qualityLabel = qualityLabel,
    audioQuality = audioQuality,
    bitrate = bitrate,
    width = 0,
    height = height,
    itag = itag,
    sourceClient = "ANDROID_MUSIC",
)

private val PROGRESSIVE_360 = fmt(18, "video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"", height = 360, bitrate = 500_000, audioQuality = "AUDIO_QUALITY_MEDIUM", qualityLabel = "360p")
private val PROGRESSIVE_720 = fmt(22, "video/mp4; codecs=\"avc1.64001F, mp4a.40.2\"", height = 720, bitrate = 1_200_000, audioQuality = "AUDIO_QUALITY_MEDIUM", qualityLabel = "720p")
private val VIDEO_1080 = fmt(137, "video/mp4; codecs=\"avc1.640028\"", height = 1080, bitrate = 4_000_000)
private val VIDEO_VP9_1080 = fmt(248, "video/mp4; codecs=\"vp09.00.40.08\"", height = 1080, bitrate = 3_000_000)
private val AUDIO_AAC_128 = fmt(140, "audio/mp4; codecs=\"mp4a.40.2\"", bitrate = 129_000, audioQuality = "AUDIO_QUALITY_MEDIUM")
private val AUDIO_OPUS_160 = fmt(251, "audio/webm; codecs=\"opus\"", bitrate = 160_000, audioQuality = "AUDIO_QUALITY_MEDIUM")

class FormatPickerTest {

    @Test
    fun videoBestPicksHighestProgressive() {
        val pick = FormatPicker.pickVideo(listOf(PROGRESSIVE_360, PROGRESSIVE_720, VIDEO_1080), "best")
        assertEquals(22, pick?.itag)
    }

    @Test
    fun videoQualityPicksClosestHeightAtOrBelow() {
        val pick = FormatPicker.pickVideo(listOf(PROGRESSIVE_360, PROGRESSIVE_720), "480")
        assertEquals(18, pick?.itag)
    }

    @Test
    fun videoQualityFallsBackToClosestAbove() {
        val pick = FormatPicker.pickVideo(listOf(PROGRESSIVE_360), "720")
        assertEquals(18, pick?.itag)
    }

    @Test
    fun videoNeverPicksVideoOnlyTracks() {
        // 1080p is video-only; the MVP must not hand back a silent file.
        val pick = FormatPicker.pickVideo(listOf(VIDEO_1080, AUDIO_AAC_128), "best")
        assertNull(pick)
    }

    @Test
    fun audioPrefersM4aOverOpus() {
        val pick = FormatPicker.pickAudio(listOf(AUDIO_AAC_128, AUDIO_OPUS_160), "best")
        assertEquals(140, pick?.itag)
    }

    @Test
    fun audioQualityTargetsBitrate() {
        val low = fmt(139, "audio/mp4; codecs=\"mp4a.40.5\"", bitrate = 49_000, audioQuality = "AUDIO_QUALITY_LOW")
        val pick = FormatPicker.pickAudio(listOf(AUDIO_AAC_128, low), "64")
        assertEquals(139, pick?.itag)
    }

    @Test
    fun audioFallsBackToProgressiveWhenNoSeparateTrack() {
        val pick = FormatPicker.pickAudio(listOf(PROGRESSIVE_360), "best")
        assertEquals(18, pick?.itag)
        assertTrue(FormatPicker.isProgressiveMp4(pick!!))
    }

    @Test
    fun nonAllowlistedUrlsAreIgnored() {
        val rogue = PROGRESSIVE_360.copy(url = "https://evil.com/file.mp4", itag = 59)
        assertNull(FormatPicker.pickVideo(listOf(rogue), "best"))
    }

    @Test
    fun planIsProgressiveWhenItMeetsTheTarget() {
        val plan = FormatPicker.planVideoDownload(listOf(PROGRESSIVE_360, PROGRESSIVE_720), "720")
        assertTrue(plan is VideoPlan.Progressive)
        assertEquals(22, (plan as VideoPlan.Progressive).video.itag)
    }

    @Test
    fun planIsMuxWhenOnlyAdaptiveTracksReachTheTarget() {
        val plan = FormatPicker.planVideoDownload(listOf(PROGRESSIVE_360, VIDEO_1080, AUDIO_AAC_128), "1080")
        assertTrue(plan is VideoPlan.Mux)
        val mux = plan as VideoPlan.Mux
        assertEquals(137, mux.video.itag)
        assertEquals(140, mux.audio.itag)
    }

    @Test
    fun planFallsBackToProgressiveWhenNoAudioTrack() {
        val plan = FormatPicker.planVideoDownload(listOf(PROGRESSIVE_360, VIDEO_1080), "1080")
        assertTrue(plan is VideoPlan.Progressive)
    }

    @Test
    fun planFallsBackWhenOnlyOpusAudioIsAvailable() {
        val plan = FormatPicker.planVideoDownload(
            listOf(PROGRESSIVE_360, VIDEO_1080, AUDIO_OPUS_160),
            "1080",
        )
        assertTrue(plan is VideoPlan.Progressive)
    }

    @Test
    fun planFallsBackWhenOnlyVp9VideoIsAvailable() {
        val plan = FormatPicker.planVideoDownload(
            listOf(PROGRESSIVE_360, VIDEO_VP9_1080, AUDIO_AAC_128),
            "1080",
        )
        assertTrue(plan is VideoPlan.Progressive)
    }

    @Test
    fun extensionsMatchContainers() {
        assertEquals("mp4", FormatPicker.extensionForMime("video/mp4; codecs=\"avc1, mp4a.40.2\""))
        assertEquals("m4a", FormatPicker.extensionForMime("audio/mp4; codecs=\"mp4a.40.2\""))
        assertEquals("webm", FormatPicker.extensionForMime("audio/webm; codecs=\"opus\""))
        assertEquals("mp3", FormatPicker.extensionForMime("audio/mpeg"))
    }

    @Test
    fun filenamesAreSanitized() {
        assertEquals(
            "My Video Official.mp4",
            FormatPicker.sanitizeDownloadFilename("My Video: Official?", "mp4"),
        )
        assertEquals("download.bin", FormatPicker.sanitizeDownloadFilename("", ""))
        assertEquals(
            "a".repeat(80) + ".m4a",
            FormatPicker.sanitizeDownloadFilename("a".repeat(200), "m4a"),
        )
    }
}
