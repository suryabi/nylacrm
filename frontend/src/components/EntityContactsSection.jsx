import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from './ui/alert-dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const SALUTATIONS = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'];
const EMPTY = { salutation: '', first_name: '', last_name: '', email: '', phone: '', designation: '' };

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
      salutation: c.salutation || '', first_name: c.first_name || '', last_name: c.last_name || '',
      email: c.email || '', phone: c.phone || '', designation: c.designation || '',
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Contacts</h2>
        <Button size="sm" onClick={openAdd} data-testid="add-contact-btn"><Plus className="h-4 w-4 mr-1.5" /> Add Contact</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8" data-testid="no-contacts">No contacts yet. Add the first contact for this {parentType}.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Salutation</TableHead>
                <TableHead>First Name</TableHead>
                <TableHead>Last Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id} data-testid={`contact-row-${c.id}`}>
                  <TableCell>{c.salutation || '—'}</TableCell>
                  <TableCell className="font-medium">{c.first_name}</TableCell>
                  <TableCell>{c.last_name || '—'}</TableCell>
                  <TableCell>{c.email ? <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a> : '—'}</TableCell>
                  <TableCell>{c.phone || '—'}</TableCell>
                  <TableCell>{c.designation || '—'}</TableCell>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit Contact' : 'Add Contact'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Salutation</label>
              <Select value={form.salutation || undefined} onValueChange={(v) => setForm({ ...form, salutation: v })}>
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
