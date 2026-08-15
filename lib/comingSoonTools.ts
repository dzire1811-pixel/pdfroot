const comingSoonToolSlugs = new Set(["background-remover", "passport-photo-maker"]);

export function isComingSoonTool(slug: string) {
  return comingSoonToolSlugs.has(slug);
}
