import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Plus, Search, Filter, Loader2, Users, Phone, Mail, Building2,
  MapPin, Pencil, Trash2, Upload, Camera, X, CreditCard, Eye,
  ChevronLeft, ChevronRight, ScanLine, Sparkles, RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';
import AppBreadcrumb from '../components/AppBreadcrumb';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Contact Card Component
const ContactCard = ({ contact, onEdit, onDelete, onView }) => (
  <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onView(contact)}>
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg"
            style={{ backgroundColor: contact.category_color || '#6366f1' }}
          >
            {contact.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{contact.name}</h3>
            {contact.designation && (
              <p className="text-sm text-muted-foreground truncate">{contact.designation}</p>
            )}
            {contact.company && (
              <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {contact.company}
              </p>
            )}
          </div>
        </div>
        <Badge 
          variant="outline" 
          className="text-xs shrink-0"
          style={{ borderColor: contact.category_color, color: contact.category_color }}
        >
          {contact.category_name}
        </Badge>
      </div>
      
      <div className="mt-3 space-y-1">
        {contact.phone && (
          <p className="text-sm flex items-center gap-2 text-muted-foreground">
            <Phone className="h-3 w-3" /> {contact.phone}
          </p>
        )}
        {contact.email && (
          <p className="text-sm flex items-center gap-2 text-muted-foreground truncate">
            <Mail className="h-3 w-3" /> {contact.email}
          </p>
        )}
        {contact.city && (
          <p className="text-sm flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-3 w-3" /> {contact.city}
          </p>
        )}
      </div>

      <div className="mt-3 pt-3 border-t flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="sm" onClick={() => onEdit(contact)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => onDelete(contact)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </CardContent>
  </Card>
);

