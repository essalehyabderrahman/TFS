import { useState, useCallback, useRef, useEffect } from "react";
import { CloudUpload, ShieldCheck, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadTransfer } from "@/app/api/transfers";
import { fetchContacts, type Contact } from "@/app/api/contacts";
import { useLocation } from "react-router";
import { EncryptionChoiceModal } from "./EncryptionChoiceModal";

interface UploadZoneProps {
  onUploaded?: () => void;
}

export function UploadZone({ onUploaded }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [expiryDays, setExpiryDays] = useState(7);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [emailError, setEmailError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Contacts autocomplete
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const location = useLocation();

  // Pre-fill recipient from ?recipient= query param (set by Contacts quick-transfer)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pre = params.get("recipient");
    if (pre) setRecipientEmail(decodeURIComponent(pre));
  }, [location.search]);

  // Load contacts once for suggestion dropdown
  useEffect(() => {
    fetchContacts().then(res => {
      if (res.data) setContacts(res.data.all);
    });
  }, []);

  const filteredContacts = recipientEmail.length >= 1
    ? contacts.filter(c =>
        c.email.toLowerCase().includes(recipientEmail.toLowerCase()) ||
        c.displayName.toLowerCase().includes(recipientEmail.toLowerCase())
      ).slice(0, 5)
    : [];

  const validateEmail = (email: string) =>
    email.trim() !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const queueFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      if (!validateEmail(recipientEmail)) {
        setEmailError(true);
        emailInputRef.current?.focus();
        toast.error("Please enter a valid recipient email address.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setEmailError(false);
      setPendingFiles(files);
    },
    [recipientEmail],
  );

  const handleEncryptionChoice = useCallback(
    async (encryptChoice: boolean) => {
      const files = pendingFiles;
      setPendingFiles(null);
      if (!files || files.length === 0) return;

      setUploading(true);
      let successCount = 0;
      let failCount = 0;

      for (const file of Array.from(files)) {
        const result = await uploadTransfer(file, recipientEmail, expiryDays, encryptChoice);
        if (result.ok) {
          successCount++;
        } else {
          failCount++;
          const messages: Record<string, string> = {
            FILE_TYPE_NOT_ALLOWED: `"${file.name}": file type not allowed.`,
            USER_NOT_FOUND: "Your account could not be found. Please sign in again.",
            RECIPIENT_REQUIRED: "A recipient email address is required.",
            NETWORK_ERROR: "Network error. Please check your connection.",
          };
          toast.error(messages[result.error ?? ""] ?? `Failed to upload "${file.name}".`);
        }
      }

      setUploading(false);

      if (successCount > 0) {
        toast.success(
          successCount === 1
            ? "File uploaded successfully!"
            : `${successCount} files uploaded successfully!`,
        );
        onUploaded?.();
      }
      if (failCount > 0 && successCount === 0) {
        toast.error("All uploads failed. Please try again.");
      }

      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [pendingFiles, recipientEmail, expiryDays, onUploaded],
  );

  const handleCancelUpload = useCallback(() => {
    setPendingFiles(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      queueFiles(e.dataTransfer.files);
    },
    [queueFiles],
  );

  const handleClick = useCallback(() => {
    if (!uploading) {
      if (!validateEmail(recipientEmail)) {
        setEmailError(true);
        emailInputRef.current?.focus();
        toast.error("Please enter a recipient email address before selecting a file.");
        return;
      }
      fileInputRef.current?.click();
    }
  }, [uploading, recipientEmail]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      queueFiles(e.target.files);
    },
    [queueFiles],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <input
            ref={emailInputRef}
            type="email"
            placeholder="Recipient email (required)"
            value={recipientEmail}
            onChange={(e) => {
              setRecipientEmail(e.target.value);
              setShowSuggestions(true);
              if (emailError) setEmailError(false);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="w-full h-9 pl-3 pr-8 rounded-lg text-white placeholder:text-slate-600 outline-none text-sm transition-colors"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: emailError
                ? "1px solid rgba(248,113,113,0.7)"
                : "1px solid rgba(255,255,255,0.08)",
              boxShadow: emailError ? "0 0 0 3px rgba(248,113,113,0.12)" : "none",
            }}
          />
          {emailError && !recipientEmail && (
            <span className="absolute -bottom-5 left-0 text-[11px] font-medium" style={{ color: "#F87171" }}>
              Recipient email is required
            </span>
          )}
          {recipientEmail && (
            <button
              onClick={() => { setRecipientEmail(""); setShowSuggestions(false); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
            >
              <X size={14} style={{ color: "#94a3b8" }} />
            </button>
          )}
          {showSuggestions && filteredContacts.length > 0 && (
            <div
              className="absolute left-0 right-0 top-10 rounded-lg overflow-hidden z-30"
              style={{
                background: "#0d1228",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
              }}
            >
              {filteredContacts.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={() => {
                    setRecipientEmail(c.email);
                    setShowSuggestions(false);
                    if (emailError) setEmailError(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)" }}
                  >
                    {c.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 500 }} className="truncate">{c.displayName}</p>
                    <p style={{ color: "#6b7fa8", fontSize: "11px" }} className="truncate">{c.email}</p>
                  </div>
                  {c.isFavorite && <span style={{ color: "#f59e0b", fontSize: "11px", marginLeft: "auto" }}>★</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <select
          value={expiryDays}
          onChange={(e) => setExpiryDays(Number(e.target.value))}
          className="h-9 px-3 rounded-lg text-white outline-none text-sm"
          style={{
            background: "#121725",
            border: "1px solid rgba(255,255,255,0.1)",
            minWidth: "140px",
            color: "#e2e8f0",
          }}
        >
          <option value={1} style={{ background: "#0d1228" }}>Expires in 1 day</option>
          <option value={3} style={{ background: "#0d1228" }}>Expires in 3 days</option>
          <option value={7} style={{ background: "#0d1228" }}>Expires in 7 days</option>
          <option value={30} style={{ background: "#0d1228" }}>Expires in 30 days</option>
          <option value={0} style={{ background: "#0d1228" }}>Never expires</option>
        </select>
      </div>



      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="relative w-full rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group"
        style={{
          minHeight: "160px",
          border: dragging ? "1.5px dashed #00d2ff" : "1.5px dashed rgba(255,255,255,0.12)",
          background: dragging ? "rgba(0,210,255,0.07)" : uploading ? "rgba(0,210,255,0.03)" : "rgba(255,255,255,0.02)",
          boxShadow: dragging ? "0 0 30px rgba(0,210,255,0.12)" : "none",
          cursor: uploading ? "not-allowed" : "pointer",
        }}
        onClick={handleClick}
      >
        <input ref={fileInputRef} type="file" multiple onChange={handleFileInputChange} className="hidden" accept="*/*" />

        <div
          className="absolute inset-0 rounded-2xl opacity-20 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(0,210,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,210,255,0.08) 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative flex flex-col items-center gap-2 sm:gap-3 py-2 px-4">
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-105"
            style={{
              background: dragging ? "rgba(0,210,255,0.25)" : uploading ? "rgba(0,210,255,0.18)" : "rgba(0,210,255,0.12)",
              border: "1px solid rgba(0,210,255,0.25)",
            }}
          >
            {uploading
              ? <Loader2 size={24} className="animate-spin sm:w-[26px] sm:h-[26px]" style={{ color: "#3D9FFF" }} />
              : <CloudUpload size={24} className="sm:w-[26px] sm:h-[26px]" style={{ color: "#00d2ff" }} strokeWidth={1.5} />
            }
          </div>

          <div className="text-center">
            {uploading ? (
              <p className="text-sm sm:text-[15px]" style={{ color: "#cbd5e1", fontWeight: 600 }}>Uploading…</p>
            ) : (
              <p className="text-sm sm:text-[15px]" style={{ color: "#cbd5e1", fontWeight: 600 }}>
                <span className="hidden sm:inline">Drag &amp; drop files here, or </span>
                <span style={{ color: "#00d2ff" }} className="hover:underline cursor-pointer">
                  <span className="sm:hidden">Tap to </span>
                  <span className="hidden sm:inline">click to </span>browse
                </span>
              </p>
            )}
            <p className="text-[11px] sm:text-[12.5px] mt-1" style={{ color: "#475569" }}>
              Max size: <span style={{ color: "#64748b", fontWeight: 500 }}>100 MB per file</span>
            </p>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-1">
            <ShieldCheck size={11} style={{ color: "#00E5A0" }} />
            <span className="text-[10px] sm:text-[11px]" style={{ color: "#475569", fontWeight: 500 }}>
              You'll choose encryption after selecting a file
            </span>
          </div>
        </div>
      </div>

      {pendingFiles && (
        <EncryptionChoiceModal
          files={pendingFiles}
          onChoose={handleEncryptionChoice}
          onCancel={handleCancelUpload}
        />
      )}
    </div>
  );
}