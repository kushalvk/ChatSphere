"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Phone, User as UserIcon, LockKeyhole, ArrowRight, MessageSquare, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  const startResendTimer = () => {
    setResendTimer(30);
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (phoneNumber.length !== 10) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, username }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("otp");
        startResendTimer();
      } else {
        setError(data.message || "Failed to send OTP.");
      }
    } catch (err) {
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("OTP must be 6 digits.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, otp, username }),
      });
      const data = await res.json();
      if (data.success) {
        login(phoneNumber, username, true);
      } else {
        setError(data.message || "Invalid OTP.");
      }
    } catch (err) {
      setError("Verification failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#0f0a14] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 text-gray-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="w-16 h-16 bg-[#1a1025] border border-purple-900/30 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(147,51,234,0.3)]">
          <MessageSquare size={32} className="text-purple-500" />
        </div>
        <h2 className="text-center text-3xl font-extrabold text-white">
          ChatSync
        </h2>
        <p className="mt-2 text-center text-sm text-purple-300/80 uppercase tracking-widest font-bold">
          Secure Personal Synapse
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#181124] py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10 border border-purple-900/40">
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-xs font-bold uppercase tracking-wider text-center animate-pulse">
              {error}
            </div>
          )}

          {step === "phone" ? (
            <form className="space-y-6" onSubmit={handlePhoneSubmit}>
              <div>
                <label htmlFor="username" className="block text-xs font-black text-purple-500 uppercase tracking-[0.2em] mb-2">
                  Identity Handle
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <UserIcon className="h-4 w-4 text-purple-400" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-12 bg-[#0d0913] text-white border-purple-900/30 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none border p-3.5 transition-all text-sm font-medium"
                    placeholder="e.g. neo_01"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="block text-xs font-black text-purple-500 uppercase tracking-[0.2em] mb-2">
                  Mobile Synapse (10 digits)
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-purple-400" />
                  </div>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    maxLength={10}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                    className="block w-full pl-12 bg-[#0d0913] text-white border-purple-900/30 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none border p-3.5 transition-all text-sm font-medium tracking-[0.1em]"
                    placeholder="9876543210"
                  />
                </div>
              </div>

              <div>
                <button
                  disabled={loading}
                  type="submit"
                  className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-xl shadow-xl shadow-purple-900/20 text-xs font-black uppercase tracking-[0.2em] text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Initiate Verification"}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleOtpSubmit}>
              <div>
                <label htmlFor="otp" className="block text-xs font-black text-purple-500 uppercase tracking-[0.2em] mb-2 text-center">
                  Verification Code
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <LockKeyhole className="h-4 w-4 text-purple-400" />
                  </div>
                  <input
                    id="otp"
                    name="otp"
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="block w-full pl-4 bg-[#0d0913] text-white border-purple-900/30 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none border p-4 text-center text-2xl font-black tracking-[0.5em] transition-all font-mono"
                    placeholder="000000"
                  />
                </div>
                <p className="mt-3 text-center text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                  Sent to {phoneNumber.replace(/.(?=.{4})/g, "*")}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  disabled={loading}
                  type="submit"
                  className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-xl shadow-xl shadow-green-900/20 text-xs font-black uppercase tracking-[0.2em] text-white bg-green-600 hover:bg-green-500 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <>Access System <ArrowRight className="ml-2 h-4 w-4" /></>}
                </button>
                
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={resendTimer > 0 || loading}
                    onClick={handlePhoneSubmit}
                    className="w-full py-2 text-[10px] font-black uppercase tracking-[0.1em] text-purple-400 hover:text-purple-300 disabled:opacity-30 transition-all"
                  >
                    {resendTimer > 0 ? `Resend Code in ${resendTimer}s` : "Resend Verification Code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("phone")}
                    className="w-full py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-600 hover:text-gray-400 transition-all"
                  >
                    Change Number
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
