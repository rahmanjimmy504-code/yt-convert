// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaHostsTest {

    @Test
    fun allowsGoogleVideoCdn() {
        assertTrue(
            MediaHosts.isAllowedMediaUrl(
                "https://rr1---sn-test.googlevideo.com/videoplayback?id=abc&pot=xyz",
            ),
        )
        assertTrue(MediaHosts.isAllowedMediaUrl("https://googlevideo.com/videoplayback"))
    }

    @Test
    fun rejectsEverythingOutsideTheAllowlist() {
        assertFalse(MediaHosts.isAllowedMediaUrl("https://evil.com/videoplayback"))
        // Lookalike: the allowlisted suffix must close the hostname.
        assertFalse(MediaHosts.isAllowedMediaUrl("https://googlevideo.com.evil.com/x"))
        assertFalse(MediaHosts.isAllowedMediaUrl("https://example.org/googlevideo.com"))
    }

    @Test
    fun rejectsNonHttpsAndCredentials() {
        assertFalse(MediaHosts.isAllowedMediaUrl("http://rr1---sn-test.googlevideo.com/x"))
        assertFalse(MediaHosts.isAllowedMediaUrl("https://user:pass@rr1---sn-test.googlevideo.com/x"))
    }

    @Test
    fun rejectsLocalAndIpHosts() {
        assertFalse(MediaHosts.isAllowedMediaUrl("https://127.0.0.1/x"))
        assertFalse(MediaHosts.isAllowedMediaUrl("https://localhost/x"))
        assertFalse(MediaHosts.isAllowedMediaUrl("https://something.local/x"))
        assertFalse(MediaHosts.isAllowedMediaUrl("https://[::1]/x"))
    }

    @Test
    fun rejectsGarbage() {
        assertFalse(MediaHosts.isAllowedMediaUrl(null))
        assertFalse(MediaHosts.isAllowedMediaUrl(""))
        assertFalse(MediaHosts.isAllowedMediaUrl("not a url"))
        assertFalse(MediaHosts.isAllowedMediaUrl("https://" + "a".repeat(5000) + ".googlevideo.com/"))
    }
}
