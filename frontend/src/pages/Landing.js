import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CloudRain, Droplets, Leaf, Eye, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const GREEN = '#2C3E35';
const MUTED = '#86868B';

const Reveal = ({ children, delay = 0, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-60px' }}
    transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    className={className}
  >
    {children}
  </motion.div>
);

const Overline = ({ children }) => (
  <p className="text-xs md:text-sm tracking-[0.2em] uppercase font-semibold mb-6" style={{ color: MUTED }}>{children}</p>
);

const NAV_ITEMS = ['Innovation', 'Products', 'Sustainability', 'Vision', 'Journal'];

const EXPLORE_CARDS = [
  { icon: CloudRain, title: 'Our Craft', desc: "From the morning sky to your glass — the four careful steps behind the world's purest water." },
  { icon: Droplets, title: 'Products', desc: 'Nyla Alkaline (pH 8.5) and Nyla pH Balanced (7.5) — two waters, one standard of perfection.' },
  { icon: Leaf, title: 'Sustainability', desc: 'Zero groundwater taken, zero water wasted, and packaging designed for a second life.' },
  { icon: Eye, title: 'Vision', desc: 'A future where pure water belongs to everyone — without taking a drop from the ground.' },
];

const BLOG_POSTS = [
  { img: '/landing/blog-air.jpg', category: 'Science of Purity', read: '4 min read', title: 'Why Water from Air Is the Purest Water on Earth', excerpt: 'Groundwater passes through soil, rock, and everything we have buried in between. Atmospheric water never touches any of it.' },
  { img: '/landing/blog-alkaline.jpg', category: 'Health & Wellness', read: '5 min read', title: 'Alkaline Water, Explained: What pH 8.5 Really Does for Your Body', excerpt: 'Beyond the buzzword — how naturally achieved alkalinity supports hydration, recovery, and long-term wellness.' },
  { img: '/landing/blog-groundwater.jpg', category: 'Sustainability', read: '6 min read', title: 'The Hidden Cost of Groundwater: Why the World Needs a New Source', excerpt: 'Aquifers that took ten thousand years to fill are being emptied in decades. There is another way.' },
];

export default function Landing() {
  const { user, loading } = useAuth();

  if (!loading && user) return <Navigate to="/home" replace />;

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arimo, Arial, sans-serif" }} data-testid="landing-page">

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[#F5F5F7]/80 border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 md:px-12 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2" data-testid="landing-logo">
            <img src="/nyla-logo.png" alt="Nyla Air Water" className="h-9 w-9 object-contain" />
            <span className="font-bold tracking-tight text-base">Nyla Air Water</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm" style={{ color: MUTED }}>
            {NAV_ITEMS.map((n) => <span key={n} className="cursor-default">{n}</span>)}
          </nav>
          <Link
            to="/login"
            className="px-5 py-2 rounded-full bg-[#1D1D1F] text-white text-sm font-medium hover:bg-black active:scale-95 transition-[background-color,transform] duration-200"
            data-testid="header-signin-link"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section data-testid="hero-section" className="pt-32 md:pt-44 pb-0">
        <div className="max-w-4xl mx-auto px-6 md:px-12 text-center">
          <Reveal><Overline>Pure Water. Born from the Sky.</Overline></Reveal>
          <Reveal delay={0.08}>
            <h1 data-testid="hero-heading" className="text-5xl md:text-7xl lg:text-[6rem] leading-[1.05] tracking-tighter font-bold">
              Born from Air.<br />Perfected by Nature.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-8 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto" style={{ color: MUTED }}>
              Nyla Air Water is not drawn from the ground — it is gathered gently from the sky, purified with care, and enriched with nature's essential minerals.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <span className="px-7 py-3.5 rounded-full bg-[#1D1D1F] text-white text-sm font-medium cursor-default">Discover Products</span>
              <span className="px-7 py-3.5 rounded-full text-sm font-medium cursor-default" style={{ color: GREEN }}>Explore Our Craft →</span>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.3} className="mt-16 md:mt-24 max-w-7xl mx-auto px-6 md:px-12">
          <div className="relative rounded-3xl overflow-hidden">
            <img src="/landing/hero.jpg" alt="Crystal-clear water droplet" className="w-full h-[380px] md:h-[620px] object-cover" data-testid="hero-image" />
          </div>
        </Reveal>
      </section>

      {/* Intro */}
      <section data-testid="intro-section" className="py-24 md:py-32 lg:py-40">
        <div className="max-w-3xl mx-auto px-6 md:px-12 text-center">
          <Reveal><Overline>What Makes Nyla Different</Overline></Reveal>
          <Reveal delay={0.06}>
            <h2 className="text-4xl md:text-5xl lg:text-6xl leading-tight tracking-tight font-medium">Water, the way nature intended.</h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-8 text-lg md:text-xl leading-relaxed" style={{ color: MUTED }}>
              Most water comes from the ground — pumped from wells, drawn from rivers, stripped from ancient aquifers. Nyla's water comes from a higher source: the atmosphere. Each drop begins as pure moisture in the air, untouched by soil contaminants, heavy metals, or industrial runoff.
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <p className="mt-6 text-lg md:text-xl leading-relaxed" style={{ color: MUTED }}>
              The atmosphere holds nature's most renewable reservoir — moisture that the water cycle replenishes every few days. By gathering it gently and enriching it with essential Magnesium and Calcium, we craft hydration that is kind to your body and kinder still to the planet: no depleted wells, no disturbed rivers, no compromise.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <blockquote className="mt-14 text-2xl md:text-3xl font-medium tracking-tight" style={{ color: GREEN }}>
              “We don't take water from the earth.<br className="hidden md:block" /> We receive it from the sky.”
            </blockquote>
          </Reveal>
        </div>
      </section>

      {/* Explore */}
      <section data-testid="explore-section" className="py-24 md:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal className="text-center mb-16 max-w-3xl mx-auto">
            <Overline>Discover Nyla</Overline>
            <h2 className="text-4xl md:text-5xl lg:text-6xl leading-tight tracking-tight font-bold">Explore the world of air water.</h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-8">
            {EXPLORE_CARDS.map((c, i) => (
              <Reveal key={c.title} delay={i * 0.08}>
                <div className="flex flex-col h-full bg-[#F5F5F7] rounded-3xl p-8 lg:p-12" data-testid={`explore-card-${c.title.toLowerCase().replace(/\s/g, '-')}`}>
                  <c.icon className="w-8 h-8 mb-8" style={{ color: GREEN }} strokeWidth={1.5} />
                  <h3 className="text-2xl md:text-3xl tracking-tight font-bold mb-3">{c.title}</h3>
                  <p className="text-base leading-relaxed flex-1" style={{ color: MUTED }}>{c.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Journal */}
      <section data-testid="blog-section" className="py-24 md:py-32 lg:py-40 bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal className="text-center mb-16 md:mb-24 max-w-3xl mx-auto">
            <Overline>The Nyla Journal</Overline>
            <h2 className="text-4xl md:text-5xl lg:text-6xl leading-tight tracking-tight font-bold">Stories of water, health, and the planet.</h2>
            <p className="mt-6 text-lg leading-relaxed" style={{ color: MUTED }}>
              Notes from our journey — the science of purity, the craft behind every bottle, and the future of sustainable hydration.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {BLOG_POSTS.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.08}>
                <div className="bg-[#F5F5F7] rounded-3xl overflow-hidden h-full">
                  <div className="h-56 overflow-hidden">
                    <img src={p.img} alt={p.title} loading="lazy" className="w-full h-full object-cover" />
                  </div>
                  <div className="p-7">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: GREEN }}>{p.category}</span>
                      <span className="text-xs" style={{ color: MUTED }}>{p.read}</span>
                    </div>
                    <h3 className="text-xl md:text-2xl tracking-tight font-bold leading-snug mb-3">{p.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{p.excerpt}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section data-testid="cta-banner" className="py-24 md:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal>
            <div className="bg-black rounded-3xl px-8 py-16 md:px-16 md:py-24 text-center">
              <Overline>Partner With Us</Overline>
              <h2 className="text-3xl md:text-5xl leading-tight tracking-tight font-bold text-[#F5F5F7] max-w-2xl mx-auto">Serve the sky at your table.</h2>
              <p className="mt-6 text-base md:text-lg leading-relaxed max-w-xl mx-auto" style={{ color: MUTED }}>
                From luxury hospitality to premium retail — join the establishments serving the world's purest, most thoughtfully crafted hydration.
              </p>
              <span className="mt-10 inline-block px-8 py-4 rounded-full bg-[#F5F5F7] text-[#1D1D1F] text-sm font-medium cursor-default">Start a Conversation</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#F5F5F7] border-t border-black/5 pt-16 pb-8" data-testid="landing-footer">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
            <div>
              <div className="flex items-center gap-2">
                <img src="/nyla-logo.png" alt="Nyla Air Water" className="h-10 w-10 object-contain" />
                <span className="font-bold tracking-tight text-lg">Nyla Air Water</span>
              </div>
              <p className="mt-3 text-sm" style={{ color: MUTED }}>Born from air. Perfected by nature. Hyderabad, India.</p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: MUTED }}>
              {[...NAV_ITEMS, 'Contact'].map((n) => <span key={n} className="cursor-default">{n}</span>)}
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-black/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] mb-2" style={{ color: MUTED }}>Now Serving</p>
              <p className="text-sm">Hyderabad · Bengaluru · Mumbai · Goa · Delhi</p>
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.1em]">Think Nyla. Drink with purpose.</p>
          </div>
          <div className="mt-8 pt-6 border-t border-black/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs" style={{ color: MUTED }}>
            <span>© {new Date().getFullYear()} Nyla Air Water. All rights reserved.</span>
            <div className="flex items-center gap-6">
              <span>Where Nature Meets Purity</span>
              <Link to="/login" className="inline-flex items-center gap-1.5 hover:text-[#1D1D1F] transition-colors" data-testid="footer-team-login">
                <Lock className="w-3.5 h-3.5" /> Team Login
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
