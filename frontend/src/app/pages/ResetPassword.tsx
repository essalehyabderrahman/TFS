"use client"

import React, { useState, useEffect } from "react"
import { Link, useSearchParams, useNavigate } from "react-router-dom"
import { Lock, Loader2, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react"
import { apiResetPassword } from "@/app/api/auth"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import BackgroundParticles from "@/app/components/ui/BackgroundParticles"

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError("Invalid reset link. No token provided.")
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const result = await apiResetPassword({ token, password })
      if (result.ok) {
        setDone(true)
      } else {
        setError(result.error ?? "Invalid or expired reset link.")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#020617] font-sans selection:bg-blue-500/30 selection:text-blue-200">
      <BackgroundParticles />
      
      <div className="relative z-10 w-full max-w-[420px] px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-6 backdrop-blur-sm">
            <ShieldCheck className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Reset Password</h1>
          <p className="text-slate-400 text-sm">Please enter your new secure password.</p>
        </div>

        <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
          {done ? (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <CheckCircle2 className="text-emerald-400" size={24} />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-white font-medium">Password Updated</p>
                <p className="text-slate-400 text-sm">
                  Your password has been successfully reset. You can now sign in with your new credentials.
                </p>
              </div>
              <Button asChild className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-900/20">
                <Link to="/signin">Sign In Now</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                    New Password
                  </label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors">
                      <Lock size={18} />
                    </div>
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-12 pl-12 bg-slate-900/50 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                    Confirm Password
                  </label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors">
                      <Lock size={18} />
                    </div>
                    <Input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-12 pl-12 bg-slate-900/50 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl transition-all"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !token}
                className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
              
              {!token && (
                <div className="text-center pt-2">
                   <Link to="/forgot-password" size="sm" className="text-xs text-blue-400 hover:text-blue-300">
                    Request new link
                   </Link>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
