import { NextRequest, NextResponse } from "next/server";
import { fetchEventBySlug } from "@/lib/polymarket/gamma";
import { buildFeatures } from "@/lib/features";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json(
      { ok: false, reason: "missing-slug" },
      { status: 400 },
    );
  }

  const ev = await fetchEventBySlug(slug);
  if (!ev) {
    return NextResponse.json(
      { ok: false, reason: "market-not-found" },
      { status: 404 },
    );
  }

  const features = await buildFeatures(ev);
  return NextResponse.json({ ok: true, slug, features });
}
