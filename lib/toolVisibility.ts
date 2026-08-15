const hiddenToolSlugs = new Set(["background-remover", "passport-photo-maker"]);
const hiddenToolNames = new Set(["Background Remover", "Passport Photo Maker"]);

export function isToolVisibleInListings(tool: { slug: string } | string) {
  const slug = typeof tool === "string" ? tool : tool.slug;
  return !hiddenToolSlugs.has(slug);
}

export function isToolNameVisibleInListings(name: string) {
  return !hiddenToolNames.has(name);
}

export function filterVisibleTools<T extends { slug: string }>(items: readonly T[]) {
  return items.filter(isToolVisibleInListings);
}
