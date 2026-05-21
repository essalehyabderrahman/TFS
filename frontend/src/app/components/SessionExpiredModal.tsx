import { useEffect, useRef } from "react"
import { useNavigate } from "react-router"
import { ShieldOff, Clock, RefreshCw } from "lucide-react"

export type SessionExpiredReason = "inactivity" | "absolute" | "revoked" | "unauthorized"

interface Props {
  reason: SessionExpiredReason
  onClose: () => void   // caller must have already cleared the session before passing this
}

const CONTENT: Record<SessionExpiredReason, {
  icon: React.ReactNode
  title: string
  body: string
  accent: string
}> = {
  inactivity: {
    icon: <Clock size={36} />,
    title: "Session Timed Out",
    body: "You've been idle for more than 15 minutes. For your security, your session has been closed.",
    accent: "#00d2ff",
  },
  absolute: {
    icon: <Clock size={36} />,
    title: "Session Expired",
    body: "You've reached the maximum session duration (8 hours). Please sign in again to continue.",
    accent: "#0B7FFF",
  },
  revoked: {
    icon: <ShieldOff size={36} />,
    title: "Security Alert",
    body: "Your session has been terminated by an administrator or because your credentials were changed elsewhere.",
    accent: "#F87171",
  },
  unauthorized: {
    icon: <ShieldOff size={36} />,
    title: "Access Terminated",
    body: "Your account is no longer authorized to access this resource, or your session target no longer exists.",
    accent: "#F87171",
  },
}

export function SessionExpiredModal({ reason, onClose }: Props) {
  const navigate = useNavigate()
  const btnRef = useRef<HTMLButtonElement>(null)

  // Trap focus on the button so keyboard users cannot tab to blurred content
  useEffect(() => {
    btnRef.current?.focus()
  }, [])

  // Prevent background scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  const { icon, title, body, accent } = CONTENT[reason]

  function handleClose() {
    onClose()
    navigate("/", { replace: true })
  }

  return (
    // Full-viewport backdrop — pointer-events blocks all interaction with the page below
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,1,12,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      // Clicking the backdrop also dismisses — same handler
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
    >
      {/* Modal card — stop click propagation so clicking inside doesn't close */}
      <div
        className="relative w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-5 text-center"
        style={{
          background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
          border: `1px solid ${accent}30`,
          boxShadow: `0 0 60px ${accent}18`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: `${accent}15`, border: `1px solid ${accent}30`, color: accent }}
        >
          {icon}
        </div>

        {/* Text */}
        <div>
          <h2
            id="session-expired-title"
            className="text-white text-xl font-bold mb-2"
          >
            {title}
          </h2>
          <p style={{ color: "var(--muted-foreground)", fontSize: "14px", lineHeight: "1.6" }}>{body}</p>
        </div>

        {/* CTA */}
        <button
          ref={btnRef}
          onClick={handleClose}
          className="w-full h-12 rounded-xl font-black uppercase tracking-widest transition-all hover:opacity-90 active:scale-95"
          style={{ background: accent, color: accent === "#0B7FFF" ? "white" : "black", fontSize: "13px" }}
        >
          Return to Home
        </button>
      </div>
    </div>
  )
}
