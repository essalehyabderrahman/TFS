import { useEffect, useRef } from "react";
import { Lock, LockOpen, ShieldCheck, ShieldOff, X, CloudUpload } from "lucide-react";

interface EncryptionChoiceModalProps {
  /** File(s) being uploaded – used only to display names */
  files: File | File[] | FileList | null;
  onChoose: (encrypt: boolean) => void;
  onCancel: () => void;
}

export function EncryptionChoiceModal({ files, onChoose, onCancel }: EncryptionChoiceModalProps) {
  const encryptBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the "Encrypt" button on open for keyboard accessibility
  useEffect(() => {
    encryptBtnRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Resolve file names to display
  const fileArray: File[] = files
    ? files instanceof FileList
      ? Array.from(files)
      : Array.isArray(files)
      ? files
      : [files]
    : [];

  const primaryName = fileArray[0]?.name ?? "file";
  const extra = fileArray.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(5,8,20,0.82)", backdropFilter: "blur(8px)" }}
        onClick={onCancel}
      >
        {/* Modal */}
        <div
          className="relative w-[92vw] max-w-[460px] rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #0d1321 0%, #080c1a 100%)",
            border: "1px solid var(--border)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04) inset",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 pt-5 pb-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,210,255,0.12)", border: "1px solid rgba(0,210,255,0.2)" }}
              >
                <CloudUpload size={17} style={{ color: "#00d2ff" }} strokeWidth={1.8} />
              </div>
              <div>
                <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--foreground)" }}>
                  Upload Options
                </p>
                <p
                  className="truncate max-w-[240px]"
                  style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "1px" }}
                >
                  {primaryName}
                  {extra > 0 && (
                    <span style={{ color: "var(--muted-foreground)" }}> +{extra} more file{extra !== 1 ? "s" : ""}</span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-accent"
            >
              <X size={15} style={{ color: "var(--muted-foreground)" }} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 flex flex-col gap-3">
            <p style={{ fontSize: "13px", color: "var(--muted-foreground)", marginBottom: "4px" }}>
              How would you like to store this file?
            </p>

            {/* Encrypted option */}
            <button
              ref={encryptBtnRef}
              onClick={() => onChoose(true)}
              className="group w-full flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all duration-200"
              style={{
                background: "rgba(0,229,160,0.06)",
                border: "1px solid rgba(0,229,160,0.22)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(0,229,160,0.11)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,229,160,0.4)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(0,229,160,0.06)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,229,160,0.22)";
              }}
            >
              {/* Icon */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,229,160,0.14)", border: "1px solid rgba(0,229,160,0.3)" }}
              >
                <Lock size={20} style={{ color: "#00E5A0" }} strokeWidth={2} />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p
                  className="font-bold"
                  style={{ fontSize: "14px", color: "#00E5A0" }}
                >
                  Upload Encrypted
                </p>
                <p style={{ fontSize: "11.5px", color: "var(--muted-foreground)", marginTop: "2px" }}>
                  AES-256-GCM encryption at rest · Zero-knowledge · Recommended
                </p>
              </div>

              {/* Badges */}
              <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                {[
                  { icon: <ShieldCheck size={10} />, label: "AES-256" },
                  { icon: <ShieldCheck size={10} />, label: "SOC 2" },
                ].map((b) => (
                  <div key={b.label} className="flex items-center gap-1">
                    <span style={{ color: "#00E5A0" }}>{b.icon}</span>
                    <span style={{ fontSize: "10px", color: "#3d6b5a", fontWeight: 600 }}>{b.label}</span>
                  </div>
                ))}
              </div>
            </button>

            {/* Unencrypted option */}
            <button
              onClick={() => onChoose(false)}
              className="group w-full flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all duration-200"
              style={{
                background: "rgba(251,191,36,0.05)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.1)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(251,191,36,0.4)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.05)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(251,191,36,0.2)";
              }}
            >
              {/* Icon */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)" }}
              >
                <LockOpen size={20} style={{ color: "#FBBF24" }} strokeWidth={2} />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p
                  className="font-bold"
                  style={{ fontSize: "14px", color: "#FBBF24" }}
                >
                  Upload Without Encryption
                </p>
                <p style={{ fontSize: "11.5px", color: "var(--muted-foreground)", marginTop: "2px" }}>
                  File stored as-is · Not recommended for sensitive data
                </p>
              </div>

              {/* Warning badge */}
              <div className="hidden sm:flex flex-col items-end shrink-0">
                <div className="flex items-center gap-1">
                  <ShieldOff size={10} style={{ color: "#FBBF24" }} />
                  <span style={{ fontSize: "10px", color: "#7a6230", fontWeight: 600 }}>No Encryption</span>
                </div>
              </div>
            </button>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end px-5 py-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-[13px] transition-colors hover:bg-accent"
              style={{ color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
