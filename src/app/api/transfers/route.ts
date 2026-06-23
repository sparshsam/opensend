import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const offset = Number(searchParams.get("offset")) || 0;

    const admin = createAdminClient();
    let query = admin
      .from("opensend_transfers")
      .select("*")
      .eq("user_id", user.id);

    if (status === "active") {
      query = query.in("status", ["uploading", "scanning", "available"]);
    } else if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("List transfers error:", error);
      return NextResponse.json(
        { error: "Failed to list transfers." },
        { status: 500 },
      );
    }

    return NextResponse.json(data ?? []);

  } catch (error) {
    console.error("List transfers error:", error);
    return NextResponse.json(
      { error: "Failed to list transfers." },
      { status: 500 },
    );
  }
}
