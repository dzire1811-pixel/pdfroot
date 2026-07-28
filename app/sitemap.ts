import type { MetadataRoute } from "next";
import { blogPosts } from "@/lib/blog";
import { tools } from "@/lib/tools";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = "https://www.pdfroot.com";
  const now = new Date();

  const staticRoutes = ["", "/about", "/faq", "/blog", "/contact", "/privacy-policy", "/terms-and-conditions", "/disclaimer", "/tools"];
  const toolRoutes = tools.map((tool) => `/${tool.slug}`);

  const routeEntries: MetadataRoute.Sitemap = [...staticRoutes, ...toolRoutes].map((route) => ({
    url: route === "" ? `${siteUrl}/` : `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/tools" ? 0.9 : 0.8,
  }));

  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: post.canonicalUrl ?? `${siteUrl}/blog/${post.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...routeEntries, ...blogEntries];
}
