import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  User, Mail, Phone, Plus, Edit2, Trash2, Loader2, KeyRound,
  ShieldCheck, Star, Briefcase, X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '../ui/alert-dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const EMPTY = {
  name: '', mobile: '', email: '', designation: '',
  has_portal_access: false, is_primary: false,
};

export default function ContactsSection({ distributorId, canManage = true }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null); // contact being edited
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchContacts = useCallback(async () => {
    if (!distributorId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/distributors/${distributorId}/contacts`, { withCredentials: true });
      setContacts(res.data.contacts || []);
    } catch {
      toast.error('Could not load contacts');
    } finally {
      setLoading(false);
    }
  }, [distributorId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setShowDialog(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name || '',
      mobile: c.mobile || '',
      email: c.email || '',
      designation: c.designation || '',
      has_portal_access: !!c.has_portal_access,
      is_primary: !!c.is_primary,
    });
    setShowDialog(true);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (form.has_portal_access && !form.email.trim()) {
      toast.error('Email is required to enable portal access');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        mobile: form.mobile.trim() || null,
        email: form.email.trim() || null,
        designation: form.designation.trim() || null,
        has_portal_access: !!form.has_portal_access,
        is_primary: !!form.is_primary,
      };
      if (editing) {
        await axios.put(`${API_URL}/distributors/${distributorId}/contacts/${editing.id}`, payload, { withCredentials: true });
        toast.success('Contact updated');
      } else {
        await axios.post(`${API_URL}/distributors/${distributorId}/contacts`, payload, { withCredentials: true });
        toast.success(payload.has_portal_access
          ? 'Contact added — portal login enabled (default password: nyladist##)'
          : 'Contact added');
      }
      setShowDialog(false);
      fetchContacts();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await axios.delete(`${API_URL}/distributors/${distributorId}/contacts/${confirmDelete.id}`, { withCredentials: true });
      toast.success('Contact removed');
      setConfirmDelete(null);
      fetchContacts();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not remove contact');
    }
  };

  const resetPortalPassword = async (c) => {
    try {
      const res = await axios.post(
        `${API_URL}/distributors/${distributorId}/contacts/${c.id}/reset-password`,
        {},
        { withCredentials: true }
      );
      toast.success(`Password reset. Default: ${res.data?.default_password || 'set by admin'}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not reset password');
    }
  };

  return (
    <Card className="border border-slate-200/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)]" data-testid="contacts-section">
      <CardHeader className="pb-4 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2.5 text-slate-800">
          <div className="p-2 rounded-lg bg-blue-50">
            <User className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
          </div>
          Contacts
          <Badge variant="outline" className="ml-1 font-normal text-[10px] tracking-wider">
            {contacts.length}
          </Badge>
        </CardTitle>
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={openCreate}
            data-testid="add-contact-btn"
            className="h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add Contact
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-slate-400 py-3">
            No contacts added yet. Click <span className="font-medium text-slate-600">Add Contact</span> to register one.
          </p>
        ) : (
          contacts.map(c => (
            <div
              key={c.id}
              className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
              data-testid={`contact-${c.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-semibold text-sm text-slate-900">{c.name}</p>
                    {c.is_primary && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-[10px] gap-1">
                        <Star className="h-2.5 w-2.5" /> Primary
                      </Badge>
                    )}
                    {c.has_portal_access && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-[10px] gap-1">
                        <ShieldCheck className="h-2.5 w-2.5" /> Portal Access
                      </Badge>
                    )}
                  </div>
                  {c.designation && (
                    <p className="text-xs text-slate-500 inline-flex items-center gap-1 mb-1">
                      <Briefcase className="h-3 w-3" /> {c.designation}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                    {c.mobile && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3 text-slate-400" /> {c.mobile}
                      </span>
                    )}
                    {c.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3 text-slate-400" /> {c.email}
                      </span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    {c.has_portal_access && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resetPortalPassword(c)}
                        title="Reset portal password"
                        data-testid={`reset-pwd-${c.id}`}
                        className="h-8 w-8 p-0"
                      >
                        <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(c)}
                      data-testid={`edit-contact-${c.id}`}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(c)}
                      data-testid={`delete-contact-${c.id}`}
                      className="h-8 w-8 p-0 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
            <DialogDescription>
              Maintain people the team should reach out to. Optionally enable portal login for any of them.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">Name *</Label>
                <Input
                  id="contact-name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  data-testid="contact-name-input"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-designation">Designation</Label>
                <Input
                  id="contact-designation"
                  value={form.designation}
                  onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
                  data-testid="contact-designation-input"
                  placeholder="e.g., Operations Manager"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-mobile">Mobile</Label>
                <Input
                  id="contact-mobile"
                  value={form.mobile}
                  onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))}
                  data-testid="contact-mobile-input"
                  placeholder="+91 …"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-email">Email{form.has_portal_access ? ' *' : ''}</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  data-testid="contact-email-input"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.is_primary}
                  onCheckedChange={(v) => setForm(f => ({ ...f, is_primary: !!v }))}
                  data-testid="contact-is-primary"
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-800">Mark as primary contact</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Primary contact appears at the top of the list and on the distributor card.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.has_portal_access}
                  onCheckedChange={(v) => setForm(f => ({ ...f, has_portal_access: !!v }))}
                  data-testid="contact-has-portal-access"
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-800 inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Enable login to Distributor Portal
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Creates a Distributor-role user. Default password: <code className="px-1 py-0.5 bg-white border rounded text-[11px]">nyladist##</code> — they'll be asked to change it on first login.
                  </span>
                </span>
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
                <X className="h-4 w-4 mr-1.5" /> Cancel
              </Button>
              <Button type="submit" disabled={saving} data-testid="contact-save-btn">
                {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {editing ? 'Save changes' : 'Add Contact'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this contact?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.has_portal_access
                ? `This will also revoke portal login for ${confirmDelete?.email}.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} data-testid="confirm-delete-contact" className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
