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
    fun humanBytesUsesReadableUnits() {
        assertEquals("0 B", DownloadJob.humanBytes(0))
        assertEquals("512 B", DownloadJob.humanBytes(512))
        assertEquals("1.0 KB", DownloadJob.humanBytes(1024))
        assertEquals("1.5 MB", DownloadJob.humanBytes(1_572_864))
        assertEquals("", DownloadJob.humanBytes(-1))
    }
}
