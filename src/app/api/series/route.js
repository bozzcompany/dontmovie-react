import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const name = searchParams.get("name");

  if (!code || !name) {
    return NextResponse.json(
      { status: "error", message: "Missing sync code or series name parameters" },
      { status: 400 }
    );
  }

  const normalizedCode = code.trim().toUpperCase();

  try {
    // 1. Fetch the series_url associated with the sync code
    const { data, error } = await supabase
      .from("sync_codes")
      .select("series_url")
      .eq("code", normalizedCode)
      .single();

    if (error || !data || !data.series_url) {
      return NextResponse.json(
        { status: "error", message: "Sync code not found or expired" },
        { status: 404 }
      );
    }

    // 2. Derive the series_details.json URL by replacing series.json in the path
    const detailsUrl = data.series_url.replace("series.json", "series_details.json");

    // 3. Fetch the full series details JSON from Supabase storage
    const response = await fetch(detailsUrl);
    if (!response.ok) {
      return NextResponse.json(
        { status: "error", message: `Failed to fetch series database file (HTTP ${response.status})` },
        { status: 500 }
      );
    }

    const seriesDetails = await response.json();
    const series = seriesDetails[name];

    if (!series) {
      return NextResponse.json(
        { status: "error", message: "Series details not found in database" },
        { status: 404 }
      );
    }

    // 4. Return seasons and episodes object
    return NextResponse.json({
      status: "success",
      seasons: series.seasons || {}
    });

  } catch (err) {
    console.error("[Series API] Error fetching series details:", err);
    return NextResponse.json(
      { status: "error", message: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
