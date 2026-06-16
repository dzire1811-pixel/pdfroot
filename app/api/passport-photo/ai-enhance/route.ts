import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      available: false,
      message: "AI HD Enhance will be available soon. Basic enhancement applied.",
    },
    { status: 202 },
  );
}
