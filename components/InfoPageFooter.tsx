import { HomepageSiteFooter } from "@/components/homepage/site-footer";
import { imageTools, pdfTools, tools } from "@/lib/tools";

export function InfoPageFooter() {
  return <HomepageSiteFooter pdfTools={pdfTools} imageTools={imageTools} governmentTools={tools.filter((tool) => tool.government)} />;
}
