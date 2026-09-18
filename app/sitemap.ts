import type { MetadataRoute } from "next";
import { blogPosts } from "@/lib/blog";
import { tools } from "@/lib/tools";
import { filterVisibleTools } from "@/lib/toolVisibility";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = "https://www.pdfroot.com";
  const now = new Date();

  const staticRoutes = ["", "/about", "/faq", "/blog", "/contact", "/privacy-policy", "/terms-and-conditions", "/disclaimer", "/tools"];
  // Hidden experimental/optional tools stay available at their URL but are not
  // promoted as indexable destination pages until they are ready for listings.
  const toolRoutes = filterVisibleTools(tools).map((tool) => `/${tool.slug}`);

  const routeEntries: MetadataRoute.Sitemap = [...staticRoutes, ...toolRoutes].map((route) => ({
    url: route === "" ? `${siteUrl}/` : `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/tools" ? 0.9 : 0.8,
  }));

  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: post.canonicalUrl ?? `${siteUrl}/blog/${post.slug}`,
    lastModified: post.modifiedAt ?? now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...routeEntries, ...blogEntries];
}
