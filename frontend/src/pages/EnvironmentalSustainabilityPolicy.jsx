import React from 'react';
import { ArrowLeft, Leaf, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

const sections = [
  {
    number: '1',
    title: 'Responsible water use',
    intro: 'We will work to conserve water throughout our operations by:',
    bullets: [
      'Monitoring water used in production, bottle washing, rinsing, cleaning and other plant activities.',
      'Identifying and addressing leaks, avoidable losses and excessive consumption.',
      'Improving cleaning and rinsing processes while maintaining hygiene and product quality.',
      'Evaluating opportunities to recover or reuse water where technically suitable, permitted and safe.',
      'Managing wastewater responsibly to prevent contamination of soil, drains and surrounding water sources.',
    ],
    closing: 'Water conservation measures will always account for food safety and the suitability of water for its intended use.',
  },
  {
    number: '2',
    title: 'Responsible packaging and bottle reuse',
    intro: 'We will support the return, inspection and safe reuse of suitable glass bottles through our collection arrangements with customers and partners.',
    lead: 'We commit to:',
    bullets: [
      'Encouraging customers to return eligible bottles and reusable crates.',
      'Inspecting returned bottles and removing those that are damaged, deteriorated or unsuitable for further use.',
      'Establishing and reviewing washing, sanitisation and rejection criteria.',
      'Reusing bottles only when they meet our quality and safety requirements.',
      'Sending rejected glass and other recyclable packaging to appropriate recycling channels.',
      'Reducing unnecessary packaging and evaluating packaging choices for durability, material use, transport requirements and end-of-life recovery.',
    ],
    closing: 'We will assess the environmental impact of reuse alongside the water, energy and chemicals required for washing and collection.',
  },
  {
    number: '3',
    title: 'Energy efficiency and climate responsibility',
    intro: 'We recognise that atmospheric water generation and bottling require electricity. We will work to improve energy efficiency through equipment selection, preventive maintenance and effective operating practices.',
    lead: 'Our priorities include:',
    bullets: [
      'Tracking electricity consumption in relation to production.',
      'Reducing avoidable equipment idling and energy losses.',
      'Maintaining cooling equipment and managing refrigerants responsibly.',
      'Evaluating renewable electricity options where practical and commercially feasible.',
      'Developing a better understanding of emissions associated with energy, packaging and transportation.',
    ],
    closing: 'Any future emissions-reduction or carbon-neutrality targets will be supported by a defined scope, baseline, measurement method and implementation plan.',
  },
  {
    number: '4',
    title: 'Waste reduction and pollution prevention',
    intro: 'We will apply the principles of reducing waste, reusing suitable materials and recycling wherever practical.',
    lead: 'We will:',
    bullets: [
      'Segregate glass, plastic, paper, cardboard, metal and other waste at appropriate collection points.',
      'Store waste safely and use authorised handlers where required.',
      'Handle cleaning chemicals, used oils, electronic waste and other controlled waste according to applicable requirements.',
      'Maintain procedures for chemical storage, dosing, spill prevention and spill response.',
      'Manage wastewater and discharges through appropriate treatment or disposal arrangements.',
      'Investigate environmental incidents and take corrective action.',
    ],
  },
  {
    number: '5',
    title: 'Responsible sourcing and distribution',
    paragraphs: [
      'We will consider environmental performance alongside quality, safety, reliability and cost when selecting suppliers and service providers.',
      'We will encourage partners to minimise unnecessary packaging, manage waste responsibly and provide accurate information about materials and environmental claims.',
      'For distribution, we will seek opportunities to improve route planning, consolidate deliveries and coordinate bottle collections with deliveries. We will maintain vehicles appropriately and review avoidable fuel use and unnecessary trips.',
    ],
  },
  {
    number: '6',
    title: 'Compliance and employee participation',
    paragraphs: [
      'We commit to meeting applicable environmental requirements, permit conditions and environmental obligations we formally accept.',
      'Management will assign responsibilities for implementation and provide relevant guidance to employees and contractors. Team members will be encouraged to report leaks, spills, waste-handling concerns and opportunities for improvement.',
      'Environmental concerns will be reviewed promptly, with actions assigned to the responsible team.',
    ],
  },
  {
    number: '7',
    title: 'Measurement and continual improvement',
    intro: 'We will establish baseline information and measurable improvement objectives appropriate to our operations.',
    lead: 'Where relevant, we will track:',
    bullets: [
      'Electricity consumption per litre of finished product.',
      'Total operational water use per litre of finished product.',
      'Bottle return, reuse and rejection rates.',
      'Packaging consumption and waste sent for recycling.',
      'Delivery fuel consumption or distance travelled.',
      'Environmental incidents and completion of corrective actions.',
    ],
    closing: 'Management will review progress at least annually, agree priorities and update objectives based on findings.',
  },
  {
    number: '8',
    title: 'Transparent communication and policy review',
    paragraphs: [
      'We will ensure that environmental statements are clear, specific and supported by evidence. Any published certification, rating, environmental achievement or target will accurately describe its scope and status.',
      'The CEO & Managing Director is responsible for overseeing this policy. We will review it annually, or earlier when significant operational or regulatory changes occur.',
      'This policy will be publicly available on our website and communicated to relevant employees and business partners.',
    ],
  },
];

const PolicySection = ({ section }) => (
  <section className="grid gap-5 border-t border-slate-200 py-10 md:grid-cols-[4rem_minmax(0,1fr)] md:gap-8 md:py-14" data-testid={`environment-policy-section-${section.number}`}>
    <span className="text-3xl font-semibold text-emerald-800" aria-hidden="true">{section.number.padStart(2, '0')}</span>
    <div className="max-w-3xl">
      <h2 className="text-2xl font-semibold text-slate-950">{section.title}</h2>
      {section.intro && <p className="mt-5 text-base leading-8 text-slate-700">{section.intro}</p>}
      {section.lead && <p className="mt-5 text-base font-medium leading-8 text-slate-900">{section.lead}</p>}
      {section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-5 text-base leading-8 text-slate-700">{paragraph}</p>)}
      {section.bullets && (
        <ul className="mt-5 space-y-3" data-testid={`environment-policy-list-${section.number}`}>
          {section.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3 text-base leading-7 text-slate-700">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-700" aria-hidden="true" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
      {section.closing && <p className="mt-6 text-base leading-8 text-slate-700">{section.closing}</p>}
    </div>
  </section>
);

export default function EnvironmentalSustainabilityPolicy() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#edf7f1_0%,#ffffff_28%,#f8fafc_100%)] text-slate-950" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arimo, sans-serif" }} data-testid="environmental-sustainability-policy-page">
      <header className="border-b border-emerald-950/10 bg-white/80 backdrop-blur" data-testid="environment-policy-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900" data-testid="environment-policy-logo-link">
            <img src="/nyla-logo.png" alt="Nyla Air Water" className="h-9 w-9 object-contain" />
            <span>Nyla Air Water</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-emerald-800" data-testid="environment-policy-back-link">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pt-24" data-testid="environment-policy-introduction">
          <div className="max-w-4xl">
            <span className="inline-flex items-center gap-2 text-emerald-800"><Leaf className="h-5 w-5" /><span className="sr-only">Environmental sustainability</span></span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl lg:text-6xl">Environmental Sustainability Policy</h1>
            <p className="mt-5 text-lg text-slate-600">Jaitra Wellness Private Limited | Nyla Air Water</p>
            <dl className="mt-10 grid gap-5 border-y border-emerald-950/10 py-6 text-sm sm:grid-cols-3" data-testid="environment-policy-metadata">
              <div><dt className="font-semibold uppercase tracking-wider text-slate-500">Effective date</dt><dd className="mt-1 text-base text-slate-900">06-July-2026</dd></div>
              <div><dt className="font-semibold uppercase tracking-wider text-slate-500">Policy owner</dt><dd className="mt-1 text-base text-slate-900">CEO &amp; Managing Director</dd></div>
              <div><dt className="font-semibold uppercase tracking-wider text-slate-500">Version</dt><dd className="mt-1 text-base text-slate-900">1.2</dd></div>
            </dl>
          </div>
        </section>

        <div className="bg-white">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <section className="grid gap-5 pb-10 pt-14 md:grid-cols-[4rem_minmax(0,1fr)] md:gap-8 md:pb-14" data-testid="environment-policy-commitment">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-800 text-white"><Leaf className="h-5 w-5" /></div>
              <div className="max-w-3xl">
                <h2 className="text-2xl font-semibold text-slate-950">Our commitment</h2>
                <p className="mt-5 text-base leading-8 text-slate-700">At Jaitra Wellness Private Limited, the company behind Nyla Air Water, we are committed to protecting the environment and improving the way we use water, energy and materials.</p>
                <p className="mt-5 text-base leading-8 text-slate-700">Our water-from-air approach offers an alternative source of drinking water. We recognise that responsible production also requires careful management of electricity, packaging, washing water, chemicals, transportation and waste.</p>
                <p className="mt-5 text-base leading-8 text-slate-700">This policy guides our decisions across manufacturing, procurement, packaging, storage, distribution and office activities. We will communicate relevant expectations to employees, suppliers, contractors and distribution partners.</p>
              </div>
            </section>
            {sections.map((section) => <PolicySection key={section.number} section={section} />)}
          </div>
        </div>

        <section className="bg-emerald-950 text-white" data-testid="environment-policy-contact">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-20">
            <div className="max-w-3xl"><h2 className="text-3xl font-semibold">Contact</h2>
              <p className="mt-5 text-base leading-8 text-emerald-50">For questions, suggestions or environmental concerns, please contact:</p>
              <p className="mt-5 text-base font-medium">Jaitra Wellness Private Limited — Nyla Air Water</p>
              <a href="mailto:contactus@nylaairwater.earth" className="mt-5 inline-flex items-center gap-2 text-base font-semibold text-emerald-200 underline decoration-emerald-400/60 underline-offset-4 transition-colors hover:text-white" data-testid="environment-policy-email-link"><Mail className="h-4 w-4" /> Email: contactus@nylaairwater.earth</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50" data-testid="environment-policy-footer">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-7 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} Nyla Air Water. All rights reserved.</span>
          <div className="flex items-center gap-5"><Link to="/" className="hover:text-slate-900" data-testid="environment-policy-footer-home">Home</Link><Link to="/login" className="hover:text-slate-900" data-testid="environment-policy-footer-login">Team Login</Link></div>
        </div>
      </footer>
    </div>
  );
}