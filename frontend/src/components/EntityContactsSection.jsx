import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Users, Mail, Phone, Building2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { SectionHeader } from './detail/SectionHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import { HoverCard, HoverCardTrigger, HoverCardContent } from './ui/hover-card';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from './ui/alert-dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const SALUTATIONS = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'];
const CATEGORIES = ['Owner', 'Partner', 'Purchase', 'Stock', 'Delivery', 'Accounts', 'Management', 'Food & Beverage (F&B)', 'Third Party'];
const EMPTY = { salutation: 'Mr', first_name: '', last_name: '', email: '', phone: '', designation: '', category: '' };

const fullName = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ');

/**
 * Multi-contact table for a Lead or Account. Contacts are persisted into the
 * shared Contacts module (tagged to this parent), so add/edit/delete here keep
 * the global Contacts list in sync.
 */
export default function EntityContactsSection({ parentType, parentId }) {
  const base = `${API_URL}/${parentType}s/${parentId}/contacts`;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    if (!parentId) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await axios.get(base, { headers: authHeaders() });
      setContacts(r.data.contacts || []);
    } catch {
      toast.error('Could not load contacts');
    } finally {
      setLoading(false);
    }
  }, [base, parentId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      salutation: c.salutation || 'Mr', first_name: c.first_name || '', last_name: c.last_name || '',
      email: c.email || '', phone: c.phone || '', designation: c.designation || '', category: c.category || '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.first_name.trim()) { toast.error('First name is required'); return; }
    setSaving(true);
    try {
      if (editing) await axios.put(`${base}/${editing.id}`, form, { headers: authHeaders() });
      else await axios.post(base, form, { headers: authHeaders() });
      toast.success(editing ? 'Contact updated' : 'Contact added');
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await axios.delete(`${base}/${deleteId}`, { headers: authHeaders() });
      toast.success('Contact deleted');
      setDeleteId(null);
      load();
    } catch {
      toast.error('Failed to delete contact');
    }
  };

  return (
    <Card className="p-4 sm:p-6" data-testid="entity-contacts-section">
      <SectionHeader
        eyebrow="People"
        title="Contacts"
        icon={Users}
        testid="header-contacts"
        actions={<Button size="sm" onClick={openAdd} data-testid="add-contact-btn"><Plus className="h-4 w-4 mr-1.5" /> Add Contact</Button>}
      />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8" data-testid="no-contacts">No contacts yet. Add the first contact for this {parentType}.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Salutation</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id} data-testid={`contact-row-${c.id}`}>
                  <TableCell>{c.salutation || '—'}</TableCell>
                  <TableCell>
                    <HoverCard openDelay={150} closeDelay={60}>
                      <HoverCardTrigger asChild>
                        <div className="max-w-[180px] truncate font-medium cursor-default" data-testid={`contact-name-${c.id}`}>
                          {fullName(c) || '—'}
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent align="start" className="w-72" data-testid={`contact-hovercard-${c.id}`}>
                        <div className="space-y-2">
                          <div>
                            <p className="font-semibold text-sm">{[c.salutation, c.first_name, c.last_name].filter(Boolean).join(' ')}</p>
                            {c.designation && <p className="text-xs text-muted-foreground">{c.designation}</p>}
                          </div>
                          <div className="space-y-1.5 text-sm border-t pt-2">
                            {c.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <a href={`mailto:${c.email}`} className="text-primary hover:underline break-all">{c.email}</a>
                              </div>
                            )}
                            {c.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span>{c.phone}</span>
                              </div>
                            )}
                            {c.company && (
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground">{c.company}</span>
                              </div>
                            )}
                            {!c.email && !c.phone && !c.company && (
                              <p className="text-xs text-muted-foreground">No additional details</p>
                            )}
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[200px] truncate" title={c.email || ''}>
                      {c.email ? <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a> : '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[140px] truncate" title={c.phone || ''}>{c.phone || '—'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[160px] truncate" title={c.designation || ''}>{c.designation || '—'}</div>
                  </TableCell>
                  <TableCell>
                    {c.category
                      ? <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 text-xs" data-testid={`contact-category-${c.id}`}>{c.category}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)} data-testid={`edit-contact-${c.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(c.id)} data-testid={`delete-contact-${c.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="contact-form-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
            <DialogDescription>Manage a contact for this {parentType}. It will also appear in the Contacts module.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Salutation</label>
              <Select value={form.salutation} onValueChange={(v) => setForm({ ...form, salutation: v })}>
                <SelectTrigger data-testid="contact-salutation"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{SALUTATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="hidden sm:block" />
            <div>
              <label className="text-xs text-muted-foreground">First Name *</label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} data-testid="contact-first-name" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Last Name</label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} data-testid="contact-last-name" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email Address</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="contact-email" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phone Number</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="contact-phone" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Designation</label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} data-testid="contact-designation" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={form.category || undefined} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="contact-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="save-contact-btn">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{editing ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>This removes the contact from this {parentType} and the Contacts module. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="confirm-delete-contact">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