// Image Upload Component with Preview
const ImageUploader = ({ label, image, onImageChange, onClear }) => {
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageChange(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div 
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          image ? "border-primary/50 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
        )}
        onClick={() => inputRef.current?.click()}
      >
        {image ? (
          <div className="relative">
            <img 
              src={image} 
              alt={label} 
              className="max-h-40 mx-auto rounded-lg object-contain"
            />
            <Button
              variant="destructive"
              size="sm"
              className="absolute top-0 right-0 h-6 w-6 p-0 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="py-4">
            <Camera className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Click to upload or drag & drop</p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default function ContactsList() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterOptions, setFilterOptions] = useState({ categories: [], companies: [], cities: [] });
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 12;

  // Filters
  const [filters, setFilters] = useState({
    category_id: '',
    company: '',
    city: '',
    search: ''
  });
  const [searchInput, setSearchInput] = useState('');

  // Add/Edit Sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [activeTab, setActiveTab] = useState('manual');
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    category_id: '',
    name: '',
    company: '',
    designation: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    country: '',
    notes: ''
  });

  // Card images
  const [cardFront, setCardFront] = useState(null);
  const [cardBack, setCardBack] = useState(null);

  // View Contact Dialog
  const [viewContact, setViewContact] = useState(null);

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('page_size', pageSize);
      if (filters.category_id) params.append('category_id', filters.category_id);
      if (filters.company) params.append('company', filters.company);
      if (filters.city) params.append('city', filters.city);
      if (filters.search) params.append('search', filters.search);

      const response = await fetch(`${API_URL}/api/contacts?${params.toString()}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      }
    } catch (error) {
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // Fetch filter options
  const fetchFilterOptions = async () => {
    try {
      const response = await fetch(`${API_URL}/api/contacts/filter-options`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setFilterOptions(data);
      }
    } catch (error) {
      console.error('Failed to load filter options');
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters(prev => ({ ...prev, search: searchInput }));
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({ category_id: '', company: '', city: '', search: '' });
    setSearchInput('');
    setPage(1);
  };

  // Open add sheet
  const openAddSheet = () => {
    setEditingContact(null);
    setFormData({
      category_id: '',
      name: '',
      company: '',
      designation: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      country: '',
      notes: ''
    });
    setCardFront(null);
    setCardBack(null);
    setActiveTab('manual');
    setSheetOpen(true);
  };

  // Open edit sheet
  const openEditSheet = (contact) => {
    setEditingContact(contact);
    setFormData({
      category_id: contact.category_id || '',
      name: contact.name || '',
      company: contact.company || '',
      designation: contact.designation || '',
      phone: contact.phone || '',
      email: contact.email || '',
      address: contact.address || '',
      city: contact.city || '',
      state: contact.state || '',
      country: contact.country || '',
      notes: contact.notes || ''
    });
    setCardFront(contact.card_front_url || null);
    setCardBack(contact.card_back_url || null);
    setActiveTab('manual');
    setSheetOpen(true);
  };

  // Extract from visiting card using Claude Vision
  const extractFromCard = async () => {
    if (!cardFront && !cardBack) {
      toast.error('Please upload at least one card image');
      return;
    }

    setExtracting(true);
    try {
      const formDataToSend = new FormData();
      if (cardFront) formDataToSend.append('front_base64', cardFront);
      if (cardBack) formDataToSend.append('back_base64', cardBack);

      const response = await fetch(`${API_URL}/api/contacts/extract-card`, {
        method: 'POST',
        credentials: 'include',
        body: formDataToSend
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setFormData(prev => ({
            ...prev,
            name: result.data.name || prev.name,
            company: result.data.company || prev.company,
            designation: result.data.designation || prev.designation,
            phone: result.data.phone || prev.phone,
            email: result.data.email || prev.email,
            address: result.data.address || prev.address,
            city: result.data.city || prev.city,
            state: result.data.state || prev.state,
            country: result.data.country || prev.country,
          }));
          toast.success('Contact information extracted successfully!');
          setActiveTab('manual'); // Switch to manual tab to show extracted data
        } else {
          toast.error(result.error || 'Failed to extract information');
        }
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Extraction failed');
      }
    } catch (error) {
      toast.error('Failed to extract card information');
    } finally {
      setExtracting(false);
    }
  };

  // Save contact
  const handleSave = async () => {
    if (!formData.category_id) {
      toast.error('Please select a category');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        card_front_url: cardFront,
        card_back_url: cardBack
      };

      const url = editingContact
        ? `${API_URL}/api/contacts/${editingContact.id}`
        : `${API_URL}/api/contacts`;

      const response = await fetch(url, {
        method: editingContact ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dataToSave)
      });

      if (response.ok) {
        toast.success(editingContact ? 'Contact updated' : 'Contact created');
        setSheetOpen(false);
        fetchContacts();
        fetchFilterOptions(); // Refresh filter options
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to save contact');
      }
    } catch (error) {
      toast.error('Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  // Delete contact
  const handleDelete = async (contact) => {
    if (!confirm(`Delete contact "${contact.name}"?`)) return;

    try {
      const response = await fetch(`${API_URL}/api/contacts/${contact.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Contact deleted');
        fetchContacts();
      } else {
        toast.error('Failed to delete contact');
      }
    } catch (error) {
      toast.error('Failed to delete contact');
    }
  };

  const hasActiveFilters = filters.category_id || filters.company || filters.city || filters.search;

  return (
    <div className="space-y-6" data-testid="contacts-list">
      <AppBreadcrumb />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            Manage your business contacts and visiting cards
          </p>
        </div>
        <Button onClick={openAddSheet} data-testid="add-contact-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Contact
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, company, email, phone..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10"
                  data-testid="search-input"
                />
              </div>
            </div>

            {/* Category Filter */}
            <Select
              value={filters.category_id || "all"}
              onValueChange={(value) => handleFilterChange('category_id', value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-full lg:w-48" data-testid="category-filter">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {filterOptions.categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Company Filter */}
            <Select
              value={filters.company || "all"}
              onValueChange={(value) => handleFilterChange('company', value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-full lg:w-48" data-testid="company-filter">
                <SelectValue placeholder="All Companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {filterOptions.companies.map((company) => (
                  <SelectItem key={company} value={company}>{company}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* City Filter */}
            <Select
              value={filters.city || "all"}
              onValueChange={(value) => handleFilterChange('city', value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-full lg:w-48" data-testid="city-filter">
                <SelectValue placeholder="All Cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {filterOptions.cities.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Info */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {contacts.length} of {total} contacts
        </p>
      </div>

      {/* Contacts Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : contacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No contacts found</h3>
            <p className="text-muted-foreground mb-4">
              {hasActiveFilters ? 'Try adjusting your filters' : 'Get started by adding your first contact'}
            </p>
            {!hasActiveFilters && (
              <Button onClick={openAddSheet}>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={openEditSheet}
              onDelete={handleDelete}
              onView={setViewContact}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingContact ? 'Edit Contact' : 'Add New Contact'}
            </SheetTitle>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="scan">
                <ScanLine className="h-4 w-4 mr-2" />
                Scan Card
              </TabsTrigger>
              <TabsTrigger value="manual">
                <Pencil className="h-4 w-4 mr-2" />
                Manual Entry
              </TabsTrigger>
            </TabsList>

            {/* Scan Card Tab */}
            <TabsContent value="scan" className="space-y-4 mt-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900">AI-Powered Extraction</p>
                    <p className="text-sm text-blue-700 mt-1">
                      Upload front and/or back of the visiting card. Our AI will automatically extract contact details.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ImageUploader
                  label="Card Front"
                  image={cardFront}
                  onImageChange={setCardFront}
                  onClear={() => setCardFront(null)}
                />
                <ImageUploader
                  label="Card Back"
                  image={cardBack}
                  onImageChange={setCardBack}
                  onClear={() => setCardBack(null)}
                />
              </div>

              <Button 
                onClick={extractFromCard} 
                disabled={extracting || (!cardFront && !cardBack)}
                className="w-full"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Extract Information
                  </>
                )}
              </Button>
            </TabsContent>

            {/* Manual Entry Tab */}
            <TabsContent value="manual" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                >
                  <SelectTrigger data-testid="form-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {filterOptions.categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Full name"
                  data-testid="form-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="Company name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Designation</Label>
                  <Input
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    placeholder="Job title"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 9876543210"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@company.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street address"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="City"
                  />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="State"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="Country"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setSheetOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingContact ? 'Update' : 'Save'} Contact
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* View Contact Dialog */}
      <Dialog open={!!viewContact} onOpenChange={() => setViewContact(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contact Details</DialogTitle>
          </DialogHeader>
          
          {viewContact && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl"
                  style={{ backgroundColor: viewContact.category_color || '#6366f1' }}
                >
                  {viewContact.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{viewContact.name}</h3>
                  {viewContact.designation && (
                    <p className="text-muted-foreground">{viewContact.designation}</p>
                  )}
                  <Badge 
                    variant="outline" 
                    className="mt-1"
                    style={{ borderColor: viewContact.category_color, color: viewContact.category_color }}
                  >
                    {viewContact.category_name}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                {viewContact.company && (
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{viewContact.company}</span>
                  </div>
                )}
                {viewContact.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${viewContact.phone}`} className="text-primary hover:underline">
                      {viewContact.phone}
                    </a>
                  </div>
                )}
                {viewContact.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${viewContact.email}`} className="text-primary hover:underline">
                      {viewContact.email}
                    </a>
                  </div>
                )}
                {(viewContact.address || viewContact.city) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span>
                      {[viewContact.address, viewContact.city, viewContact.state, viewContact.country]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {viewContact.notes && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">{viewContact.notes}</p>
                </div>
              )}

              {/* Card Images */}
              {(viewContact.card_front_url || viewContact.card_back_url) && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Visiting Card</p>
                  <div className="grid grid-cols-2 gap-2">
                    {viewContact.card_front_url && (
                      <img 
                        src={viewContact.card_front_url} 
                        alt="Card Front" 
                        className="rounded-lg border object-cover h-24 w-full"
                      />
                    )}
                    {viewContact.card_back_url && (
                      <img 
                        src={viewContact.card_back_url} 
                        alt="Card Back" 
                        className="rounded-lg border object-cover h-24 w-full"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewContact(null)}>
              Close
            </Button>
            <Button onClick={() => {
              openEditSheet(viewContact);
              setViewContact(null);
            }}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
