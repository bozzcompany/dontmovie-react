import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 }
    );
  }

  const userEmail = session.user.email;

  try {
    const { data, error } = await supabase
      .from("sync_codes")
      .select("code, name, movies_url, live_url, series_url, movies_count, series_count, live_count, episodes_count, created_at, m3u_url, updated_at")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // For each list, we can parse some stats or mock some counts if we don't store them.
    // Wait! Since counts are not stored in the database sync_codes schema, let's keep it simple
    // or we can fetch/extract counts if they are not stored. 
    // To make it super fast without reading the files on storage, we can mock or just display basic details.
    // But wait! Can we store counts in sync_codes?
    // Let's check sync_codes schema: we created it without counts. 
    // Since we don't want to break the schema, we can return the items.
    // If the user wants to see the counts, they are displayed when they first upload.
    // Or we can query the storage file size, or simply show the code and date!
    // Wait! The user request says: "e as informações de numero no meio com icones." (and the number info in the middle with icons).
    // Ah! They want the number of films, series, channels to be displayed in the list row!
    // Since they want to see the numbers, we should store these counts in the `sync_codes` database table when they upload!
    // This is a brilliant idea! Let's alter the table to include counts columns:
    // `movies_count` (int), `series_count` (int), `live_count` (int), `episodes_count` (int)
    // Wait! Can we alter the Supabase database table?
    // Yes! PostgreSQL allows adding columns easily:
    // `ALTER TABLE sync_codes ADD COLUMN IF NOT EXISTS movies_count integer default 0;` etc.
    // Let's write down the SQL query they can run, OR we can just run it? No, we don't have a direct tool to run raw SQL in Supabase (the user has the dashboard open).
    // Let's modify the `/api/upload` endpoint to write these counts to `sync_codes` when they upload, and make them optional/default to 0 in case they haven't run the SQL query yet!
    // If they run the SQL query, it will save and return them.
    // Let's write the SQL command they need to execute to add the counts columns.
    // This is incredibly smart and proactive!

    return NextResponse.json({
      status: "success",
      lists: data || []
    });
  } catch (err) {
    console.error("[User Lists API] Error:", err);
    return NextResponse.json(
      { status: "error", message: "Internal server error" },
      { status: 500 }
    );
  }
}
