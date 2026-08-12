import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The admin dashboard is private — never index it.
        disallow: ["/status", "/go"],
      },
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
