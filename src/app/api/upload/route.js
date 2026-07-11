import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { parseM3uText } from "@/lib/m3uParser";

const SYNC_CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // No 0, O, 1, I to avoid remote control typing mistakes

function generateSyncCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += SYNC_CODE_CHARS.charAt(Math.floor(Math.random() * SYNC_CODE_CHARS.length));
  }
  return code;
}

export async function POST(request) {
  // 1. Authenticate user session
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized. Please login first." },
      { status: 401 }
    );
  }

  const userId = session.user.id || session.user.email.replace(/[^a-zA-Z0-9]/g, "_");
  const userEmail = session.user.email;

  try {
    let m3uText = "";
    const contentType = request.headers.get("content-type") || "";

    let playlistName = "";

    // 2. Extract M3U content (Supports either file upload or remote URL fetch)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      playlistName = formData.get("name") || "";
      
      if (!file) {
        return NextResponse.json(
          { status: "error", message: "No file was uploaded" },
          { status: 400 }
        );
      }
      m3uText = await file.text();
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      const { url, name } = body;
      playlistName = name || "";
      
      if (!url) {
        return NextResponse.json(
          { status: "error", message: "Missing playlist URL" },
          { status: 400 }
        );
      }

      // Fetch the remote M3U file
      console.log(`[Upload API] Fetching M3U playlist from: ${url}`);
      const res = await fetch(url);
      if (!res.ok) {
        return NextResponse.json(
          { status: "error", message: `Failed to fetch remote playlist. HTTP status: ${res.status}` },
          { status: 400 }
        );
      }
      m3uText = await res.text();
    } else {
      return NextResponse.json(
        { status: "error", message: "Unsupported Content-Type" },
        { status: 400 }
      );
    }

    if (!playlistName || !playlistName.trim()) {
      return NextResponse.json(
        { status: "error", message: "O nome da lista é obrigatório." },
        { status: 400 }
      );
    }

    if (!m3uText || !m3uText.trim().startsWith("#EXTM3U")) {
      return NextResponse.json(
        { status: "error", message: "Invalid M3U file format. Must start with #EXTM3U" },
        { status: 400 }
      );
    }

    // 3. Parse list on high-performance serverless environment
    console.log(`[Upload API] Starting parsing of list. Size: ${m3uText.length} chars.`);
    const parsed = parseM3uText(m3uText);
    console.log(`[Upload API] Parsing complete. Counts:`, parsed.counts);

    // 4. Upload movies.txt, live.json, series.json to Supabase Storage
    const storage = supabase.storage.from("iptv-files");

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

    // Create lightweight series list (exclude seasons/episodes to save memory/storage on TV)
    const seriesListObj = {};
    for (const key in parsed.seriesObj) {
      seriesListObj[key] = {
        name: parsed.seriesObj[key].name,
        logo: parsed.seriesObj[key].logo,
        category: parsed.seriesObj[key].category
      };
    }

    // Upload series.json (lightweight list of series)
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

    // Get Public URLs
    const moviesUrl = storage.getPublicUrl(`${userId}/movies.txt`).data.publicUrl;
    const liveUrl = storage.getPublicUrl(`${userId}/live.json`).data.publicUrl;
    const seriesUrl = storage.getPublicUrl(`${userId}/series.json`).data.publicUrl;

    // 5. Generate a unique 4-character sync code
    let syncCode = "";
    let codeIsUnique = false;
    let attempts = 0;

    while (!codeIsUnique && attempts < 15) {
      attempts++;
      const candidateCode = generateSyncCode();
      
      const { data } = await supabase
        .from("sync_codes")
        .select("code")
        .eq("code", candidateCode)
        .maybeSingle();

      if (!data) {
        syncCode = candidateCode;
        codeIsUnique = true;
      }
    }

    if (!syncCode) {
      throw new Error("Failed to generate a unique synchronization code after multiple attempts.");
    }

    // 6. Write code registration to Supabase database sync_codes table
    const { error: dbErr } = await supabase
      .from("sync_codes")
      .upsert({
        code: syncCode,
        user_email: userEmail,
        name: playlistName.trim(),
        movies_url: moviesUrl,
        live_url: liveUrl,
        series_url: seriesUrl,
        movies_count: parsed.counts.movies || 0,
        series_count: parsed.counts.series || 0,
        live_count: parsed.counts.live || 0,
        episodes_count: parsed.counts.episodes || 0,
        created_at: new Date().toISOString()
      });

    if (dbErr) {
      throw new Error(`Database upsert error: ${dbErr.message}`);
    }

    // 7. Return success and code
    return NextResponse.json({
      status: "success",
      code: syncCode,
      counts: parsed.counts
    });

  } catch (err) {
    console.error("[Upload API] Server Error:", err);
    return NextResponse.json(
      { status: "error", message: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
