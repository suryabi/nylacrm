import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { leadsAPI, activitiesAPI, commentsAPI, usersAPI, accountsAPI, skusAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Phone, Building2, User, MessageSquare, Send, Loader2, ArrowRightCircle, Plus, Trash2, Save, Package, Upload, Download, FileText, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import ActivityTimeline from '../components/ActivityTimeline';
import TimelineSummaryCompact from '../components/TimelineSummaryCompact';
import InvoiceSummaryCard from '../components/InvoiceSummaryCard';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Roles that can approve/reject proposals
const PROPOSAL_APPROVER_ROLES = ['CEO', 'Director', 'Vice President', 'National Sales Head'];

const proposalStatusConfig = {
  pending_review: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  changes_requested: { label: 'Changes Requested', color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
  revised: { label: 'Revised', color: 'bg-blue-100 text-blue-800', icon: Clock },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle }
};

const statusColors = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-green-100 text-green-800',
  not_qualified: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-purple-100 text-purple-800',
  trial_in_progress: 'bg-indigo-100 text-indigo-800',
  proposal_shared: 'bg-orange-100 text-orange-800',
  proposal_approved_by_customer: 'bg-teal-100 text-teal-800',
  won: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-red-100 text-red-800',
  future_followup: 'bg-slate-100 text-slate-800',
};

