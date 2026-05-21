import { useState } from "react";
import { UploadZone } from "../components/UploadZone";
import { TransfersTable } from "../components/TransfersTable";
import { StatsBar } from "../components/StatsBar";
import { QuotaBar } from "../components/QuotaBar";

export function ActiveTransfers() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Stats */}
      <StatsBar />

      {/* Quota */}
      <QuotaBar refreshKey={refreshKey} />

      {/* Upload Zone */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 style={{ fontSize: "13px", color: "#3d4f6e", fontWeight: 700, letterSpacing: "0.1em" }}>
            UPLOAD FILES
          </h2>
          <div className="flex-1" style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
        </div>
        <UploadZone onUploaded={() => setRefreshKey(k => k + 1)} />
      </section>

      {/* Transfers Table */}
      <section className="pb-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 style={{ fontSize: "13px", color: "#3d4f6e", fontWeight: 700, letterSpacing: "0.1em" }}>
            RECENT ACTIVITY
          </h2>
          <div className="flex-1" style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
        </div>
        <TransfersTable refreshKey={refreshKey} />
      </section>
    </div>
  );
}
