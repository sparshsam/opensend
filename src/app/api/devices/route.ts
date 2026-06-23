import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: devices, error } = await admin
      .from("opensend_devices")
      .select("*")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to list devices." }, { status: 500 });
    }

    return NextResponse.json(devices ?? []);
  } catch (error) {
    console.error("List devices error:", error);
    return NextResponse.json({ error: "Failed to list devices." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const { name, platform, browser, os, device_type, fingerprint } = body;

    if (!name || !platform || !fingerprint) {
      return NextResponse.json({ error: "Name, platform, and fingerprint are required." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Upsert: update if same fingerprint exists, insert otherwise
    const { data: existing } = await admin
      .from("opensend_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("fingerprint", fingerprint)
      .single();

    if (existing) {
      // Update existing device
      const { data, error } = await admin
        .from("opensend_devices")
        .update({
          name,
          platform,
          browser: browser ?? null,
          os: os ?? null,
          device_type: device_type ?? "desktop",
          last_seen_at: new Date().toISOString(),
          is_current: true,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: "Failed to update device." }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    // New device: set as current, mark other devices as not current
    await admin.from("opensend_devices")
      .update({ is_current: false })
      .eq("user_id", user.id);

    const { data, error } = await admin
      .from("opensend_devices")
      .insert({
        user_id: user.id,
        name,
        platform,
        browser: browser ?? null,
        os: os ?? null,
        device_type: device_type ?? "desktop",
        fingerprint,
        is_current: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to register device." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Device registration error:", error);
    return NextResponse.json({ error: "Failed to register device." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const { device_id, name } = body;

    if (!device_id) {
      return NextResponse.json({ error: "Device ID is required." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Ownership check
    const { data: existing, error: checkError } = await admin
      .from("opensend_devices")
      .select("id")
      .eq("id", device_id)
      .eq("user_id", user.id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: "Device not found or access denied." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;

    const { data, error } = await admin
      .from("opensend_devices")
      .update(updates)
      .eq("id", device_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update device." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Device update error:", error);
    return NextResponse.json({ error: "Failed to update device." }, { status: 500 });
  }
}
