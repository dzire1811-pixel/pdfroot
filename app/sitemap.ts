import type { MetadataRoute } from "next";
import { tools } from "@/lib/tools";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = "https://pdfroot.com";
  const now = new Date();

  const staticRoutes = ["", "/about", "/faq", "/blog", "/contact", "/privacy-policy", "/terms-and-conditions", "/disclaimer", "/tools", "/login", "/signup", "/dashboard"];
  const toolRoutes = tools.map((tool) => `/${tool.slug}`);

  return [...staticRoutes, ...toolRoutes].map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/tools" ? 0.9 : 0.8,
  }));
}
