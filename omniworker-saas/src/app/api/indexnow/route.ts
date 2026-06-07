// src/app/api/indexnow/route.ts — IndexNow API for instant Bing/Yandex indexing
import { NextRequest, NextResponse } from "next/server";
import { PROGRAMMATIC_KEYWORDS } from "@/lib/programmatic-data";

const INDEXNOW_KEY = "a970226e46492f4b9fa841ea67ee2749";
const HOST = "flux.simplex.lat";
const BASE_URL = `https://${HOST}`;

// POST /api/indexnow — Submit URLs for instant indexing
// Body: { mode: "all" | "recent", slugs?: string[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode || "all";

    let urlList: string[] = [];

    if (mode === "all") {
      // Submit all programmatic pages + static pages
      urlList = [
        BASE_URL,
        `${BASE_URL}/blog`,
        `${BASE_URL}/register`,
        `${BASE_URL}/login`,
        ...PROGRAMMATIC_KEYWORDS.map(k => `${BASE_URL}/${k.slug}`),
      ];
    } else if (mode === "specific" && body.slugs?.length) {
      urlList = body.slugs.map((s: string) => `${BASE_URL}/${s}`);
    } else {
      // Default: just static pages
      urlList = [BASE_URL, `${BASE_URL}/blog`];
    }

    // IndexNow API accepts max 10,000 URLs per batch
    const batchSize = 10000;
    const results: { engine: string; status: number; batch: number }[] = [];

    for (let i = 0; i < urlList.length; i += batchSize) {
      const batch = urlList.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      // Submit to Bing IndexNow
      const bingRes = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: HOST,
          key: INDEXNOW_KEY,
          keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
          urlList: batch,
        }),
      });
      results.push({ engine: "IndexNow (Bing/Yandex)", status: bingRes.status, batch: batchNum });
    }

    return NextResponse.json({
      success: true,
      totalUrls: urlList.length,
      batches: Math.ceil(urlList.length / batchSize),
      results,
      message: `Submitted ${urlList.length} URLs for instant indexing`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to submit to IndexNow", details: String(error) },
      { status: 500 }
    );
  }
}

// GET /api/indexnow — Status check
export async function GET() {
  return NextResponse.json({
    service: "IndexNow",
    key: INDEXNOW_KEY,
    keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
    totalPages: PROGRAMMATIC_KEYWORDS.length + 4,
    engines: ["Bing", "Yandex", "Seznam", "Naver"],
    usage: "POST /api/indexnow with body { mode: 'all' } to submit all pages",
  });
}
