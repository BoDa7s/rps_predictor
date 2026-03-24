import React, { useEffect } from "react";
import { motion } from "framer-motion";
import botHappy96 from "../assets/mascot/bot-happy-96.svg";
import {
  officialSiteRedirectConfig,
} from "../officialSiteRedirect";

interface OfficialSiteRedirectPageProps {
  destination: string;
}

export default function OfficialSiteRedirectPage({
  destination,
}: OfficialSiteRedirectPageProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.replace(destination);
    }, officialSiteRedirectConfig.delayMs);

    return () => window.clearTimeout(timer);
  }, [destination]);

  return (
    <div className="landing-shell min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10rem] top-[-8rem] h-[26rem] w-[26rem] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-[-8rem] top-[6rem] h-[24rem] w-[24rem] rounded-full bg-emerald-400/12 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_48%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-10 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-3xl rounded-[2rem] border border-white/10 bg-white/[0.05] p-4 shadow-[0_30px_80px_rgba(2,6,23,0.55)] backdrop-blur"
        >
          <div className="rounded-[1.7rem] border border-white/10 bg-slate-900/90 p-8 sm:p-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-3 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
                  <img src={botHappy96} alt="" className="h-7 w-7" />
                  <span className="font-semibold uppercase tracking-[0.22em]">RPS Predictor</span>
                </div>
                <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                  RPS Predictor has moved to the official site.
                </h1>
                <p className="mt-4 max-w-lg text-base leading-7 text-slate-300 sm:text-lg">
                  You are being redirected to the new home for RPS Predictor. Your current page, query string, and
                  route are being carried over automatically.
                </p>
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/75">
                    Destination
                  </p>
                  <p className="mt-2 break-all text-sm text-slate-300">{destination}</p>
                </div>
                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <a
                    href={destination}
                    className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400 px-7 text-base font-semibold text-slate-950 shadow-[0_20px_50px_rgba(14,165,233,0.35)] transition duration-200 hover:scale-[1.01] hover:shadow-[0_24px_60px_rgba(52,211,153,0.28)]"
                  >
                    Continue to Official Site
                  </a>
                  <p className="text-sm text-slate-400">
                    Redirecting in about {(officialSiteRedirectConfig.delayMs / 1000)} seconds.
                  </p>
                </div>
              </div>

              <div className="w-full max-w-sm rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(134,239,172,0.8)]" />
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-100/90">
                    Redirect in progress
                  </p>
                </div>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{
                      duration: officialSiteRedirectConfig.delayMs / 1000,
                      ease: "easeInOut",
                    }}
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-300"
                  />
                </div>
                <div className="mt-6 space-y-4 text-sm text-slate-300">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="font-semibold text-white">Hostname check</p>
                    <p className="mt-1 leading-6">
                      This page only appears on <span className="text-cyan-200">rps-predictor.pages.dev</span>.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="font-semibold text-white">Deep links preserved</p>
                    <p className="mt-1 leading-6">
                      Pathname, query string, and hash fragment are forwarded to the matching page on the official
                      domain.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="font-semibold text-white">Fallback</p>
                    <p className="mt-1 leading-6">
                      If the redirect is delayed, use the button to continue immediately.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
