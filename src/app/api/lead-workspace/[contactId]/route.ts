import { NextRequest, NextResponse } from "next/server";
import { getLeadWorkspaceDetail } from "@/lib/lead-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ contactId: string }> },
) {
  const { contactId } = await context.params;
  if (!/^\d+$/.test(contactId)) {
    return NextResponse.json({ error: "Invalid HubSpot contact ID" }, { status: 400 });
  }

  try {
    const payload = await getLeadWorkspaceDetail(contactId);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    console.error(`Lead workspace detail failed for ${contactId}`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      error: message.includes("not found") ? "Lead not found" : "Unable to load live lead details",
      details: message,
    }, { status: message.includes("not found") ? 404 : 500 });
  }
}
