import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Package, Plus, Pencil, Trash2, Loader2, Save, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL;

function getAuthHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

export default function PackagingTypes() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', units_per_package: '', description: '' });

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/packaging-types`, { headers: getAuthHeaders() });
      setTypes(res.data.packaging_types || []);
    } catch { toast.error('Failed to load packaging types'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTypes(); }, []);

  const openCreate = () => {
    setEditing(null);
    setFormData({ name: '', units_per_package: '', description: '' });
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setFormData({ name: t.name, units_per_package: t.units_per_package, description: t.description || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Name is required'); return; }
    if (!formData.units_per_package || parseInt(formData.units_per_package) <= 0) { toast.error('Units per package must be > 0'); return; }
    setSaving(true);
    try {
      const payload = { name: formData.name.trim(), units_per_package: parseInt(formData.units_per_package), description: formData.description.trim() };
      if (editing) {
        await axios.put(`${API_URL}/api/packaging-types/${editing.id}`, payload, { headers: getAuthHeaders() });
        toast.success('Packaging type updated');
      } else {
        await axios.post(`${API_URL}/api/packaging-types`, payload, { headers: getAuthHeaders() });
        toast.success('Packaging type created');
      }
      setShowModal(false);
      fetchTypes();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    try {
      await axios.delete(`${API_URL}/api/packaging-types/${t.id}`, { headers: getAuthHeaders() });
      toast.success('Packaging type deleted');
      fetchTypes();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6" data-testid="packaging-types-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Package size={20} className="text-slate-500" /> Packaging Types
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Define packaging formats and how many units they hold</p>
        </div>
        <Button onClick={openCreate} data-testid="create-packaging-type-btn">
          <Plus className="h-4 w-4 mr-1.5" /> Add Type
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : types.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500">No packaging types defined yet</p>
          <p className="text-xs text-slate-400 mt-1">Add types like "Crate - 24", "Carton - 6", etc.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm" data-testid="packaging-types-table">
            <thead>
              <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-center px-4 py-3 font-medium">Units / Package</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {types.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/50" data-testid={`packaging-row-${t.id}`}>
                  <td className="px-4 py-3 font-medium text-slate-800">{t.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2.5 text-sm font-bold text-blue-700 bg-blue-50 rounded-lg">
                      {t.units_per_package}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{t.description || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)} data-testid={`edit-packaging-${t.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(t)} data-testid={`delete-packaging-${t.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Packaging Type' : 'New Packaging Type'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update packaging type details' : 'Define a new packaging format'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Crate, Carton, Box" data-testid="packaging-name-input" />
            </div>
            <div className="space-y-2">
              <Label>Units per Package *</Label>
              <Input type="number" min="1" value={formData.units_per_package}
                onChange={e => setFormData({ ...formData, units_per_package: e.target.value })}
                placeholder="e.g., 12, 24, 6" data-testid="packaging-units-input" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description" data-testid="packaging-desc-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="packaging-save-btn">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
