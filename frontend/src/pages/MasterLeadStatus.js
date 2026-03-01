import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Plus, Pencil, Trash2, GripVertical, Loader2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const COLOR_OPTIONS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'green', label: 'Green', class: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'indigo', label: 'Indigo', class: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'emerald', label: 'Emerald', class: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'red', label: 'Red', class: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'teal', label: 'Teal', class: 'bg-teal-100 text-teal-800 border-teal-200' },
];

const getColorClass = (color) => {
  const colorOption = COLOR_OPTIONS.find(c => c.value === color);
  return colorOption?.class || 'bg-gray-100 text-gray-800 border-gray-200';
};

export default function MasterLeadStatus() {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusToDelete, setStatusToDelete] = useState(null);
  const [editingStatus, setEditingStatus] = useState(null);
  const [formData, setFormData] = useState({ label: '', color: 'gray' });
  const [saving, setSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);

  const fetchStatuses = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/master/lead-statuses`, {
        withCredentials: true
      });
      setStatuses(response.data.statuses || []);
    } catch (error) {
      toast.error('Failed to load statuses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const handleOpenDialog = (status = null) => {
    if (status) {
      setEditingStatus(status);
      setFormData({ label: status.label, color: status.color });
    } else {
      setEditingStatus(null);
      setFormData({ label: '', color: 'gray' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.label.trim()) {
      toast.error('Status label is required');
      return;
    }

    setSaving(true);
    try {
      if (editingStatus) {
        await axios.put(`${API_URL}/master/lead-statuses/${editingStatus.id}`, formData, {
          withCredentials: true
        });
        toast.success('Status updated successfully');
      } else {
        await axios.post(`${API_URL}/master/lead-statuses`, formData, {
          withCredentials: true
        });
        toast.success('Status created successfully');
      }
      setDialogOpen(false);
      fetchStatuses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save status');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (status) => {
    setStatusToDelete(status);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!statusToDelete) return;

    try {
      await axios.delete(`${API_URL}/master/lead-statuses/${statusToDelete.id}`, {
        withCredentials: true
      });
      toast.success('Status deleted successfully');
      setDeleteDialogOpen(false);
      setStatusToDelete(null);
      fetchStatuses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete status');
    }
  };

  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;

    const newStatuses = [...statuses];
    const draggedStatus = newStatuses[draggedItem];
    newStatuses.splice(draggedItem, 1);
    newStatuses.splice(index, 0, draggedStatus);
    setStatuses(newStatuses);
    setDraggedItem(index);
  };

  const handleDragEnd = async () => {
    if (draggedItem === null) return;

    try {
      const statusIds = statuses.map(s => s.id);
      await axios.put(`${API_URL}/master/lead-statuses/reorder`, statusIds, {
        withCredentials: true
      });
      toast.success('Order saved');
    } catch (error) {
      toast.error('Failed to save order');
      fetchStatuses();
    }
    setDraggedItem(null);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="master-lead-status-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Lead Statuses</h1>
            <p className="text-sm text-muted-foreground">Manage lead status options</p>
          </div>
        </div>
        <Button onClick={() => handleOpenDialog()} data-testid="add-status-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Status
        </Button>
      </div>

      {/* Status List */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : statuses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No statuses found. Add your first status.
          </div>
        ) : (
          <div className="divide-y">
            {statuses.map((status, index) => (
              <div
                key={status.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors cursor-move ${
                  draggedItem === index ? 'bg-muted/70' : ''
                }`}
                data-testid={`status-row-${status.id}`}
              >
                <GripVertical className="h-5 w-5 text-muted-foreground/50" />
                
                <div className="flex-1 flex items-center gap-4">
                  <Badge className={`${getColorClass(status.color)} border font-medium px-3 py-1`}>
                    {status.label}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    ID: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{status.id}</code>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground mr-2">
                    Order: {status.order}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenDialog(status)}
                    data-testid={`edit-status-${status.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(status)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    data-testid={`delete-status-${status.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-sm text-muted-foreground mt-4 text-center">
        Drag and drop to reorder statuses. Changes are saved automatically.
      </p>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStatus ? 'Edit Status' : 'Add New Status'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">Status Label</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="e.g., Proposal Review"
                data-testid="status-label-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Select
                value={formData.color}
                onValueChange={(v) => setFormData({ ...formData, color: v })}
              >
                <SelectTrigger data-testid="status-color-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map(color => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded ${color.class}`} />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-2">
              <Label className="text-sm text-muted-foreground">Preview</Label>
              <div className="mt-2">
                <Badge className={`${getColorClass(formData.color)} border font-medium px-3 py-1`}>
                  {formData.label || 'Status Name'}
                </Badge>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-status-btn">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingStatus ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{statusToDelete?.label}"? 
              This action cannot be undone. Statuses with existing leads cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
