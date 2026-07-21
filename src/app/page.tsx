import Link from "next/link";
import { AcquisitionDashboardV4 } from "@/components/AcquisitionDashboardV4";
import { AcquisitionRosterLabels } from "@/components/AcquisitionRosterLabels";

export default function HomePage() {
  return <>
    <AcquisitionRosterLabels/>
    <Link
      href="/workspace"
      style={{
        position: "fixed",
        left: 16,
        bottom: 112,
        zIndex: 80,
        width: 256,
        height: 44,
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: 12,
        background: "rgba(255,255,255,.1)",
        color: "#e8f7f2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        textDecoration: "none",
        boxShadow: "0 10px 24px rgba(0,0,0,.08)",
      }}
    >
      Open All-Time Lead Workspace →
    </Link>
    <AcquisitionDashboardV4/>
  </>;
}
