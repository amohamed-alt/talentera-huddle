import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDetailedAcquisitionDashboard } from "@/lib/dashboard-v3";

export const runtime = "nodejs";
export const maxDuration = 60;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  from: z.string().regex(datePattern),
  to: z.string().regex(datePattern),
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const current = new Date();
  return `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    from: request.nextUrl.searchParams.get("from") ?? monthStart(),
    to: request.nextUrl.searchParams.get("to") ?? today(),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dashboard dates" }, { status: 400 });
  }
  if (parsed.data.from > parsed.data.to) {
    return NextResponse.json({ error: "The start date must be before the end date" }, { status: 400 });
  }

  try {
    const data = await buildDetailedAcquisitionDashboard(
      parsed.data.from,
      parsed.data.to,
      request.nextUrl.searchParams.get("refresh") === "1",
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    console.error("Acquisition dashboard load failed", error);
    return NextResponse.json({
      error: "Unable to load the live HubSpot dashboard",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