const getStatusLabel = (status) => {
  const labels = {
    'new': 'New',
    'contacted': 'Contacted',
    'qualified': 'Qualified',
    'not_qualified': 'Not Qualified',
    'in_progress': 'In Progress',
    'trial_in_progress': 'Trial in Progress',
    'proposal_shared': 'Proposal Shared',
    'proposal_approved_by_customer': 'Proposal Approved by Customer',
    'won': 'Won',
    'lost': 'Lost',
    'future_followup': 'Future Follow up'
  };
  return labels[status] || status;
};

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [comments, setComments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  
  // SKU Pricing state
  const [masterSkus, setMasterSkus] = useState([]);
  const [proposedSkuPricing, setProposedSkuPricing] = useState([]);
  const [savingPricing, setSavingPricing] = useState(false);
  const [isEditingPricing, setIsEditingPricing] = useState(false);
  
  // Activity creation state
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityType, setActivityType] = useState('call');
  const [interactionMethod, setInteractionMethod] = useState('phone_call');
  const [activityDescription, setActivityDescription] = useState('');
  const [submittingActivity, setSubmittingActivity] = useState(false);
  const [activityStatus, setActivityStatus] = useState('');
  const [activityFollowUpDate, setActivityFollowUpDate] = useState('');
  const [convertingToAccount, setConvertingToAccount] = useState(false);
  
  // Proposal state
  const [proposal, setProposal] = useState(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [uploadingProposal, setUploadingProposal] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewingProposal, setReviewingProposal] = useState(false);

  useEffect(() => {
    fetchData();
    fetchMasterSkus();
    fetchProposal();
  }, [id]);

  const fetchMasterSkus = async () => {
    try {
      const res = await skusAPI.getMasterList();
      setMasterSkus(res.data.skus || []);
    } catch (error) {
      console.log('Could not load master SKUs');
    }
  };

  const fetchProposal = async () => {
    setProposalLoading(true);
    try {
      const res = await axios.get(`${API_URL}/leads/${id}/proposal`, { withCredentials: true });
      setProposal(res.data.proposal);
    } catch (error) {
      console.log('Could not load proposal');
    } finally {
      setProposalLoading(false);
    }
  };

  const handleProposalUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only PDF and DOC/DOCX files are allowed');
      return;
    }

    // Validate file size (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5 MB limit');
      return;
    }

    setUploadingProposal(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post(`${API_URL}/leads/${id}/proposal`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true
      });

      toast.success(res.data.message || 'Proposal uploaded successfully');
      fetchProposal();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload proposal');
    } finally {
      setUploadingProposal(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleProposalDownload = async () => {
    try {
      const res = await axios.get(`${API_URL}/leads/${id}/proposal/download`, { withCredentials: true });
      const proposalData = res.data.proposal;

      // Decode base64 and create download
      const byteCharacters = atob(proposalData.file_data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: proposalData.content_type });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = proposalData.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Download started');
    } catch (error) {
      toast.error('Failed to download proposal');
    }
  };

  const handleProposalDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this proposal?')) return;

    try {
      await axios.delete(`${API_URL}/leads/${id}/proposal`, { withCredentials: true });
      toast.success('Proposal deleted successfully');
      setProposal(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete proposal');
    }
  };

  const handleProposalReview = async (action) => {
    if (!reviewComment.trim() && action !== 'approved') {
      toast.error('Please provide a comment for your review');
      return;
    }

    setReviewingProposal(true);
    try {
      const res = await axios.put(`${API_URL}/leads/${id}/proposal/review`, {
        action,
        comment: reviewComment
      }, { withCredentials: true });

      toast.success(res.data.message || `Proposal ${action.replace('_', ' ')}`);
      setReviewComment('');
      fetchProposal();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to review proposal');
    } finally {
      setReviewingProposal(false);
    }
  };

  const canApproveProposal = PROPOSAL_APPROVER_ROLES.includes(user?.role);
  const canDeleteProposal = proposal && proposal.uploaded_by === user?.id && proposal.status === 'pending_review';
  // Allow replacing proposal: when no proposal, when changes requested/rejected, when user is uploader, OR when approved (to allow re-submission)
  const canUploadNewProposal = !proposal || ['changes_requested', 'rejected', 'approved'].includes(proposal?.status) || proposal?.uploaded_by === user?.id;

  const fetchData = async () => {
    try {
      const leadRes = await leadsAPI.getById(id);
      setLead(leadRes.data);
      setProposedSkuPricing(leadRes.data.proposed_sku_pricing || []);
      
      const activitiesRes = await activitiesAPI.getByLeadId(id);
      setActivities(activitiesRes.data);
      
      const commentsRes = await commentsAPI.getByLeadId(id);
      setComments(commentsRes.data);
      
      const usersRes = await usersAPI.getAll();
      setUsers(usersRes.data);
      
      // Fetch invoice data
      try {
        const invoiceRes = await axios.get(`${API_URL}/leads/${id}/invoices`, { withCredentials: true });
        setInvoiceData(invoiceRes.data);
      } catch (err) {
        // Invoice data is optional, don't show error
        console.log('No invoice data available');
      }
    } catch (error) {
      toast.error('Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await leadsAPI.update(id, { status: newStatus });
      toast.success('Status updated');
      fetchData();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to update status';
      toast.error(errorMessage);
    }
  };

  const handleFollowUpChange = async (newDate) => {
    try {
      await leadsAPI.update(id, { next_followup_date: newDate });
      toast.success('Next follow-up date updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to update follow-up date');
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      await commentsAPI.create({ lead_id: id, comment: newComment });
      toast.success('Comment added');
      setNewComment('');
      fetchData();
    } catch (error) {
      toast.error('Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!activityDescription.trim()) {
      toast.error('Please enter an activity description');
      return;
    }

    setSubmittingActivity(true);
    try {
      // First log the activity
      await activitiesAPI.create({
        lead_id: id,
        activity_type: activityType,
        description: activityDescription,
        interaction_method: interactionMethod
      });
      
      // Update lead status and follow-up date if provided
      const leadUpdates = {};
      if (activityStatus) {
        leadUpdates.status = activityStatus;
      }
      if (activityFollowUpDate) {
        leadUpdates.next_followup_date = activityFollowUpDate;
      }
      
      if (Object.keys(leadUpdates).length > 0) {
        await leadsAPI.update(id, leadUpdates);
      }
      
      toast.success('Activity logged successfully');
      setActivityDescription('');
      setActivityStatus('');
      setActivityFollowUpDate('');
      setShowActivityForm(false);
      fetchData();
    } catch (error) {
      console.error('Activity error:', error);
      const errorMessage = error.response?.data?.detail 
        || error.response?.data?.message 
        || error.message 
        || 'Failed to add activity. Please try again.';
      toast.error(errorMessage, {
        description: 'Unable to log activity',
        duration: 6000
      });
    } finally {
      setSubmittingActivity(false);
    }
  };

  const handleConvertToAccount = async () => {
    if (!lead || lead.status !== 'won') {
      toast.error('Only won leads can be converted to accounts');
      return;
    }
    
    setConvertingToAccount(true);
    try {
      const response = await accountsAPI.convertFromLead(lead.id);
      toast.success(`Account created: ${response.data.account_id}`);
      navigate(`/accounts/${response.data.account_id}`);
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to convert lead to account';
      toast.error(message);
    } finally {
      setConvertingToAccount(false);
    }
  };

  // SKU Pricing handlers
  const handleAddProposedSKU = () => {
    setProposedSkuPricing([...proposedSkuPricing, { sku: '', price_per_unit: 0, return_bottle_credit: 0 }]);
    setIsEditingPricing(true);
  };

  const handleRemoveProposedSKU = (index) => {
    setProposedSkuPricing(proposedSkuPricing.filter((_, i) => i !== index));
  };

  const handleProposedSKUChange = (index, field, value) => {
    const updated = [...proposedSkuPricing];
    updated[index] = { ...updated[index], [field]: field === 'sku' ? value : parseFloat(value) || 0 };
    setProposedSkuPricing(updated);
  };

  const handleSaveProposedPricing = async () => {
    setSavingPricing(true);
    try {
      await leadsAPI.update(id, { proposed_sku_pricing: proposedSkuPricing });
      toast.success('Proposed SKU pricing saved');
      setIsEditingPricing(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to save pricing');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleCancelPricingEdit = () => {
    setProposedSkuPricing(lead.proposed_sku_pricing || []);
    setIsEditingPricing(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  if (!lead) {
    return <div className="text-center py-12">Lead not found</div>;
  }

  const isWonLead = lead.status === 'won' || lead.status === 'closed_won';
  const canConvert = isWonLead && !lead.converted_to_account;

  const assignedUser = users.find(u => u.id === lead.assigned_to);

  return (
    <div className="space-y-6" data-testid="lead-detail-page">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/leads')} data-testid="back-button">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold">{lead.company}</h1>
            {lead.category && (
              <Badge variant="outline" className="text-sm capitalize">
                {lead.category}
              </Badge>
            )}
          </div>
          {lead.lead_id && (
            <p className="text-sm font-mono text-muted-foreground mt-1" data-testid="lead-unique-id">
              ID: {lead.lead_id}
            </p>
          )}
          {lead.contact_person && (
            <p className="text-muted-foreground mt-1">Contact: {lead.contact_person}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canConvert && (
            <Button
              onClick={handleConvertToAccount}
              disabled={convertingToAccount}
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="convert-to-account-btn"
            >
              {convertingToAccount ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Converting...</>
              ) : (
                <><ArrowRightCircle className="h-4 w-4 mr-2" /> Convert to Account</>
              )}
            </Button>
          )}
          {lead.converted_to_account && lead.account_id && (
            <Button
              onClick={() => navigate(`/accounts/${lead.account_id}`)}
              variant="outline"
              className="border-emerald-500 text-emerald-700"
              data-testid="view-account-btn"
            >
              <Building2 className="h-4 w-4 mr-2" /> View Account
            </Button>
          )}
          <Button onClick={() => navigate(`/leads/${id}/edit`)} data-testid="edit-lead-button">
            Edit Lead
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Lead Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Timeline Summary - Moved to Top */}
          <TimelineSummaryCompact activities={activities} />

          {/* Contact Information */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Company</p>
                  <p className="font-medium">{lead.company}</p>
                </div>
              </div>
              {lead.contact_person && (
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Contact Person</p>
                    <p className="font-medium">{lead.contact_person}</p>
                  </div>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{lead.email}</p>
                  </div>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{lead.phone}</p>
                  </div>
                </div>
              )}
              {assignedUser && (
                <div className="flex items-center gap-3 md:col-span-2">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned To</p>
                    <p className="font-medium">{assignedUser.name} - {assignedUser.territory}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Location Information */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Location</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lead.city && (
                <div>
                  <p className="text-sm text-muted-foreground">City</p>
                  <p className="font-medium">{lead.city}</p>
                </div>
              )}
              {lead.state && (
                <div>
                  <p className="text-sm text-muted-foreground">State</p>
                  <p className="font-medium">{lead.state}</p>
                </div>
              )}
              {lead.country && (
                <div>
                  <p className="text-sm text-muted-foreground">Country</p>
                  <p className="font-medium">{lead.country}</p>
                </div>
              )}
              {lead.region && (
                <div>
                  <p className="text-sm text-muted-foreground">Region</p>
                  <p className="font-medium">{lead.region}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Current Brand Details */}
          {(lead.current_water_brand || lead.current_volume || lead.current_landing_price || lead.current_selling_price) && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Current Brand Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lead.current_water_brand && (
                  <div>
                    <p className="text-sm text-muted-foreground">Current Water Brand</p>
                    <p className="font-medium">{lead.current_water_brand}</p>
                  </div>
                )}
                {lead.current_volume && (
                  <div>
                    <p className="text-sm text-muted-foreground">Current Volume</p>
                    <p className="font-medium">{lead.current_volume}</p>
                  </div>
                )}
                {lead.current_landing_price && (
                  <div>
                    <p className="text-sm text-muted-foreground">Current Landing Price</p>
                    <p className="font-medium">₹{lead.current_landing_price}</p>
                  </div>
                )}
                {lead.current_selling_price && (
                  <div>
                    <p className="text-sm text-muted-foreground">Current Selling Price</p>
                    <p className="font-medium">₹{lead.current_selling_price}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Nyla Interest */}
          {lead.interested_skus && lead.interested_skus.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Interested Nyla SKUs</h2>
              <div className="flex flex-wrap gap-2">
                {lead.interested_skus.slice(0, 10).map((sku) => (
                  <Badge key={sku} className="bg-primary/10 text-primary">
                    {sku}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Proposed SKU Pricing */}
          <Card className="p-6" data-testid="proposed-sku-pricing-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Package className="h-5 w-5" />
                Proposed SKU Pricing
              </h2>
              <div className="flex items-center gap-2">
                {isEditingPricing ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelPricingEdit}
                      data-testid="cancel-pricing-btn"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveProposedPricing}
                      disabled={savingPricing}
                      data-testid="save-pricing-btn"
                    >
                      {savingPricing ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving</>
                      ) : (
                        <><Save className="h-4 w-4 mr-1" /> Save</>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditingPricing(true)}
                    data-testid="edit-pricing-btn"
                  >
                    Edit Pricing
                  </Button>
                )}
                {isEditingPricing && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddProposedSKU}
                    data-testid="add-proposed-sku-btn"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add SKU
                  </Button>
                )}
              </div>
            </div>
            
            {proposedSkuPricing.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No proposed SKU pricing yet</p>
                <p className="text-sm mt-1">Add pricing to share proposals with this lead</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddProposedSKU}
                  className="mt-3"
                  data-testid="add-first-sku-btn"
                >
                  <Plus className="h-4 w-4 mr-1" /> Add First SKU
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" data-testid="proposed-sku-table">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-sm font-medium">SKU</th>
                      <th className="text-left px-3 py-2 text-sm font-medium">Price/Unit (₹)</th>
                      <th className="text-left px-3 py-2 text-sm font-medium">Bottle Credit (₹)</th>
                      {isEditingPricing && <th className="w-10"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {proposedSkuPricing.map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">
                          {isEditingPricing ? (
                            <Select
                              value={item.sku}
                              onValueChange={(val) => handleProposedSKUChange(index, 'sku', val)}
                            >
                              <SelectTrigger className="w-[200px]" data-testid={`proposed-sku-select-${index}`}>
                                <SelectValue placeholder="Select SKU" />
                              </SelectTrigger>
                              <SelectContent>
                                {masterSkus.map((skuItem) => (
                                  <SelectItem key={skuItem.sku} value={skuItem.sku}>
                                    {skuItem.sku}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="font-medium">{item.sku}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditingPricing ? (
                            <Input
                              type="number"
                              value={item.price_per_unit}
                              onChange={(e) => handleProposedSKUChange(index, 'price_per_unit', e.target.value)}
                              className="w-24"
                              data-testid={`proposed-price-input-${index}`}
                            />
                          ) : (
                            <span>₹{item.price_per_unit?.toLocaleString()}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditingPricing ? (
                            <Input
                              type="number"
                              value={item.return_bottle_credit}
                              onChange={(e) => handleProposedSKUChange(index, 'return_bottle_credit', e.target.value)}
                              className="w-24"
                              data-testid={`proposed-credit-input-${index}`}
                            />
                          ) : (
                            <span>₹{item.return_bottle_credit?.toLocaleString()}</span>
                          )}
                        </td>
                        {isEditingPricing && (
                          <td className="px-3 py-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRemoveProposedSKU(index)}
                              className="h-8 w-8 text-red-500 hover:text-red-700"
                              data-testid={`remove-proposed-sku-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Lead Status - Display Only */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Lead Status</h2>
            <div className="flex items-center gap-4 mb-4">
              <Badge className={`${statusColors[lead.status]} text-sm px-3 py-1`}>
                {getStatusLabel(lead.status)}
              </Badge>
            </div>
            
            {lead.next_followup_date && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">Next Follow-up</p>
                <p className="font-medium">
                  {format(new Date(lead.next_followup_date), 'MMM d, yyyy')}
                </p>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground mt-4">
              Update status and follow-up date when logging activities
            </p>
          </Card>

          {/* Invoice Summary */}
          <InvoiceSummaryCard invoiceData={invoiceData} />

          {/* Comments */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Comments
            </h2>
            <div className="space-y-4 mb-6">
              {comments.length === 0 && (
                <p className="text-muted-foreground text-sm">No comments yet</p>
              )}
              {comments.length > 0 && comments.slice(0, 20).map((comment) => {
                const commenter = users.find(u => u.id === comment.created_by);
                const commenterName = commenter ? commenter.name : 'Unknown';
                return (
                  <div key={comment.id} className="bg-muted/50 p-4 rounded-lg" data-testid={`comment-${comment.id}`}>
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-medium text-sm">{commenterName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(comment.created_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                    <p className="text-sm">{comment.comment}</p>
                  </div>
                );
              })}
            </div>
            <form onSubmit={handleAddComment} className="space-y-3">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                data-testid="comment-input"
              />
              <Button type="submit" disabled={submittingComment || !newComment.trim()} data-testid="add-comment-button">
                <Send className="h-4 w-4 mr-2" />
                Add Comment
              </Button>
            </form>
          </Card>
        </div>

        {/* Right Column - Activity Timeline */}
        <div className="space-y-6">
          {/* Add Activity Button */}
          <Card className="p-6">
            <Button
              onClick={() => setShowActivityForm(!showActivityForm)}
              variant={showActivityForm ? 'outline' : 'default'}
              className="w-full"
              data-testid="toggle-activity-form"
            >
              {showActivityForm ? 'Cancel' : '+ Log Activity'}
            </Button>
          </Card>

          {/* Activity Form */}
          {showActivityForm && (
            <Card className="p-6">
              <h3 className="text-sm font-semibold mb-4">Log New Activity</h3>
              <form onSubmit={handleAddActivity} className="space-y-4">
                <div className="space-y-2">
                  <Label>Interaction Method *</Label>
                  <Select value={interactionMethod} onValueChange={(value) => {
                    setInteractionMethod(value);
                    // Auto-set activity type based on interaction method
                    if (value === 'phone_call') setActivityType('call');
                    else if (value === 'customer_visit') setActivityType('visit');
                    else if (value === 'email') setActivityType('email');
                    else if (value === 'whatsapp' || value === 'sms') setActivityType('call');
                    else setActivityType('note');
                  }}>
                    <SelectTrigger data-testid="interaction-method-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone_call">📞 Phone Call</SelectItem>
                      <SelectItem value="customer_visit">🚗 Customer Visit</SelectItem>
                      <SelectItem value="email">✉️ Email</SelectItem>
                      <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                      <SelectItem value="sms">📱 SMS</SelectItem>
                      <SelectItem value="other">📝 Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description *</Label>
                  <Textarea
                    value={activityDescription}
                    onChange={(e) => setActivityDescription(e.target.value)}
                    placeholder="Describe what happened during this interaction..."
                    rows={4}
                    required
                    data-testid="activity-description-input"
                  />
                </div>
                
                {/* Status Update */}
                <div className="space-y-2 pt-2 border-t">
                  <Label>Update Lead Status</Label>
                  <Select value={activityStatus || "keep_current"} onValueChange={(val) => setActivityStatus(val === "keep_current" ? "" : val)}>
                    <SelectTrigger data-testid="activity-status-select">
                      <SelectValue placeholder="Keep current status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep_current">Keep current status</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="not_qualified">Not Qualified</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="trial_in_progress">Trial in Progress</SelectItem>
                      <SelectItem value="proposal_shared">Proposal Shared</SelectItem>
                      <SelectItem value="proposal_approved_by_customer">Proposal Approved by Customer</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                      <SelectItem value="future_followup">Future Follow up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Follow-up Date */}
                <div className="space-y-2">
                  <Label>Next Follow-up Date</Label>
                  <Input
                    type="date"
                    value={activityFollowUpDate}
                    onChange={(e) => setActivityFollowUpDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    data-testid="activity-followup-date"
                  />
                </div>
                
                <Button type="submit" className="w-full h-12" disabled={submittingActivity} data-testid="submit-activity-button">
                  {submittingActivity ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Log Activity'}
                </Button>
              </form>
            </Card>
          )}

          {/* Proposal Section */}
          <Card className="p-6" data-testid="proposal-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Proposal</h2>
              {proposal && (
                <Badge className={proposalStatusConfig[proposal.status]?.color || 'bg-gray-100'}>
                  {proposalStatusConfig[proposal.status]?.label || proposal.status}
                </Badge>
              )}
            </div>

            {proposalLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !proposal ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground mb-4">No proposal uploaded yet</p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                    onChange={handleProposalUpload}
                    disabled={uploadingProposal}
                    data-testid="proposal-upload-input"
                  />
                  <Button asChild disabled={uploadingProposal}>
                    <span>
                      {uploadingProposal ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
                      ) : (
                        <><Upload className="mr-2 h-4 w-4" /> Upload Proposal</>
                      )}
                    </span>
                  </Button>
                </label>
                <p className="text-xs text-muted-foreground mt-2">PDF or DOC/DOCX (Max 5 MB)</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Proposal File Info */}
                <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                  <FileText className="h-10 w-10 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{proposal.file_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Version {proposal.version} • {(proposal.file_size / 1024).toFixed(1)} KB
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Uploaded by {proposal.uploaded_by_name} on {format(new Date(proposal.uploaded_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleProposalDownload}
                      data-testid="proposal-download-btn"
                    >
                      <Download className="h-4 w-4 mr-1" /> Download
                    </Button>
                    {canDeleteProposal && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={handleProposalDelete}
                        data-testid="proposal-delete-btn"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Review Comments History */}
                {proposal.review_comments && proposal.review_comments.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Review History</p>
                    {proposal.review_comments.map((comment, idx) => {
                      const StatusIcon = proposalStatusConfig[comment.action]?.icon || MessageSquare;
                      return (
                        <div key={comment.id || idx} className="flex gap-3 p-3 border rounded-lg">
                          <StatusIcon className={`h-5 w-5 flex-shrink-0 ${
                            comment.action === 'approved' ? 'text-green-600' :
                            comment.action === 'rejected' ? 'text-red-600' :
                            comment.action === 'changes_requested' ? 'text-orange-600' : 'text-muted-foreground'
                          }`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{comment.reviewer_name}</span>
                              <Badge variant="outline" className="text-xs capitalize">
                                {comment.action.replace('_', ' ')}
                              </Badge>
                            </div>
                            {comment.comment && (
                              <p className="text-sm text-muted-foreground mt-1">{comment.comment}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(comment.created_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Review Actions (for approvers) */}
                {canApproveProposal && ['pending_review', 'revised'].includes(proposal.status) && (
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-medium">Review Proposal</p>
                    <Textarea
                      placeholder="Add comments or suggested changes..."
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={3}
                      data-testid="review-comment-input"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleProposalReview('approved')}
                        disabled={reviewingProposal}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="proposal-approve-btn"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleProposalReview('changes_requested')}
                        disabled={reviewingProposal || !reviewComment.trim()}
                        className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        data-testid="proposal-changes-btn"
                      >
                        <AlertCircle className="h-4 w-4 mr-1" /> Request Changes
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleProposalReview('rejected')}
                        disabled={reviewingProposal || !reviewComment.trim()}
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        data-testid="proposal-reject-btn"
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                )}

                {/* Upload New/Revised Proposal */}
                {canUploadNewProposal && (
                  <div className="border-t pt-4">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx"
                        onChange={handleProposalUpload}
                        disabled={uploadingProposal}
                        data-testid="proposal-reupload-input"
                      />
                      <Button variant="outline" asChild disabled={uploadingProposal}>
                        <span>
                          {uploadingProposal ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
                          ) : (
                            <><Upload className="mr-2 h-4 w-4" /> 
                              {proposal.status === 'changes_requested' ? 'Upload Revised Proposal' : 
                               proposal.status === 'approved' ? 'Upload New Proposal (will require re-approval)' : 
                               'Replace Proposal'}
                            </>
                          )}
                        </span>
                      </Button>
                    </label>
                    {proposal.status === 'approved' && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Uploading a new proposal will reset the approval status and require a new review cycle.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Activity Timeline</h2>
            <ActivityTimeline activities={activities} />
          </Card>

          {/* Lead Details */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Lead Details</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Source</p>
                <p className="font-medium capitalize">{lead.source || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Priority</p>
                <Badge variant="outline" className="capitalize">{lead.priority}</Badge>
              </div>
              {lead.estimated_value && (
                <div>
                  <p className="text-muted-foreground">Estimated Value</p>
                  <p className="font-medium">₹{lead.estimated_value.toLocaleString()}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">{format(new Date(lead.created_at), 'MMM d, yyyy')}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
