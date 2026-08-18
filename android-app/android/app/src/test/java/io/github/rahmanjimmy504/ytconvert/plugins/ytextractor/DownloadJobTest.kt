// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadJobTest {

    @Test
    fun percentIsClampedWhole() {
        assertEquals(0, DownloadJob.progressPercent(0, 1000))
        assertEquals(50, DownloadJob.progressPercent(500, 1000))
        assertEquals(100, DownloadJob.progressPercent(1000, 1000))
        assertEquals(100, DownloadJob.progressPercent(1500, 1000))
    }

    @Test
    fun percentIsHonestWhenLengthIsUnknown() {
        // Chunked/unknown Content-Length must not fake a percentage.
        assertEquals(-1, DownloadJob.progressPercent(500, -1))
        assertEquals(-1, DownloadJob.progressPercent(500, 0))
        assertEquals(-1, DownloadJob.progressPercent(-5, 100))
    }

    @Test
    fun adaptiveAudioUrlMarksAMuxJob() {
        val progressive = DownloadJob(1, "video", "file.mp4", "video/mp4", "File")
        val adaptive = progressive.copy(audioUrl = "audio", expectedBytes = 1234)
        assertEquals(false, progressive.muxing)
        assertEquals(true, adaptive.muxing)
        assertEquals(1234L, adaptive.expectedBytes)
    }

    @Test
    fun extractAudioFlagMarksAnAudioOnlyRemuxJob() {
        // A combined progressive source (video+AAC) that must be saved as an
        // audio-only M4A: extractAudio is true while muxing stays false —
        // there is no second adaptive track to combine.
        val audioOnly = DownloadJob(
            id = 2,
            url = "video",
            filename = "file.m4a",
            mimeType = "audio/mp4",
            title = "File",
            extractAudio = true,
        )
        assertEquals(true, audioOnly.extractAudio)
        assertEquals(false, audioOnly.muxing)
    }

    @Test
    fun plainJobsHaveNoAudioExtraction() {
        val job = DownloadJob(3, "video", "file.mp4", "video/mp4", "File")
        assertEquals(false, job.extractAudio)
    }

    @Test
    fun defaultsKeepLegacyStreamCopyJobsUnchanged() {
        // Jobs that predate the format picker must behave exactly as before.
        val job = DownloadJob(4, "video", "file.mp4", "video/mp4", "File")
        assertEquals("mp4", job.target)
        assertEquals(false, job.transcode)
        assertEquals(false, job.transcoding)
        assertEquals(-1, job.audioBitrate)
    }

    @Test
    fun transcodeJobsCarryTargetAndBitrate() {
        val job = DownloadJob(
            id = 5,
            url = "audio",
            filename = "Track.flac",
            mimeType = "audio/flac",
            title = "Track",
            target = "flac",
            transcode = true,
            audioBitrate = -1,
        )
        assertEquals("flac", job.target)
        assertEquals(true, job.transcoding)
        assertEquals(false, job.extractAudio)
        assertEquals(false, job.muxing)
    }

    @Test
    fun humanBytesUsesReadableUnits() {
        assertEquals("0 B", DownloadJob.humanBytes(0))
        assertEquals("512 B", DownloadJob.humanBytes(512))
        assertEquals("1.0 KB", DownloadJob.humanBytes(1024))
        assertEquals("1.5 MB", DownloadJob.humanBytes(1_572_864))
        assertEquals("", DownloadJob.humanBytes(-1))
    }
}
