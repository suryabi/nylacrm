import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, Droplets, Truck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const TEAL = '#00A6B8';
const NAVY = '#003048';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.55, delay: i * 0.1, ease: 'easeOut' } }),
};

export default function Landing() {
  const { user, loading } = useAuth();

  if (!loading && user) return <Navigate to="/home" replace />;

  return (
    <div
      className="min-h-screen flex flex-col bg-white text-[#003048]"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      data-testid="landing-page"
    >
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Outfit:wght@400;700;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-white/70 border-b border-[#003048]/10">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5" data-testid="landing-logo">
            <img src="/nyla-logo.png" alt="Nyla Air Water" className="h-9 w-9 object-contain" />
            <span className="font-black tracking-tight text-lg" style={{ fontFamily: "'Outfit', sans-serif", color: NAVY }}>
              Nyla Air Water
            </span>
          </div>
          <Link
            to="/login"
            className="text-sm font-semibold text-white px-5 py-2 rounded-full transition-colors"
            style={{ background: TEAL }}
            onMouseEnter={(e) => (e.currentTarget.style.background = NAVY)}
            onMouseLeave={(e) => (e.currentTarget.style.background = TEAL)}
            data-testid="header-signin-link"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 pt-16">
        <div className="max-w-3xl mx-auto text-center py-24">
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0} className="flex justify-center mb-8">
            <img src="/nyla-logo.png" alt="Nyla Air Water" className="h-24 w-24 object-contain" data-testid="hero-logo" />
          </motion.div>
          <motion.p variants={fadeUp} initial="hidden" animate="show" custom={1}
            className="text-xs font-semibold uppercase tracking-[0.25em] mb-5" style={{ color: TEAL }}>
            Operations Portal
          </motion.p>
          <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={2}
            className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05]"
            style={{ fontFamily: "'Outfit', sans-serif", color: NAVY }}>
            Nyla Air Water
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="show" custom={3}
            className="mt-6 text-base md:text-lg text-[#003048]/70 max-w-xl mx-auto">
            Production, distribution and quality — managed in one place for the Nyla team and our distribution partners.
          </motion.p>
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4} className="mt-10">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-base font-semibold text-white px-8 py-3.5 rounded-full transition-colors shadow-lg"
              style={{ background: TEAL, boxShadow: '0 10px 30px -10px rgba(0,166,184,0.5)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = NAVY)}
              onMouseLeave={(e) => (e.currentTarget.style.background = TEAL)}
              data-testid="hero-signin-btn"
            >
              Sign in to your workspace <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
            className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-[#003048]/60">
            <span className="inline-flex items-center gap-2"><Droplets className="w-4 h-4" style={{ color: TEAL }} /> Production</span>
            <span className="inline-flex items-center gap-2"><Truck className="w-4 h-4" style={{ color: TEAL }} /> Distribution</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4" style={{ color: TEAL }} /> Quality Control</span>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#003048]/10 py-6 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#003048]/50">
          <span>© {new Date().getFullYear()} Nyla Air Water. All rights reserved.</span>
          <span>Internal operations platform — authorized users only</span>
        </div>
      </footer>
    </div>
  );
}
