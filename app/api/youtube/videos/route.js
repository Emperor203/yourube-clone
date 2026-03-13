import { NextResponse } from "next/server";

const BASE_URL = "https://www.googleapis.com/youtube/v3";

function sanitizeSearchQuery(value) {
  return String(value || "").trim().slice(0, 120);
}

function sanitizeCategoryId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return /^\d{1,3}$/.test(normalized) ? normalized : "";
}

function buildVideoItem(item) {
  const thumb =
    item.snippet?.thumbnails?.high?.url ||
    item.snippet?.thumbnails?.medium?.url ||
    item.snippet?.thumbnails?.default?.url ||
    "";

  return {
    id: item.id,
    title: item.snippet?.title || "Untitled",
    channelTitle: item.snippet?.channelTitle || "Unknown channel",
    description: item.snippet?.description || "",
    publishedAt: item.snippet?.publishedAt || "",
    thumbnail: thumb,
    viewCount: item.statistics?.viewCount || "0",
  };
}

export async function GET(request) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "YOUTUBE_API_KEY is missing. Add it to .env.local." },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);
    const regionCode = searchParams.get("regionCode") || "US";
    const maxResults = Number(searchParams.get("maxResults") || "24");
    const q = sanitizeSearchQuery(searchParams.get("q"));
    const categoryId = sanitizeCategoryId(searchParams.get("categoryId"));
    const safeMax = Math.min(Math.max(maxResults, 1), 50);

    let videoIds = [];

    if (q) {
      const searchParamsUrl = new URLSearchParams({
        key: apiKey,
        part: "snippet",
        q,
        type: "video",
        maxResults: String(safeMax),
        regionCode,
      });

      if (categoryId) {
        searchParamsUrl.set("videoCategoryId", categoryId);
      }

      const searchRes = await fetch(`${BASE_URL}/search?${searchParamsUrl.toString()}`, {
        cache: "no-store",
      });
      const searchData = await searchRes.json();

      if (!searchRes.ok) {
        return NextResponse.json(
          { error: searchData?.error?.message || "YouTube Search API request failed" },
          { status: searchRes.status },
        );
      }

      videoIds = (searchData.items || []).map((item) => item?.id?.videoId).filter(Boolean);
    } else {
      const popularParams = new URLSearchParams({
        key: apiKey,
        part: "id",
        chart: "mostPopular",
        regionCode,
        maxResults: String(safeMax),
      });

      if (categoryId) {
        popularParams.set("videoCategoryId", categoryId);
      }

      const popularRes = await fetch(`${BASE_URL}/videos?${popularParams.toString()}`, {
        cache: "no-store",
      });
      const popularData = await popularRes.json();

      if (!popularRes.ok) {
        return NextResponse.json(
          { error: popularData?.error?.message || "Popular videos request failed" },
          { status: popularRes.status },
        );
      }

      videoIds = (popularData.items || []).map((item) => item.id).filter(Boolean);
    }

    if (videoIds.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    const detailsParams = new URLSearchParams({
      key: apiKey,
      part: "snippet,statistics",
      id: videoIds.join(","),
      maxResults: String(safeMax),
    });

    const detailsRes = await fetch(`${BASE_URL}/videos?${detailsParams.toString()}`, {
      cache: "no-store",
    });
    const detailsData = await detailsRes.json();

    if (!detailsRes.ok) {
      return NextResponse.json(
        { error: detailsData?.error?.message || "Video details request failed" },
        { status: detailsRes.status },
      );
    }

    const items = (detailsData.items || []).map(buildVideoItem);

    return NextResponse.json({ items }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error while requesting YouTube API" },
      { status: 500 },
    );
  }
}