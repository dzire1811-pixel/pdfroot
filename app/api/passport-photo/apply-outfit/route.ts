import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Category = "female" | "male" | "children";

const OUTFITS: Record<Category, Record<string, string>> = {
  female: {
    "female-white-formal-shirt": "white formal collared shirt",
    "female-light-blue-formal-shirt": "light blue formal collared shirt",
    "female-black-formal-blazer": "black formal blazer over a modest white shirt",
    "female-navy-formal-blazer": "navy formal blazer over a modest white shirt",
    "female-black-suit": "modest black formal suit",
    "female-navy-suit": "modest navy formal suit",
  },
  male: {
    "male-white-formal-shirt": "white formal collared shirt",
    "male-light-blue-formal-shirt": "light blue formal collared shirt",
    "male-black-suit-tie": "black business suit with a plain dark tie and white shirt",
    "male-navy-suit": "navy business suit with a plain dark tie and white shirt",
    "male-black-blazer-white-shirt": "black blazer over a plain white formal shirt",
    "male-navy-blazer-white-shirt": "navy blazer over a plain white formal shirt",
    "male-plain-black-formal-shirt": "plain black formal collared shirt",
  },
  children: {
    "children-white-plain-shirt": "simple age-appropriate white collared shirt",
    "children-light-blue-plain-shirt": "simple age-appropriate light blue collared shirt",
    "children-simple-black-blazer": "simple age-appropriate black blazer over a white shirt",
    "children-simple-navy-blazer": "simple age-appropriate navy blazer over a white shirt",
  },
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function unavailable() {
  return NextResponse.json(
    { available: false, message: "AI formal outfits are currently unavailable." },
    { status: 503 },
  );
}

export async function GET() {
  return NextResponse.json({ available: Boolean(process.env.OPENAI_API_KEY) });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return unavailable();

  try {
    const input = await request.formData();
    const image = input.get("image");
    const mask = input.get("mask");
    const category = input.get("category");
    const outfitId = input.get("outfitId");

    if (!(image instanceof File) || typeof category !== "string" || typeof outfitId !== "string") {
      return NextResponse.json({ message: "A valid photo, category and outfit are required." }, { status: 400 });
    }
    if (!(category in OUTFITS)) {
      return NextResponse.json({ message: "The selected category is not supported." }, { status: 400 });
    }
    const selectedOutfit = OUTFITS[category as Category][outfitId];
    if (!selectedOutfit) {
      return NextResponse.json({ message: "The selected outfit is not supported." }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(image.type) || image.size === 0 || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ message: "Upload a JPG, PNG or WEBP photo smaller than 15 MB." }, { status: 400 });
    }
    if (mask instanceof File && (mask.type !== "image/png" || mask.size > MAX_IMAGE_BYTES)) {
      return NextResponse.json({ message: "The supplied edit mask is invalid." }, { status: 400 });
    }

    const prompt = [
      `Replace only the visible clothing below the subject's neck with a clean ${selectedOutfit}.`,
      "Preserve the original face, facial identity, skin tone, hairstyle, ears, glasses, expression, head shape and pose.",
      "Do not beautify, retouch or regenerate the face. Do not change gender presentation.",
      "Do not add jewellery, logos, badges, patterns or decorative accessories.",
      "Keep the head, hair, neck and all facial features pixel-faithful to the source wherever possible.",
      "Create a plain professional outfit suitable for a passport-style photograph and keep the existing composition.",
    ].join(" ");

    const formData = new FormData();
    formData.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2");
    formData.append("image", image, image.name || "passport-source.png");
    if (mask instanceof File && mask.size > 0) formData.append("mask", mask, "neck-down-mask.png");
    formData.append("prompt", prompt);
    formData.append("input_fidelity", "high");
    formData.append("quality", "medium");
    formData.append("size", "1024x1536");
    formData.append("output_format", "png");
    formData.append("n", "1");

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string };
    };

    if (!response.ok || !payload.data?.[0]) {
      return NextResponse.json(
        { message: "Passport photo could not be generated. Your original photo is safe." },
        { status: response.status >= 400 && response.status < 500 ? 422 : 502 },
      );
    }

    const result = payload.data[0];
    let bytes: Uint8Array;
    if (result.b64_json) {
      bytes = Buffer.from(result.b64_json, "base64");
    } else if (result.url) {
      const imageResponse = await fetch(result.url, { cache: "no-store" });
      if (!imageResponse.ok) throw new Error("Generated image download failed.");
      bytes = new Uint8Array(await imageResponse.arrayBuffer());
    } else {
      throw new Error("The image API returned no image.");
    }

    const responseBody = Uint8Array.from(bytes).buffer;
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Passport-Photo-Status": "ready",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Passport photo could not be generated. Your original photo is safe." },
      { status: 500 },
    );
  }
}
