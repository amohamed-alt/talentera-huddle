import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryLeadWorkspace } from "@/lib/lead-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const stateValues = [
  "all", "online-untouched", "online-contacted", "offline-untouched", "offline-contacted",
  "unqualified", "converted", "excluded", "unknown",
] as const;

const querySchema = z.object({
  year: z.coerce.number().int().min(0).max(2100).default(0),
  ownerId: z.string().default("all"),
  source: z.enum(["all", "online", "offline", "unknown"]).default("all"),
  state: z.enum(stateValues).default("all"),
  rank: z.string().default("all"),
  search: z.string().max(200).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
  since: z.string().max(100).default(""),
  refresh: z.enum(["none", "delta", "full"]).default("none"),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead workspace filters", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const payload = await queryLeadWorkspace(parsed.data);
    const etag = `W/\"workspace-${payload.meta.year}-${payload.meta.version}-${payload.meta.page}-${payload.meta.pageSize}\"`;
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        ETag: etag,
        "X-Workspace-Version": String(payload.meta.version),
        "X-Workspace-Sync-Mode": payload.meta.syncMode,
      },
    });
  } catch (error) {
    console.error("Lead workspace load failed", error);
    return NextResponse.json({
      error: "Unable to load the YTD lead workspace",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
