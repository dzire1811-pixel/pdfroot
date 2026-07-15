const sitemapUrl = "https://www.pdfroot.com/sitemap.xml";
const endpoint = "https://api.indexnow.org/indexnow";
const host = "www.pdfroot.com";
const key = "9c30dffae44740768f32460388f00b42";
const keyLocation =
  "https://www.pdfroot.com/9c30dffae44740768f32460388f00b42.txt";

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function submitIndexNow() {
  console.log(`Fetching sitemap: ${sitemapUrl}`);

  const sitemapResponse = await fetch(sitemapUrl, {
    headers: { Accept: "application/xml, text/xml;q=0.9" },
  });

  if (!sitemapResponse.ok) {
    throw new Error(
      `Sitemap request failed with HTTP ${sitemapResponse.status} ${sitemapResponse.statusText}`,
    );
  }

  const sitemapXml = await sitemapResponse.text();
  const locations = [...sitemapXml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map(
    ([, location]) => decodeXml(location.trim()),
  );
  const urlList = [...new Set(locations)];

  if (urlList.length === 0) {
    throw new Error("The sitemap does not contain any <loc> URLs.");
  }

  for (const value of urlList) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== host) {
      throw new Error(`Refusing to submit a non-canonical sitemap URL: ${value}`);
    }
  }

  console.log(`Submitting ${urlList.length} URLs to IndexNow.`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ host, key, keyLocation, urlList }),
  });
  const responseBody = await response.text();

  console.log(`IndexNow HTTP status: ${response.status} ${response.statusText}`);
  if (responseBody) {
    console.log(`IndexNow response: ${responseBody}`);
  }

  if (!response.ok) {
    throw new Error("IndexNow rejected the URL submission.");
  }

  console.log("IndexNow submission accepted successfully.");
}

submitIndexNow().catch((error) => {
  console.error(
    `IndexNow submission failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
