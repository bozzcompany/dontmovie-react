import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { status: "error", message: "Missing sync code parameter" },
      { status: 400 }
    );
  }

  // Normalize code to uppercase to avoid case-sensitivity typing errors
  const normalizedCode = code.trim().toUpperCase();

  try {
    const { data, error } = await supabase
      .from("sync_codes")
      .select("movies_url, live_url, series_url")
      .eq("code", normalizedCode)
      .single();

    if (error || !data) {
      console.warn(`[Sync] Code not found or database error: ${normalizedCode}`, error);
      return NextResponse.json(
        { status: "error", message: "Invalid sync code or expired" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: "success",
      movies_url: data.movies_url,
      live_url: data.live_url,
      series_url: data.series_url
    });
  } catch (err) {
    console.error("[Sync] Internal error during syncing:", err);
    return NextResponse.json(
      { status: "error", message: "Internal server error" },
      { status: 500 }
    );
  }
}
