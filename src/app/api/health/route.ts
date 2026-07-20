import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "talentera-acquisition-command-center",
    timestamp: new Date().toISOString(),
    hubspotConfigured: Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN),
  });
}
