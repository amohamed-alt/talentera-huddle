import type { HubSpotOwner, HubSpotRecord } from "@/lib/types";

const API_BASE = "https://api.hubapi.com";
const MAX_RETRIES = 3;
const SEARCH_PAGE_SIZE = 200;
const SEARCH_INTERVAL_MS = 275;
const BATCH_READ_SIZE = 100;
const ASSOCIATION_BATCH_SIZE = 1000;

let searchQueue: Promise<void> = Promise.resolve();
let nextSearchAt = 0;

export interface SearchFilter {
  propertyName: string;
  operator: string;
  value?: string;
  highValue?: string;
  values?: string[];
}

export interface HubSpotObjectProperty {
  name: string;
  label: string;
  type: string;
  fieldType?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface AssociationTarget {
  id: string;
  labels: string[];
  typeIds: number[];
}

interface SearchResponse {
  results: HubSpotRecord[];
  paging?: { next?: { after?: string } };
}

interface BatchReadResponse {
  results: HubSpotRecord[];
}

interface BatchAssociationResponse {
  results: Array<{
    from: { id: string };
    to: Array<{
      toObjectId: string;
      associationTypes?: Array<{ typeId: number; label?: string | null }>;
    }>;
    paging?: { next?: { after?: string } };
  }>;
}

interface OwnersResponse {
  results: Array<{
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  }>;
  paging?: { next?: { after?: string } };
}

interface PipelinesResponse {
  results: Array<{
    id: string;
    label: string;
    stages: Array<{ id: string; label: string }>;
  }>;
}

interface PropertiesResponse {
  results: HubSpotObjectProperty[];
}

export class HubSpotApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: string,
  ) {
    super(message);
    this.name = "HubSpotApiError";
  }
}

function getToken() {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    throw new HubSpotApiError(
      "HUBSPOT_PRIVATE_APP_TOKEN is not configured",
      503,
      "Missing environment variable",
    );
  }
  return token;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function scheduleSearch<T>(action: () => Promise<T>): Promise<T> {
  const run = searchQueue.then(async () => {
    const delay = Math.max(0, nextSearchAt - Date.now());
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    nextSearchAt = Date.now() + SEARCH_INTERVAL_MS;
    return action();
  });

  searchQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

async function hubspotRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
      });

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return await response.json() as T;
      }

      const body = await response.text();
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw new HubSpotApiError(
        `HubSpot request failed: ${path}`,
        response.status,
        body.slice(0, 1000),
      );
    } catch (error) {
      lastError = error;
      if (error instanceof HubSpotApiError || attempt === MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown HubSpot API error");
}

export async function searchAll(
  objectType: string,
  properties: readonly string[],
  filters: SearchFilter[],
  sorts: string[] = [],
): Promise<HubSpotRecord[]> {
  const records: HubSpotRecord[] = [];
  let after: string | undefined;

  do {
    const response = await scheduleSearch(() => hubspotRequest<SearchResponse>(
      `/crm/v3/objects/${objectType}/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: filters.length ? [{ filters }] : [],
          properties,
          sorts,
          limit: SEARCH_PAGE_SIZE,
          ...(after ? { after } : {}),
        }),
      },
    ));

    records.push(...response.results);
    after = response.paging?.next?.after;
  } while (after);

  return records;
}

export async function batchReadObjects(
  objectType: string,
  ids: readonly string[],
  properties: readonly string[],
): Promise<HubSpotRecord[]> {
  const records: HubSpotRecord[] = [];
  for (const group of chunks([...new Set(ids.filter(Boolean))], BATCH_READ_SIZE)) {
    const response = await hubspotRequest<BatchReadResponse>(`/crm/v3/objects/${objectType}/batch/read`, {
      method: "POST",
      body: JSON.stringify({
        properties,
        inputs: group.map((id) => ({ id })),
      }),
    });
    records.push(...response.results);
  }
  return records;
}

export async function batchReadAssociations(
  fromObjectType: string,
  toObjectType: string,
  ids: readonly string[],
): Promise<Map<string, AssociationTarget[]>> {
  const output = new Map<string, AssociationTarget[]>();
  const uniqueIds = [...new Set(ids.filter(Boolean))];

  for (const group of chunks(uniqueIds, ASSOCIATION_BATCH_SIZE)) {
    let inputs = group.map((id) => ({ id }));
    while (inputs.length) {
      const response = await hubspotRequest<BatchAssociationResponse>(
        `/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/read`,
        {
          method: "POST",
          body: JSON.stringify({ inputs }),
        },
      );

      const nextInputs: Array<{ id: string; after: string }> = [];
      for (const result of response.results) {
        const current = output.get(result.from.id) ?? [];
        const seen = new Set(current.map((item) => item.id));
        for (const target of result.to ?? []) {
          if (seen.has(String(target.toObjectId))) continue;
          current.push({
            id: String(target.toObjectId),
            labels: (target.associationTypes ?? []).map((item) => item.label ?? "").filter(Boolean),
            typeIds: (target.associationTypes ?? []).map((item) => item.typeId),
          });
          seen.add(String(target.toObjectId));
        }
        output.set(result.from.id, current);
        const after = result.paging?.next?.after;
        if (after) nextInputs.push({ id: result.from.id, after });
      }
      inputs = nextInputs;
    }
  }

  for (const id of uniqueIds) if (!output.has(id)) output.set(id, []);
  return output;
}

export async function listOwners(): Promise<HubSpotOwner[]> {
  const owners: HubSpotOwner[] = [];
  let after: string | undefined;

  do {
    const query = new URLSearchParams({ limit: "500", archived: "false" });
    if (after) query.set("after", after);
    const response = await hubspotRequest<OwnersResponse>(`/crm/v3/owners/?${query}`);
    owners.push(...response.results.map((owner) => ({
      id: String(owner.id),
      name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email || String(owner.id),
      email: owner.email,
    })));
    after = response.paging?.next?.after;
  } while (after);

  return owners;
}

export async function listDealStages(): Promise<Map<string, string>> {
  const response = await hubspotRequest<PipelinesResponse>("/crm/v3/pipelines/deals");
  const stages = new Map<string, string>();
  for (const pipeline of response.results) {
    for (const stage of pipeline.stages) stages.set(stage.id, stage.label);
  }
  return stages;
}

export async function listObjectProperties(objectType: string): Promise<HubSpotObjectProperty[]> {
  const response = await hubspotRequest<PropertiesResponse>(`/crm/v3/properties/${objectType}`);
  return response.results;
}
