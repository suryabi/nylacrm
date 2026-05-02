/* Full-page detail view for a single Marketing Request.
 * Wraps the shared RequestDetailContent inside a regular page layout
 * (no Dialog) — matches how Tasks / Leads / Meetings present a detail page.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { RequestDetailContent } from './MarketingRequests';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function MarketingRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [leadOptions, setLeadOptions] = useState([]);

  // Lookups for the selectors inside the detail content
  useEffect(() => {
    (async () => {
      try {
        const [t, d, l] = await Promise.all([
          axios.get(`${API}/master-request-types`),
          axios.get(`${API}/marketing-requests/lookups/departments`),
          axios.get(`${API}/leads`, { params: { limit: 500 } }).catch(() => ({ data: [] })),
        ]);
        setTypes(t.data || []);
        setDepartments(d.data || []);
        const raw = l.data;
        const leads = Array.isArray(raw) ? raw : (raw?.data || raw?.leads || raw?.items || []);
        setLeadOptions(leads.map((x) => {
          const label = x.company || x.company_name || x.business_name || x.name || x.contact_name || x.hotel_name || 'Untitled Lead';
          const sub = x.contact_name || x.name || x.city || x.status || '';
          return { id: x.id, label: sub && sub !== label ? `${label} · ${sub}` : label };
        }));
      } catch { /* tolerate lookup failures — content still renders */ }
    })();
  }, []);

  const onChanged = useCallback(() => {
    // No global side-effects required from the detail page;
    // the list page refetches on its own when the user navigates back.
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4" data-testid="marketing-request-detail-page">
      <div className="flex items-center justify-between">
        <Link to="/marketing-requests">
          <Button variant="ghost" size="sm" className="text-slate-600 hover:bg-slate-100" data-testid="mr-detail-back">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to requests
          </Button>
        </Link>
      </div>

      <RequestDetailContent
        requestId={id}
        onChanged={onChanged}
        types={types}
        departments={departments}
        leadOptions={leadOptions}
      />
    </div>
  );
}
