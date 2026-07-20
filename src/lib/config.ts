export const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID ?? "145742477";
export const HUBSPOT_UI_DOMAIN = process.env.HUBSPOT_UI_DOMAIN ?? "app-eu1.hubspot.com";
export const HUBSPOT_TIMEZONE = process.env.HUBSPOT_TIMEZONE ?? "Asia/Riyadh";

export const CONNECTED_CALL_DISPOSITION = "f240bbac-87c9-4f6e-bf70-924b57d47db7";

const OBJECT_IDS = {
  contact: "0-1",
  company: "0-2",
  deal: "0-3",
  task: "0-27",
  meeting: "0-47",
  call: "0-48",
} as const;

export type HubSpotObjectType = keyof typeof OBJECT_IDS;

export function hubspotRecordUrl(objectType: "contact" | "company" | "deal", id: string) {
  return `https://${HUBSPOT_UI_DOMAIN}/contacts/${HUBSPOT_PORTAL_ID}/record/${OBJECT_IDS[objectType]}/${id}?utm_source=acquisition_dashboard&utm_medium=dashboard`;
}

export function hubspotListUrl(objectType: HubSpotObjectType) {
  return `https://${HUBSPOT_UI_DOMAIN}/contacts/${HUBSPOT_PORTAL_ID}/objects/${OBJECT_IDS[objectType]}/views/all/list?utm_source=acquisition_dashboard&utm_medium=dashboard`;
}
