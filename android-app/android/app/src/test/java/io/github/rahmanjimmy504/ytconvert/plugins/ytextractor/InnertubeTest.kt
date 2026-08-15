// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InnertubeTest {

    private fun client(name: String): Innertube.Client =
        Innertube.CLIENTS.first { it.name == name }

    @Test
    fun clientTableMatchesTheWebsiteOrder() {
        assertEquals(
            listOf(
                "ANDROID_MUSIC",
                "IOS_MUSIC",
                "ANDROID",
                "IOS",
                "ANDROID_VR",
                "VISIONOS",
                "WEB_EMBEDDED_PLAYER",
                "TVHTML5",
            ),
            Innertube.CLIENTS.map { it.clientName },
        )
    }

    @Test
    fun androidMusicRequestHasParityHeadersAndBody() {
        val req = Innertube.buildPlayerRequest(client("android_music"), "dQw4w9WgXcQ")
        assertEquals("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", req.endpoint)
        assertEquals("21", req.headers["X-YouTube-Client-Name"])
        assertEquals("7.27.52", req.headers["X-YouTube-Client-Version"])
        assertTrue(req.headers["User-Agent"]!!.startsWith("com.google.android.apps.youtube.music"))
        assertNull(req.headers["Cookie"]) // the app never harvests cookies
        assertNull(req.headers["Referer"])

        assertEquals("dQw4w9WgXcQ", req.body.getString("videoId"))
        assertTrue(req.body.getBoolean("contentCheckOk"))
        assertTrue(req.body.getBoolean("racyCheckOk"))
        val ctx = req.body.getJSONObject("context").getJSONObject("client")
        assertEquals("ANDROID_MUSIC", ctx.getString("clientName"))
        assertEquals("7.27.52", ctx.getString("clientVersion"))
        assertEquals("en", ctx.getString("hl"))
        assertEquals("US", ctx.getString("gl"))
        assertEquals(0, ctx.getInt("utcOffsetMinutes"))
        assertEquals(30, ctx.getInt("androidSdkVersion"))
        assertFalse(req.body.has("serviceIntegrityDimensions")) // no PO token in the APK
    }

    @Test
    fun webEmbeddedRequestIsAThirdPartyEmbedWithThePublicKey() {
        val req = Innertube.buildPlayerRequest(client("web_embedded"), "dQw4w9WgXcQ")
        assertTrue(req.endpoint.contains("key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"))
        // A youtube.com embedUrl is refused (error 152) since 2026-03.
        assertEquals("https://www.reddit.com/", req.headers["Referer"])
        val thirdParty = req.body.getJSONObject("context").getJSONObject("thirdParty")
        assertEquals("https://www.reddit.com/", thirdParty.getString("embedUrl"))
    }

    @Test
    fun collectFormatsKeepsDirectUrlsOnlyAndDropsCipherEntries() {
        val streaming = JSONObject(
            """
            {
              "formats": [
                { "itag": 18, "url": "https://rr---sn-test.googlevideo.com/videoplayback?itag=18",
                  "mimeType": "video/mp4", "qualityLabel": "360p", "bitrate": 500000,
                  "width": 640, "height": 360 },
                { "itag": 137, "signatureCipher": "s=abc&url=https%3A%2F%2Fexample" }
              ],
              "adaptiveFormats": [
                { "itag": 140, "url": "https://rr---sn-test.googlevideo.com/videoplayback?itag=140",
                  "mimeType": "audio/mp4", "audioQuality": "AUDIO_QUALITY_MEDIUM",
                  "bitrate": 129000 }
              ]
            }
            """.trimIndent(),
        )
        val data = JSONObject().put("streamingData", streaming)
        val formats = Innertube.collectFormats(data, "ANDROID_MUSIC")
        assertEquals(listOf(18, 140), formats.map { it.itag })
        assertEquals("360p", formats[0].qualityLabel)
        assertEquals(129000L, formats[1].bitrate)
        assertEquals("ANDROID_MUSIC", formats[0].sourceClient)
    }

    @Test
    fun botChallengeIsRecognisedFromTheReasonText() {
        assertTrue(Innertube.isBotChallenge("LOGIN_REQUIRED", "Sign in to confirm you're not a bot"))
        assertTrue(Innertube.isBotChallenge("ERROR", "unusual traffic from this network"))
        assertFalse(Innertube.isBotChallenge("LOGIN_REQUIRED", "This is a private video."))
        assertFalse(Innertube.isBotChallenge("CONTENT_CHECK_REQUIRED", "confirm you're not a bot"))
        assertFalse(Innertube.isBotChallenge(null, null))
    }

    @Test
    fun playabilityMessagesStayHonest() {
        assertEquals("", Innertube.playabilityMessage("OK", null))
        assertEquals("", Innertube.playabilityMessage(null, null))
        assertTrue(
            Innertube.playabilityMessage("LOGIN_REQUIRED", "Sign in to confirm you're not a bot")
                .contains("bot check"),
        )
        assertEquals(
            "This live stream is offline, so there is no file to download.",
            Innertube.playabilityMessage("LIVE_STREAM_OFFLINE", null),
        )
        assertEquals(
            "YouTube refused playback: weird reason",
            Innertube.playabilityMessage("SOMETHING_NEW", "weird reason"),
        )
    }

    @Test
    fun youTubeIdsAreExtractedFromCommonShapes() {
        assertEquals("dQw4w9WgXcQ", Innertube.extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", Innertube.extractYouTubeId("https://youtu.be/dQw4w9WgXcQ?si=abc"))
        assertEquals("dQw4w9WgXcQ", Innertube.extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", Innertube.extractYouTubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertNull(Innertube.extractYouTubeId("https://www.youtube.com/watch?v=short"))
        // Domain-agnostic on purpose (website parity): the UI only ever passes
        // YouTube-family URLs here, gated by detectPlatform() in the bundle.
        assertEquals("dQw4w9WgXcQ", Innertube.extractYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ"))
    }
}
