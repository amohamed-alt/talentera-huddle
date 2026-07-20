import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "talentera-acquisition-command-center",
    uiVersion: "sdr-style-v2",
    buildRef: process.env.ACQUISITION_BUILD_REF ?? "local",
    timestamp: new Date().toISOString(),
    hubspotConfigured: Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN),
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
