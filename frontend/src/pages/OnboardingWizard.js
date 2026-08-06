import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Building2, Boxes, Factory, SlidersHorizontal, Users, Loader2,
  ArrowRight, ArrowLeft, CheckCircle, Copy, Plus, Trash2, Rocket,
} from 'lucide-react';
import { MODULE_REGISTRY, ALL_MODULE_KEYS } from '../config/moduleRegistry';
import { TERMINOLOGY_PRESETS } from '../config/terminologyPresets';

const TERM_LABELS = { unit: 'Sales unit', package: 'Bulk package', distributor: 'Channel partner', factory: 'Production site', sku: 'Product variant' };

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const INDUSTRIES = [
  'Food & Beverage', 'FMCG / Consumer Goods', 'Pharmaceuticals', 'Apparel', 'Manufacturing',
  'Wholesale & Distribution', 'Retail', 'Agriculture', 'Services', 'Other',
];
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '200+'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];
const INVITE_ROLES = ['Admin', 'Manager', 'User', 'Viewer'];

const SALES_GROUPS = [
  'sales_core', 'sales_reports', 'sales_ops', 'pricing_logistics', 'product_tools',
  'documents', 'requests', 'organization', 'master_data', 'ai_knowledge', 'settings_integrations',
];
const TEMPLATES = [
  {
    id: 'sales', icon: Building2, name: 'Sales CRM',
    description: 'Leads, pipeline, accounts, targets, reports, team requests. Perfect to start selling.',
    groups: SALES_GROUPS,
  },
  {
    id: 'sales_distribution', icon: Boxes, name: 'Sales + Distribution',
    description: 'Everything in Sales CRM plus warehouses, stock, distributors, fleet and SKU tracking.',
    groups: [...SALES_GROUPS, 'distribution', 'fleet', 'product_sku', 'finance_audit'],
  },
  {
    id: 'full', icon: Factory, name: 'Full Suite',
    description: 'Sales, distribution, production & QC, accounting and marketing — the complete platform.',
    groups: MODULE_REGISTRY.map((g) => g.key),
  },
  {
    id: 'custom', icon: SlidersHorizontal, name: 'Custom',
    description: 'Start with everything enabled and hand-pick exactly the modules you need.',
    groups: MODULE_REGISTRY.map((g) => g.key),
  },
];

const modulesForTemplate = (template) => {
  const enabledGroups = new Set(template.groups);
  const map = {};
  MODULE_REGISTRY.forEach((g) => {
    const on = enabledGroups.has(g.key);
    g.items.forEach((i) => { map[i.key] = on; });
  });
  return map;
};

