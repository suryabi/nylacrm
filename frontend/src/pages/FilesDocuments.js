import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import axios from 'axios';
import { 
  FolderPlus, FilePlus, Upload, Download, Trash2, Edit2, 
  FileText, FileImage, File, FolderOpen, ChevronRight,
  Search, X, Plus, Settings
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Key user roles that can manage categories
const KEY_USER_ROLES = ['admin', 'Admin', 'CEO', 'Director'];

const isKeyUser = (role) => KEY_USER_ROLES.includes(role);

// Document type icons
const getDocumentIcon = (docType, contentType) => {
  if (docType === 'pdf') {
    return <FileText className="h-10 w-10 text-red-500" />;
  } else if (docType === 'doc' || docType === 'docx') {
    return <FileText className="h-10 w-10 text-blue-500" />;
  } else if (docType === 'image') {
    return <FileImage className="h-10 w-10 text-green-500" />;
  }
  return <File className="h-10 w-10 text-gray-500" />;
};

// Format file size
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

// Format date
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export default function FilesDocuments() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  
  // Form states
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [subcategoryForm, setSubcategoryForm] = useState({ name: '', description: '', category_id: '' });
  const [uploadForm, setUploadForm] = useState({ name: '', category_id: '', subcategory_id: '', file: null });
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  
  // Document preview state
  const [previewDocument, setPreviewDocument] = useState(null);
  
  const [uploading, setUploading] = useState(false);

  const canManageCategories = isKeyUser(user?.role);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/document-categories`, { headers: getAuthHeaders() });
      setCategories(res.data.categories || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
      toast.error('Failed to load categories');
    }
  }, []);

  // Fetch subcategories
  const fetchSubcategories = useCallback(async (categoryId = null) => {
    try {
      const url = categoryId 
        ? `${API_URL}/document-subcategories?category_id=${categoryId}`
        : `${API_URL}/document-subcategories`;
      const res = await axios.get(url, { headers: getAuthHeaders() });
      setSubcategories(res.data.subcategories || []);
    } catch (err) {
      console.error('Error fetching subcategories:', err);
    }
  }, []);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    try {
      let url = `${API_URL}/documents`;
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category_id', selectedCategory);
      if (selectedSubcategory) params.append('subcategory_id', selectedSubcategory);
      if (params.toString()) url += `?${params.toString()}`;
      
      const res = await axios.get(url, { headers: getAuthHeaders() });
      setDocuments(res.data.documents || []);
    } catch (err) {
      console.error('Error fetching documents:', err);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedSubcategory]);

  useEffect(() => {
    fetchCategories();
    fetchSubcategories();
  }, [fetchCategories, fetchSubcategories]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (selectedCategory) {
      fetchSubcategories(selectedCategory);
    } else {
      fetchSubcategories();
    }
    setSelectedSubcategory(null);
  }, [selectedCategory, fetchSubcategories]);

  // Category handlers
  const handleCreateCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      await axios.post(`${API_URL}/document-categories`, categoryForm, { headers: getAuthHeaders() });
      toast.success('Category created successfully');
      setCategoryForm({ name: '', description: '' });
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create category');
    }
  };

  const handleUpdateCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      await axios.put(`${API_URL}/document-categories/${editingCategory.id}`, categoryForm, { headers: getAuthHeaders() });
      toast.success('Category updated successfully');
      setCategoryForm({ name: '', description: '' });
      setEditingCategory(null);
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Are you sure you want to delete this category? All subcategories will also be deleted.')) return;
    try {
      await axios.delete(`${API_URL}/document-categories/${categoryId}`, { headers: getAuthHeaders() });
      toast.success('Category deleted successfully');
      if (selectedCategory === categoryId) {
        setSelectedCategory(null);
      }
      fetchCategories();
      fetchSubcategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete category');
    }
  };

  // Subcategory handlers
  const handleCreateSubcategory = async () => {
    if (!subcategoryForm.name.trim()) {
      toast.error('Subcategory name is required');
      return;
    }
    if (!subcategoryForm.category_id) {
      toast.error('Please select a category');
      return;
    }
    try {
      await axios.post(`${API_URL}/document-subcategories`, subcategoryForm, { headers: getAuthHeaders() });
      toast.success('Subcategory created successfully');
      setSubcategoryForm({ name: '', description: '', category_id: '' });
      setShowSubcategoryModal(false);
      fetchSubcategories(selectedCategory);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create subcategory');
    }
  };

  const handleUpdateSubcategory = async () => {
    if (!subcategoryForm.name.trim()) {
      toast.error('Subcategory name is required');
      return;
    }
    try {
      await axios.put(`${API_URL}/document-subcategories/${editingSubcategory.id}`, {
        name: subcategoryForm.name,
        description: subcategoryForm.description
      }, { headers: getAuthHeaders() });
      toast.success('Subcategory updated successfully');
      setSubcategoryForm({ name: '', description: '', category_id: '' });
      setEditingSubcategory(null);
      setShowSubcategoryModal(false);
      fetchSubcategories(selectedCategory);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update subcategory');
    }
  };

  const handleDeleteSubcategory = async (subcategoryId) => {
    if (!window.confirm('Are you sure you want to delete this subcategory?')) return;
    try {
      await axios.delete(`${API_URL}/document-subcategories/${subcategoryId}`, { headers: getAuthHeaders() });
      toast.success('Subcategory deleted successfully');
      if (selectedSubcategory === subcategoryId) {
        setSelectedSubcategory(null);
      }
      fetchSubcategories(selectedCategory);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete subcategory');
    }
  };

  // Document handlers
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (5 MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size exceeds 5 MB limit');
        return;
      }
      setUploadForm({ ...uploadForm, file, name: uploadForm.name || file.name });
    }
  };

  const handleUploadDocument = async () => {
    if (!uploadForm.file) {
      toast.error('Please select a file');
      return;
    }
    if (!uploadForm.category_id) {
      toast.error('Please select a category');
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('name', uploadForm.name || uploadForm.file.name);
      formData.append('category_id', uploadForm.category_id);
      if (uploadForm.subcategory_id) {
        formData.append('subcategory_id', uploadForm.subcategory_id);
      }
      
      await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'multipart/form-data'
        }
      });
      
      toast.success('Document uploaded successfully');
      setUploadForm({ name: '', category_id: '', subcategory_id: '', file: null });
      setShowUploadModal(false);
      fetchDocuments();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadDocument = async (doc) => {
    try {
      const res = await axios.get(`${API_URL}/documents/${doc.id}`, { headers: getAuthHeaders() });
      const docData = res.data.document;
      
      // Create download link
      const byteCharacters = atob(docData.file_data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: docData.content_type });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = docData.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Download started');
    } catch (err) {
      toast.error('Failed to download document');
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await axios.delete(`${API_URL}/documents/${docId}`, { headers: getAuthHeaders() });
      toast.success('Document deleted successfully');
      fetchDocuments();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete document');
    }
  };

  // Filter documents by search
  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.uploaded_by_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get category/subcategory names for display
  const getCategoryName = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId);
    return cat?.name || 'Unknown';
  };

  const getSubcategoryName = (subcategoryId) => {
    if (!subcategoryId) return null;
    const sub = subcategories.find(s => s.id === subcategoryId);
    return sub?.name || null;
  };

  // Get filtered subcategories for upload modal
  const getFilteredSubcategories = (categoryId) => {
    return subcategories.filter(s => s.category_id === categoryId);
  };

  return (
    <div className="space-y-6" data-testid="files-documents-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Files & Documents</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize and manage your documents</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageCategories && (
            <Button
              variant="outline"
              onClick={() => setShowManageModal(true)}
              data-testid="manage-categories-btn"
            >
              <Settings className="h-4 w-4 mr-2" />
              Manage Categories
            </Button>
          )}
          <Button
            onClick={() => {
              setUploadForm({ 
                ...uploadForm, 
                category_id: selectedCategory || '', 
                subcategory_id: selectedSubcategory || '' 
              });
              setShowUploadModal(true);
            }}
            data-testid="upload-document-btn"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="search-documents-input"
          />
        </div>
        <Select value={selectedCategory || 'all'} onValueChange={(v) => setSelectedCategory(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[200px]" data-testid="category-filter">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedCategory && (
          <Select value={selectedSubcategory || 'all'} onValueChange={(v) => setSelectedSubcategory(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[200px]" data-testid="subcategory-filter">
              <SelectValue placeholder="All Subcategories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subcategories</SelectItem>
              {getFilteredSubcategories(selectedCategory).map(sub => (
                <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Breadcrumb */}
      {(selectedCategory || selectedSubcategory) && (
        <div className="flex items-center gap-2 text-sm">
          <button 
            onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
            className="text-primary hover:underline"
          >
            All Documents
          </button>
          {selectedCategory && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <button 
                onClick={() => setSelectedSubcategory(null)}
                className="text-primary hover:underline"
              >
                {getCategoryName(selectedCategory)}
              </button>
            </>
          )}
          {selectedSubcategory && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">{getSubcategoryName(selectedSubcategory)}</span>
            </>
          )}
        </div>
      )}

      {/* Documents Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No documents found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery ? 'Try a different search term' : 'Upload your first document to get started'}
            </p>
            <Button 
              className="mt-4" 
              onClick={() => setShowUploadModal(true)}
              data-testid="empty-upload-btn"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDocuments.map(doc => (
            <Card key={doc.id} className="group hover:shadow-md transition-shadow" data-testid={`document-card-${doc.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Icon/Thumbnail */}
                  <div className="flex-shrink-0">
                    {doc.document_type === 'image' ? (
                      <div 
                        className="h-16 w-16 rounded bg-muted flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                        onClick={() => setPreviewDocument(doc)}
                      >
                        {doc.file_data ? (
                          <img 
                            src={`data:${doc.content_type};base64,${doc.file_data}`}
                            alt={doc.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <FileImage className="h-8 w-8 text-green-500" />
                        )}
                      </div>
                    ) : (
                      <div 
                        className="cursor-pointer hover:ring-2 hover:ring-primary/50 rounded transition-all"
                        onClick={() => setPreviewDocument(doc)}
                      >
                        {getDocumentIcon(doc.document_type, doc.content_type)}
                      </div>
                    )}
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate" title={doc.name}>{doc.name}</h3>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.file_name}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {doc.document_type.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                    </div>
                  </div>
                </div>
                
                {/* Category path */}
                <div className="mt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <FolderOpen className="h-3 w-3" />
                    {getCategoryName(doc.category_id)}
                    {doc.subcategory_id && (
                      <>
                        <ChevronRight className="h-3 w-3" />
                        {getSubcategoryName(doc.subcategory_id)}
                      </>
                    )}
                  </span>
                </div>
                
                {/* Meta & Actions */}
                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    <p>{doc.uploaded_by_name}</p>
                    <p>{formatDate(doc.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownloadDocument(doc)}
                      data-testid={`download-doc-${doc.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {(doc.uploaded_by === user?.id || canManageCategories) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteDocument(doc.id)}
                        data-testid={`delete-doc-${doc.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Document Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Document Name</label>
              <Input
                value={uploadForm.name}
                onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                placeholder="Enter document name"
                data-testid="upload-doc-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Category *</label>
              <Select 
                value={uploadForm.category_id} 
                onValueChange={(v) => setUploadForm({ ...uploadForm, category_id: v, subcategory_id: '' })}
              >
                <SelectTrigger data-testid="upload-category-select">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {uploadForm.category_id && getFilteredSubcategories(uploadForm.category_id).length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Subcategory (Optional)</label>
                <Select 
                  value={uploadForm.subcategory_id || 'none'} 
                  onValueChange={(v) => setUploadForm({ ...uploadForm, subcategory_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger data-testid="upload-subcategory-select">
                    <SelectValue placeholder="Select subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {getFilteredSubcategories(uploadForm.category_id).map(sub => (
                      <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-2 block">File *</label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
                  onChange={handleFileSelect}
                  data-testid="upload-file-input"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {uploadForm.file ? (
                    <div className="space-y-2">
                      <File className="h-10 w-10 mx-auto text-primary" />
                      <p className="text-sm font-medium">{uploadForm.file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(uploadForm.file.size)}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to select file</p>
                      <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, Images (Max 5 MB)</p>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadModal(false)}>Cancel</Button>
            <Button onClick={handleUploadDocument} disabled={uploading} data-testid="upload-submit-btn">
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Categories Modal */}
      <Dialog open={showManageModal} onOpenChange={setShowManageModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Categories Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Categories</h3>
                <Button
                  size="sm"
                  onClick={() => {
                    setCategoryForm({ name: '', description: '' });
                    setEditingCategory(null);
                    setShowCategoryModal(true);
                  }}
                  data-testid="add-category-btn"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Category
                </Button>
              </div>
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No categories yet</p>
              ) : (
                <div className="space-y-2">
                  {categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{cat.name}</p>
                        {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setCategoryForm({ name: cat.name, description: cat.description || '' });
                            setEditingCategory(cat);
                            setShowCategoryModal(true);
                          }}
                          data-testid={`edit-category-${cat.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteCategory(cat.id)}
                          data-testid={`delete-category-${cat.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subcategories Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Subcategories</h3>
                <Button
                  size="sm"
                  onClick={() => {
                    setSubcategoryForm({ name: '', description: '', category_id: '' });
                    setEditingSubcategory(null);
                    setShowSubcategoryModal(true);
                  }}
                  disabled={categories.length === 0}
                  data-testid="add-subcategory-btn"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Subcategory
                </Button>
              </div>
              {subcategories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No subcategories yet</p>
              ) : (
                <div className="space-y-2">
                  {subcategories.map(sub => (
                    <div key={sub.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{sub.name}</p>
                        <p className="text-xs text-muted-foreground">
                          In: {getCategoryName(sub.category_id)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setSubcategoryForm({ 
                              name: sub.name, 
                              description: sub.description || '',
                              category_id: sub.category_id 
                            });
                            setEditingSubcategory(sub);
                            setShowSubcategoryModal(true);
                          }}
                          data-testid={`edit-subcategory-${sub.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteSubcategory(sub.id)}
                          data-testid={`delete-subcategory-${sub.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Form Modal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Category Name *</label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="Enter category name"
                data-testid="category-name-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description (Optional)</label>
              <Input
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Enter description"
                data-testid="category-description-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryModal(false)}>Cancel</Button>
            <Button 
              onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
              data-testid="category-submit-btn"
            >
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subcategory Form Modal */}
      <Dialog open={showSubcategoryModal} onOpenChange={setShowSubcategoryModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSubcategory ? 'Edit Subcategory' : 'Add Subcategory'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editingSubcategory && (
              <div>
                <label className="text-sm font-medium mb-2 block">Parent Category *</label>
                <Select 
                  value={subcategoryForm.category_id} 
                  onValueChange={(v) => setSubcategoryForm({ ...subcategoryForm, category_id: v })}
                >
                  <SelectTrigger data-testid="subcategory-parent-select">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-2 block">Subcategory Name *</label>
              <Input
                value={subcategoryForm.name}
                onChange={(e) => setSubcategoryForm({ ...subcategoryForm, name: e.target.value })}
                placeholder="Enter subcategory name"
                data-testid="subcategory-name-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description (Optional)</label>
              <Input
                value={subcategoryForm.description}
                onChange={(e) => setSubcategoryForm({ ...subcategoryForm, description: e.target.value })}
                placeholder="Enter description"
                data-testid="subcategory-description-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubcategoryModal(false)}>Cancel</Button>
            <Button 
              onClick={editingSubcategory ? handleUpdateSubcategory : handleCreateSubcategory}
              data-testid="subcategory-submit-btn"
            >
              {editingSubcategory ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Preview Modal */}
      <Dialog open={!!previewDocument} onOpenChange={() => setPreviewDocument(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 pr-8">
              {previewDocument?.document_type === 'image' && <FileImage className="h-5 w-5 text-green-500" />}
              {previewDocument?.document_type === 'pdf' && <FileText className="h-5 w-5 text-red-500" />}
              {previewDocument?.document_type === 'word' && <FileText className="h-5 w-5 text-blue-500" />}
              <span className="truncate">{previewDocument?.name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="relative flex items-center justify-center bg-black/5 dark:bg-black/20 min-h-[400px] max-h-[70vh] overflow-auto">
            {previewDocument && previewDocument.document_type === 'image' && previewDocument.file_data && (
              <img 
                src={`data:${previewDocument.content_type};base64,${previewDocument.file_data}`}
                alt={previewDocument.name}
                className="max-w-full max-h-[65vh] object-contain rounded shadow-lg m-4"
              />
            )}
            {previewDocument && previewDocument.document_type === 'pdf' && previewDocument.file_data && (
              <embed
                src={`data:application/pdf;base64,${previewDocument.file_data}#toolbar=1&navpanes=1&scrollbar=1`}
                type="application/pdf"
                className="w-full h-[65vh]"
              />
            )}
            {previewDocument && previewDocument.document_type === 'word' && (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <FileText className="h-16 w-16 text-blue-500 mb-4" />
                <p className="text-lg font-medium mb-2">{previewDocument.name}</p>
                <p className="text-muted-foreground mb-4">
                  Word documents cannot be previewed directly in the browser.
                </p>
                <Button onClick={() => handleDownloadDocument(previewDocument)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download to View
                </Button>
              </div>
            )}
            {previewDocument && !['image', 'pdf', 'word'].includes(previewDocument.document_type) && (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">{previewDocument.name}</p>
                <p className="text-muted-foreground mb-4">
                  This file type cannot be previewed. Please download to view.
                </p>
                <Button onClick={() => handleDownloadDocument(previewDocument)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="p-4 pt-2 border-t">
            <Button variant="outline" onClick={() => setPreviewDocument(null)}>
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
            <Button onClick={() => previewDocument && handleDownloadDocument(previewDocument)}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
