import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, BarChart3, Boxes, FlaskConical, Languages, ShieldCheck,
  CreditCard, Check, Layers, Workflow,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BLUE = '#002FA7';
const INK = '#0A0A0A';

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.55, delay: i * 0.08, ease: 'easeOut' } }),
};

const Section = ({ children, className = '' }) => (
  <section className={`px-6 sm:px-10 lg:px-16 ${className}`}>
    <div className="max-w-6xl mx-auto">{children}</div>
  </section>
);

export default function Landing() {
  const { user, loading } = useAuth();
  const [hostTenant, setHostTenant] = React.useState(undefined); // undefined = checking

  // White-label: on a tenant subdomain / custom domain, skip marketing → tenant login
  React.useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/tenants/resolve/host?host=${window.location.hostname}`)
      .then((r) => r.json())
      .then((d) => setHostTenant(d?.tenant_id || null))
      .catch(() => setHostTenant(null));
  }, []);

  if (!loading && user) return <Navigate to="/home" replace />;
  if (hostTenant) return <Navigate to="/login" replace />;

  return (
    <div
      className="min-h-screen bg-white text-[#0A0A0A] selection:bg-[#FFD600]"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      data-testid="landing-page"
    >
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Outfit:wght@400;700;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-white/70 border-b border-black/10">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 lg:px-16 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <span className="w-7 h-7 flex items-center justify-center text-white font-black text-sm" style={{ background: BLUE }}>F</span>
            <span className="font-black tracking-tight text-lg">FlowStack</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#525252]">
            <a href="#features" className="hover:text-black transition-colors" data-testid="nav-features">Product</a>
            <a href="#industries" className="hover:text-black transition-colors" data-testid="nav-industries">Industries</a>
            <a href="#pricing" className="hover:text-black transition-colors" data-testid="nav-pricing">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-semibold hover:text-[#002FA7] transition-colors" data-testid="header-signin-link">Sign in</Link>
            <Link
              to="/register"
              className="text-sm font-semibold text-white px-4 py-2 rounded-sm transition-colors"
              style={{ background: BLUE }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#00227A')}
              onMouseLeave={(e) => (e.currentTarget.style.background = BLUE)}
              data-testid="header-trial-btn"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <Section className="pt-36 pb-24 lg:pt-44 lg:pb-32">
        <div className="grid lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-7">
            <motion.p variants={fadeUp} initial="hidden" animate="show" custom={0}
              className="text-xs font-semibold uppercase tracking-[0.2em] mb-6" style={{ color: BLUE }}>
              Sales · Inventory · Production — one system
            </motion.p>
            <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1}
              className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[0.98]"
              style={{ fontFamily: "'Outfit', sans-serif" }}>
              Run your entire operation, <span style={{ color: BLUE }}>not just your pipeline.</span>
            </motion.h1>
            <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2}
              className="mt-8 text-lg text-[#525252] leading-relaxed max-w-xl">
              FlowStack is the operations CRM for companies that make, move and sell physical products —
              leads to production batches to the last case delivered.
            </motion.p>
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 text-white font-semibold px-7 py-4 rounded-sm text-base transition-transform hover:-translate-y-0.5"
                style={{ background: BLUE }}
                data-testid="hero-cta-button"
              >
                Start your 14-day free trial <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="text-sm text-[#525252]">No credit card required</span>
            </motion.div>
          </div>
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2} className="lg:col-span-5">
            <div className="border border-black/10">
              <img
                src="https://images.pexels.com/photos/4487365/pexels-photo-4487365.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Warehouse operations"
                className="w-full h-[340px] object-cover"
              />
              <div className="p-4 flex items-center justify-between text-xs font-medium text-[#525252] border-t border-black/10">
                <span>Live stock · 11 warehouses</span>
                <span className="font-semibold" style={{ color: BLUE }}>batch-traceable</span>
              </div>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* Feature bento */}
      <Section className="py-24 border-t border-black/10" >
        <div id="features" className="mb-14">
          <h2 className="text-base md:text-lg font-bold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif", color: BLUE }}>Product</h2>
          <p className="text-4xl sm:text-5xl font-black tracking-tight mt-2" style={{ fontFamily: "'Outfit', sans-serif" }}>Everything between the lead and the loading dock.</p>
        </div>
        <div className="grid md:grid-cols-6 gap-6">
          {[
            { icon: BarChart3, title: 'Sales CRM', desc: 'Leads, pipeline, accounts, targets and team performance — with role-based access down to each menu item.', span: 'md:col-span-4' },
            { icon: Boxes, title: 'Distribution & Inventory', desc: 'Warehouses, stock transfers, distributor settlements and crate-level availability with zero ambiguity.', span: 'md:col-span-2' },
            { icon: FlaskConical, title: 'Production & QC', desc: 'Batches, quality checks and full genealogy — trace any unit back to its production run.', span: 'md:col-span-2' },
            { icon: Languages, title: 'Speaks your industry', desc: 'Rename bottles, crates and distributors to pieces, cartons and dealers. One click per industry.', span: 'md:col-span-2' },
            { icon: ShieldCheck, title: 'Roles & permissions', desc: 'A full permission matrix per role — custom roles included.', span: 'md:col-span-2' },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} custom={i}
              className={`${f.span} border border-black/10 p-8 lg:p-10 bg-white hover:-translate-y-1 hover:shadow-lg transition-transform transition-shadow duration-200`}
              data-testid={`feature-card-${i}`}
            >
              <f.icon className="h-7 w-7 mb-5" style={{ color: BLUE }} />
              <h3 className="text-xl font-bold tracking-tight mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>{f.title}</h3>
              <p className="text-[#525252] leading-relaxed text-sm">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Industries */}
      <Section className="py-24 border-t border-black/10">
        <div id="industries" className="mb-14 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="text-base md:text-lg font-bold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif", color: BLUE }}>Industries</h2>
            <p className="text-4xl sm:text-5xl font-black tracking-tight mt-2" style={{ fontFamily: "'Outfit', sans-serif" }}>Templates that set you up in a minute.</p>
          </div>
          <p className="text-sm text-[#525252] max-w-sm leading-relaxed">Pick your industry during signup — FlowStack pre-configures modules and terminology to match how you already work.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { img: 'https://images.pexels.com/photos/31019572/pexels-photo-31019572.jpeg?auto=compress&cs=tinysrgb&w=800', name: 'Apparel', terms: 'Pieces · Cartons · Dealers' },
            { img: 'https://images.unsplash.com/photo-1669707041081-dd4d51943041?crop=entropy&cs=srgb&fm=jpg&q=85&w=800', name: 'Pharma', terms: 'Strips · Cartons · Stockists' },
            { img: 'https://images.pexels.com/photos/18631424/pexels-photo-18631424.jpeg?auto=compress&cs=tinysrgb&w=800', name: 'Food & Beverage', terms: 'Bottles · Crates · Distributors' },
            { img: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?crop=entropy&cs=srgb&fm=jpg&q=85&w=800', name: 'FMCG', terms: 'Units · Cases · Distributors' },
          ].map((ind, i) => (
            <motion.div
              key={ind.name}
              variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} custom={i}
              className="border border-black/10 group" data-testid={`industry-card-${ind.name.toLowerCase().replace(/[^a-z]+/g, '-')}`}
            >
              <div className="overflow-hidden">
                <img src={ind.img} alt={ind.name} className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
              <div className="p-5 border-t border-black/10">
                <p className="font-bold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{ind.name}</p>
                <p className="text-xs text-[#525252] mt-1">{ind.terms}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section className="py-24 border-t border-black/10">
        <div id="pricing" className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-base md:text-lg font-bold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif", color: BLUE }}>Pricing</h2>
            <p className="text-4xl sm:text-5xl font-black tracking-tight mt-2 mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
              One plan. Every module. Pay per person.
            </p>
            <ul className="space-y-3">
              {[
                'All modules included — Sales, Distribution, Production & QC',
                'Unlimited records, warehouses and custom roles',
                'Industry templates & custom terminology',
                'Add or remove users anytime — billing follows your team',
              ].map((f) => (
                <li key={f} className="flex items-start gap-3 text-[#525252]">
                  <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BLUE }} /> {f}
                </li>
              ))}
            </ul>
          </div>
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
            className="p-10 lg:p-14 text-white" style={{ background: INK }} data-testid="pricing-card"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] mb-6" style={{ color: '#FFD600' }}>Pro plan</p>
            <div className="flex items-end gap-2">
              <span className="text-7xl font-black tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>$10</span>
              <span className="text-white/60 mb-3 text-sm font-medium">per user / month</span>
            </div>
            <p className="mt-6 text-white/70 leading-relaxed text-sm">
              Start with a 14-day free trial — full product, your data, no credit card.
              Upgrade in two clicks when you're ready.
            </p>
            <Link
              to="/register"
              className="mt-10 inline-flex w-full items-center justify-center gap-2 font-semibold px-6 py-4 rounded-sm text-[#0A0A0A] transition-transform hover:-translate-y-0.5"
              style={{ background: '#FFD600' }}
              data-testid="pricing-trial-btn"
            >
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </Section>

      {/* Final CTA + footer */}
      <Section className="py-20 border-t border-black/10">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <Workflow className="h-6 w-6" style={{ color: BLUE }} />
            <p className="text-2xl font-black tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Your operation deserves one source of truth.
            </p>
          </div>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 text-white font-semibold px-7 py-4 rounded-sm transition-transform hover:-translate-y-0.5"
            style={{ background: BLUE }}
            data-testid="footer-trial-btn"
          >
            Start free trial <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-16 pt-8 border-t border-black/10 flex flex-wrap items-center justify-between gap-4 text-sm text-[#525252]">
          <div className="flex items-center gap-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <span className="w-5 h-5 flex items-center justify-center text-white font-black text-[10px]" style={{ background: BLUE }}>F</span>
            <span className="font-bold">FlowStack</span>
            <span className="text-black/30">·</span>
            <span>The operations CRM</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/login" className="hover:text-black transition-colors" data-testid="footer-signin-link">Sign in</Link>
            <Link to="/register" className="hover:text-black transition-colors" data-testid="footer-register-link">Create workspace</Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
