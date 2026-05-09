"use client"

import React, { useState } from "react"
import { Link } from "react-router-dom"
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react"
import { apiForgotPassword } from "@/app/api/auth"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import BackgroundParticles from "@/app/components/ui/BackgroundParticles"

export default function ForgotPassword() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const result = await apiForgotPassword(email)
      if (result.ok) {
        setDone(true)
      } else {
        setError(result.error ?? "An error occurred.")
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
            <Mail className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Forgot Password?</h1>
          <p className="text-slate-400 text-sm">No worries, we'll send you reset instructions.</p>
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
                <p className="text-white font-medium">Check your email</p>
                <p className="text-slate-400 text-sm">
                  If an account exists for {email}, you'll receive a password reset link shortly.
                </p>
              </div>
              <Button asChild className="w-full h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border-slate-700">
                <Link to="/signin">Return to Sign In</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors">
                    <Mail size={18} />
                  </div>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="h-12 pl-12 bg-slate-900/50 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium animate-in fade-in slide-in-from-top-2">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Instructions...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>

              <div className="pt-2 text-center">
                <Link
                  to="/signin"
                  className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft size={14} />
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
