import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";

export async function DELETE(request) {
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
      { status: "error", message: "Missing code parameter" },
      { status: 400 }
    );
  }

  const userEmail = session.user.email;
  const userId = session.user.id || userEmail.replace(/[^a-zA-Z0-9]/g, "_");

  try {
    // 1. Verify ownership of the sync code before deleting
    const { data: codeData, error: findError } = await supabase
      .from("sync_codes")
      .select("code")
      .eq("code", code)
      .eq("user_email", userEmail)
      .maybeSingle();

    if (findError || !codeData) {
      return NextResponse.json(
        { status: "error", message: "List not found or you don't own it" },
        { status: 404 }
      );
    }

    // 2. Delete database record
    const { error: dbError } = await supabase
      .from("sync_codes")
      .delete()
      .eq("code", code);

    if (dbError) throw dbError;

    // 3. Delete files from Supabase Storage bucket (optional, ignore errors if already deleted)
    const storage = supabase.storage.from("iptv-files");
    await storage.remove([
      `${userId}/movies.txt`,
      `${userId}/live.json`,
      `${userId}/series.json`
    ]);

    return NextResponse.json({ status: "success", message: "List deleted successfully" });
  } catch (err) {
    console.error("[Delete List API] Error:", err);
    return NextResponse.json(
      { status: "error", message: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