const STEPS = ['Company', 'Template', 'Modules', 'Team'];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [companyName, setCompanyName] = useState('');

  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [templateId, setTemplateId] = useState('sales');
  const [modules, setModules] = useState(() => modulesForTemplate(TEMPLATES[0]));
  const [invites, setInvites] = useState([]);
  const [useIndustryTerms, setUseIndustryTerms] = useState(true);

  const industryPreset = TERMINOLOGY_PRESETS[industry] || null;

  useEffect(() => {
    axios.get(`${API}/tenants/onboarding/status`, { headers: HEAD() })
      .then((r) => {
        if (r.data.completed) { navigate('/home', { replace: true }); return; }
        setCompanyName(r.data.company_name || '');
        if (r.data.currency) setCurrency(r.data.currency);
      })
      .catch(() => navigate('/home', { replace: true }));
  }, [navigate]);

  const pickTemplate = (t) => {
    setTemplateId(t.id);
    setModules(modulesForTemplate(t));
  };

  const enabledCount = useMemo(() => ALL_MODULE_KEYS.filter((k) => modules[k]).length, [modules]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const toggleModule = (key) => setModules((m) => ({ ...m, [key]: !m[key] }));
  const toggleGroup = (group, on) => setModules((m) => {
    const next = { ...m };
    group.items.forEach((i) => { next[i.key] = on; });
    return next;
  });

  const submit = async () => {
    const validInvites = invites.filter((i) => i.name.trim() && i.email.trim());
    setSaving(true);
    try {
      const res = await axios.post(`${API}/tenants/onboarding/complete`, {
        industry: industry || null,
        company_size: companySize || null,
        currency,
        modules,
        invites: validInvites,
        terminology: (useIndustryTerms && industryPreset) ? industryPreset : {},
      }, { headers: HEAD() });
      setResult(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to complete setup');
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <Shell companyName={companyName}>
        <div className="text-center space-y-2 mb-6">
          <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold">You're all set!</h2>
          <p className="text-sm text-muted-foreground">Your workspace is configured and ready to use.</p>
        </div>
        {(result.invited || []).length > 0 && (
          <Card className="mb-4 text-left">
            <CardHeader className="pb-2"><CardTitle className="text-base">Team invitations</CardTitle>
              <CardDescription>Share these temporary passwords — each member must change it on first login.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {result.invited.map((u) => (
                <div key={u.email} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm" data-testid={`invited-${u.email}`}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{u.name} <span className="text-xs text-muted-foreground">· {u.role}</span></p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <button
                    className="flex items-center gap-1.5 font-mono text-xs bg-slate-100 hover:bg-slate-200 rounded px-2 py-1.5 shrink-0"
                    onClick={() => { navigator.clipboard.writeText(u.temp_password); toast.success('Password copied'); }}
                    data-testid={`copy-password-${u.email}`}
                  >
                    {u.temp_password} <Copy className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {(result.skipped || []).length > 0 && (
          <p className="text-xs text-amber-700 mb-4">
            Skipped: {result.skipped.map((s) => `${s.email} (${s.reason})`).join(', ')}
          </p>
        )}
        <Button className="w-full" onClick={() => { window.location.href = '/home'; }} data-testid="onboarding-go-dashboard">
          <Rocket className="h-4 w-4 mr-2" /> Go to Dashboard
        </Button>
      </Shell>
    );
  }

  return (
    <Shell companyName={companyName}>
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-8" data-testid="onboarding-steps">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${i === step ? 'text-primary' : i < step ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] border ${i === step ? 'border-primary bg-primary text-primary-foreground' : i < step ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                {i < step ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`w-8 h-px ${i < step ? 'bg-emerald-500' : 'bg-slate-300'}`} />}
          </React.Fragment>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-5" data-testid="onboarding-step-company">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold">Tell us about {companyName || 'your company'}</h2>
            <p className="text-sm text-muted-foreground">This helps us tailor the workspace for you.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Industry</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger data-testid="onboarding-industry-select"><SelectValue placeholder="Select your industry" /></SelectTrigger>
              <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {industryPreset && (
            <div className="rounded-lg border bg-slate-50 p-3 space-y-2" data-testid="onboarding-terms-preset">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox checked={useIndustryTerms} onCheckedChange={(v) => setUseIndustryTerms(!!v)} data-testid="onboarding-terms-checkbox" />
                Use {industry} terminology across the app
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(industryPreset).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="bg-white text-slate-700 font-normal text-[11px]" data-testid={`preset-term-${k}`}>
                    <span className="text-muted-foreground mr-1">{TERM_LABELS[k]}:</span> {v.singular} / {v.plural}
                  </Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">You can fine-tune these anytime in Tenant Settings → Terminology.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Company size</Label>
              <Select value={companySize} onValueChange={setCompanySize}>
                <SelectTrigger data-testid="onboarding-size-select"><SelectValue placeholder="People" /></SelectTrigger>
                <SelectContent>{COMPANY_SIZES.map((s) => <SelectItem key={s} value={s}>{s} people</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="onboarding-currency-select"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4" data-testid="onboarding-step-template">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold">Pick a starting point</h2>
            <p className="text-sm text-muted-foreground">You can fine-tune modules in the next step, and change anything later in Tenant Settings.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              const active = templateId === t.id;
              return (
                <button
                  key={t.id} type="button" onClick={() => pickTemplate(t)}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${active ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'}`}
                  data-testid={`onboarding-template-${t.id}`}
                >
                  <Icon className={`h-6 w-6 mb-2 ${active ? 'text-primary' : 'text-slate-500'}`} />
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4" data-testid="onboarding-step-modules">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold">Fine-tune your modules</h2>
            <p className="text-sm text-muted-foreground">
              <Badge variant="outline" className="mr-1">{enabledCount} of {ALL_MODULE_KEYS.length} enabled</Badge>
              Toggle whole sections or individual features.
            </p>
          </div>
          <div className="max-h-[46vh] overflow-y-auto space-y-3 pr-1">
            {MODULE_REGISTRY.map((g) => {
              const onCount = g.items.filter((i) => modules[i.key]).length;
              const allOn = onCount === g.items.length;
              return (
                <div key={g.key} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{g.title}</p>
                      <p className="text-[11px] text-muted-foreground">{g.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g, !allOn)}
                      className={`text-xs font-medium px-2 py-1 rounded border ${allOn ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-slate-200'}`}
                      data-testid={`onboarding-group-toggle-${g.key}`}
                    >
                      {allOn ? 'All on' : onCount === 0 ? 'All off' : `${onCount}/${g.items.length} on`}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5">
                    {g.items.map((i) => (
                      <label key={i.key} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={!!modules[i.key]} onCheckedChange={() => toggleModule(i.key)} data-testid={`onboarding-module-${i.key}`} />
                        <span className={modules[i.key] ? 'text-slate-800' : 'text-muted-foreground'}>{i.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4" data-testid="onboarding-step-team">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold">Invite your team</h2>
            <p className="text-sm text-muted-foreground">Optional — each member gets a temporary password to change on first login.</p>
          </div>
          <div className="space-y-2">
            {invites.map((inv, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input placeholder="Name" value={inv.name} className="flex-1"
                  onChange={(e) => setInvites((p) => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                  data-testid={`invite-name-${idx}`} />
                <Input placeholder="email@company.com" type="email" value={inv.email} className="flex-[1.3]"
                  onChange={(e) => setInvites((p) => p.map((x, i) => i === idx ? { ...x, email: e.target.value } : x))}
                  data-testid={`invite-email-${idx}`} />
                <Select value={inv.role} onValueChange={(v) => setInvites((p) => p.map((x, i) => i === idx ? { ...x, role: v } : x))}>
                  <SelectTrigger className="w-28" data-testid={`invite-role-${idx}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{INVITE_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setInvites((p) => p.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setInvites((p) => [...p, { name: '', email: '', role: 'User' }])} data-testid="invite-add-btn">
              <Plus className="h-4 w-4 mr-1" /> Add team member
            </Button>
          </div>
          <div className="rounded-lg bg-slate-50 border p-3 text-xs text-muted-foreground flex items-start gap-2">
            <Users className="h-4 w-4 mt-0.5 shrink-0" />
            You can always invite more people later from Team Management, and control what each role can see under Roles &amp; Permissions.
          </div>
        </div>
      )}

      {/* Nav buttons */}
      <div className="flex items-center justify-between mt-8">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving} data-testid="onboarding-back-btn">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} data-testid="onboarding-next-btn">
            Continue <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={saving} data-testid="onboarding-finish-btn">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Rocket className="h-4 w-4 mr-1.5" />}
            Finish setup
          </Button>
        )}
      </div>
    </Shell>
  );
}

const Shell = ({ companyName, children }) => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
    <Card className="w-full max-w-2xl">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-lg">{companyName ? `Welcome, ${companyName}` : 'Workspace Setup'}</CardTitle>
        <CardDescription>Let's get your workspace ready — takes about a minute</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  </div>
);
