// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert.plugins.ytextractor

import java.net.URI

/**
 * On-device counterpart of the website's SSRF allowlist (src/lib/media-hosts.ts).
 *
 * The phone only ever downloads what its own Innertube extraction returned over
 * its own connection, so the list is deliberately TIGHTER than the server's:
 * YouTube's CDN suffix only. Every extracted format URL is checked before it is
 * returned to the WebView, and the download entry point re-checks it again —
 * a tampered or replayed URL cannot smuggle another host past the download.
 *
 * Like the website module, every rule comes from compile-time constants: there
 * is no env-derived widening and no runtime discovery state.
 */
object MediaHosts {

    private val ALLOWED_SUFFIXES = listOf(
        "googlevideo.com",
    )

    fun isAllowedMediaUrl(raw: String?): Boolean {
        if (raw.isNullOrEmpty() || raw.length > 4096) return false
        val uri = try {
            URI(raw)
        } catch (_: Exception) {
            return false
        }
        if (!"https".equals(uri.scheme, ignoreCase = true)) return false
        if (uri.userInfo != null) return false
        val host = uri.host?.lowercase()?.trimEnd('.') ?: return false
        if (host.isEmpty()) return false
        if (isBlockedHost(host)) return false
        return ALLOWED_SUFFIXES.any { host == it || host.endsWith(".$it") }
    }

    private fun isIpLiteral(host: String): Boolean {
        if (Regex("""^\d{1,3}(?:\.\d{1,3}){3}$""").matches(host)) return true
        // IPv6, or IPv4-mapped forms — hosts with colons are never DNS names here.
        if (host.contains(':')) return true
        return false
    }

    private fun isBlockedHost(host: String): Boolean {
        val h = host.trimEnd('.')
        if (h == "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true
        if (h == "0.0.0.0" || h == "::1" || h == "[::1]") return true
        return isIpLiteral(h)
    }
}
