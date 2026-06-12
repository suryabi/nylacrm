import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, Mail, MapPin, Building2, Loader2, ExternalLink, UserX } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function PublicContactCard() {
  const { token } = useParams();
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/contacts/public/${token}`);
        if (!res.ok) throw new Error();
        setContact(await res.json());
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const addressParts = contact
    ? [contact.address, contact.address_line2, contact.city, contact.state, contact.pincode, contact.country].filter(Boolean)
    : [];
  const crmUrl = contact ? `${window.location.origin}/contacts?view=${contact.id}` : '#';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-emerald-50 flex items-center justify-center p-4" data-testid="public-contact-page">
      <div className="w-full max-w-md">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
            <p>Loading contact…</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-2xl shadow-xl p-10 text-center" data-testid="public-contact-error">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <UserX className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="text-lg font-semibold text-slate-800">Link unavailable</h1>
            <p className="text-sm text-slate-500 mt-1">This contact link has been turned off or does not exist.</p>
          </div>
        )}

        {!loading && contact && (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden" data-testid="public-contact-card">
            {/* Header band */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 h-24 relative">
              <div className="absolute -bottom-9 left-1/2 -translate-x-1/2">
                <div className="w-[72px] h-[72px] rounded-full bg-white shadow-md flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-2xl font-bold">
                    {contact.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-12 pb-6 px-6 text-center">
              <h1 className="text-xl font-bold text-slate-900" data-testid="public-contact-name">{contact.name}</h1>
              {contact.designation && <p className="text-sm text-slate-500">{contact.designation}</p>}
              {contact.company && (
                <p className="text-sm text-slate-700 font-medium flex items-center justify-center gap-1.5 mt-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" /> {contact.company}
                </p>
              )}
            </div>

            <div className="px-6 pb-6 space-y-2.5">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 transition-colors p-3" data-testid="public-contact-phone">
                  <span className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center"><Phone className="h-4 w-4 text-emerald-600" /></span>
                  <span className="text-sm text-slate-800">{contact.phone}</span>
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 transition-colors p-3" data-testid="public-contact-email">
                  <span className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center"><Mail className="h-4 w-4 text-emerald-600" /></span>
                  <span className="text-sm text-slate-800 break-all">{contact.email}</span>
                </a>
              )}
              {addressParts.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3" data-testid="public-contact-address">
                  <span className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><MapPin className="h-4 w-4 text-emerald-600" /></span>
                  <span className="text-sm text-slate-800">{addressParts.join(', ')}</span>
                </div>
              )}
            </div>

            <div className="px-6 pb-6">
              <a href={crmUrl} data-testid="public-contact-open-crm">
                <button className="w-full rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors py-2.5 text-sm font-medium text-slate-600 flex items-center justify-center gap-2">
                  <ExternalLink className="h-4 w-4" /> Open in CRM
                </button>
              </a>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-5">Shared securely via Nyla CRM</p>
      </div>
    </div>
  );
}
