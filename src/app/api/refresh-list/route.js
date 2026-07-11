import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { parseM3uText } from "@/lib/m3uParser";

function normalizeLogoUrl(url) {
  if (!url) return "";
  return url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { status: "error", message: "Missing list code parameter" },
      { status: 400 }
    );
  }

  const normalizedCode = code.trim().toUpperCase();
  const userEmail = session.user.email;
  const userId = session.user.id || session.user.email.replace(/[^a-zA-Z0-9]/g, "_");

  try {
    // 1. Fetch current sync code data from DB
    const { data: listData, error: fetchErr } = await supabase
      .from("sync_codes")
      .select("*")
      .eq("code", normalizedCode)
      .eq("user_email", userEmail)
      .single();

    if (fetchErr || !listData) {
      return NextResponse.json(
        { status: "error", message: "List not found or not owned by you." },
        { status: 404 }
      );
    }

    if (!listData.m3u_url) {
      return NextResponse.json(
        { status: "error", message: "Não é possível atualizar listas enviadas por arquivo local." },
        { status: 400 }
      );
    }

    // 2. Fetch the remote M3U URL content
    console.log(`[Refresh API] Re-fetching M3U playlist from: ${listData.m3u_url}`);
    const res = await fetch(listData.m3u_url);
    if (!res.ok) {
      return NextResponse.json(
        { status: "error", message: `Erro ao baixar a lista M3U. Status HTTP: ${res.status}` },
        { status: 400 }
      );
    }
    const m3uText = await res.text();

    // 3. Parse M3U
    const parsed = parseM3uText(m3uText);

    // 4. Initialize storage client
    const storage = supabase.storage.from("playlists");

    // Upload movies.txt
    const { error: moviesErr } = await storage.upload(
      `${userId}/movies.txt`,
      Buffer.from(parsed.moviesText, "utf-8"),
      { contentType: "text/plain; charset=utf-8", upsert: true }
    );
    if (moviesErr) throw new Error(`Failed to upload movies.txt: ${moviesErr.message}`);

    // Upload live.json
    const { error: liveErr } = await storage.upload(
      `${userId}/live.json`,
      Buffer.from(JSON.stringify(parsed.liveObj, null, 2), "utf-8"),
      { contentType: "application/json; charset=utf-8", upsert: true }
    );
    if (liveErr) throw new Error(`Failed to upload live.json: ${liveErr.message}`);

    // Create lightweight series list
    const seriesListObj = {};
    for (const key in parsed.seriesObj) {
      seriesListObj[key] = {
        name: parsed.seriesObj[key].name,
        logo: parsed.seriesObj[key].logo,
        category: parsed.seriesObj[key].category
      };
    }

    // Upload series.json (lightweight index list)
    const { error: seriesErr } = await storage.upload(
      `${userId}/series.json`,
      Buffer.from(JSON.stringify(seriesListObj, null, 2), "utf-8"),
      { contentType: "application/json; charset=utf-8", upsert: true }
    );
    if (seriesErr) throw new Error(`Failed to upload series.json: ${seriesErr.message}`);

    // Upload series_details.json (full detailed series seasons & episodes data for on-demand fetch)
    const { error: seriesDetailsErr } = await storage.upload(
      `${userId}/series_details.json`,
      Buffer.from(JSON.stringify(parsed.seriesObj, null, 2), "utf-8"),
      { contentType: "application/json; charset=utf-8", upsert: true }
    );
    if (seriesDetailsErr) throw new Error(`Failed to upload series_details.json: ${seriesDetailsErr.message}`);

    // Generate metadata.json containing category stats and counts
    const movieCategoryMap = {};
    const movieLines = parsed.moviesText.split("\n");
    for (let i = 0; i < movieLines.length; i++) {
      const line = movieLines[i].trim();
      if (line.startsWith("#EXTINF:")) {
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        const category = groupMatch ? groupMatch[1].trim() : "Filmes";
        movieCategoryMap[category] = (movieCategoryMap[category] || 0) + 1;
      }
    }
    const movieCategories = Object.keys(movieCategoryMap).map(name => ({
      name,
      count: movieCategoryMap[name]
    })).sort((a, b) => b.count - a.count);

    const seriesCategoryMap = {};
    for (const key in parsed.seriesObj) {
      const series = parsed.seriesObj[key];
      const category = series.category || "Séries";
      seriesCategoryMap[category] = (seriesCategoryMap[category] || 0) + 1;
    }
    const seriesCategories = Object.keys(seriesCategoryMap).map(name => ({
      name,
      count: seriesCategoryMap[name]
    })).sort((a, b) => b.count - a.count);

    const liveCategories = Object.keys(parsed.liveObj).map(name => ({
      name,
      count: parsed.liveObj[name].length
    })).sort((a, b) => b.count - a.count);

    const metadataObj = {
      live: liveCategories,
      movies: movieCategories,
      series: seriesCategories,
      counts: parsed.counts
    };

    // Upload metadata.json
    const { error: metadataErr } = await storage.upload(
      `${userId}/metadata.json`,
      Buffer.from(JSON.stringify(metadataObj, null, 2), "utf-8"),
      { contentType: "application/json; charset=utf-8", upsert: true }
    );
    if (metadataErr) throw new Error(`Failed to upload metadata.json: ${metadataErr.message}`);

    // 5. Update counts and updated_at in Supabase DB sync_codes table
    const { error: updateErr } = await supabase
      .from("sync_codes")
      .update({
        movies_count: parsed.counts.movies || 0,
        series_count: parsed.counts.series || 0,
        live_count: parsed.counts.live || 0,
        episodes_count: parsed.counts.episodes || 0,
        updated_at: new Date().toISOString()
      })
      .eq("code", normalizedCode);

    if (updateErr) throw new Error(`Failed to update DB counts: ${updateErr.message}`);

    return NextResponse.json({
      status: "success",
      message: "Lista atualizada com sucesso no servidor!",
      counts: parsed.counts
    });

  } catch (err) {
    console.error("[Refresh API] Server Error:", err);
    return NextResponse.json(
      { status: "error", message: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
