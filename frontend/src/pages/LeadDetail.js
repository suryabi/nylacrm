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
import { ArrowLeft, Mail, Phone, Building2, User, MessageSquare, Send, Loader2, ArrowRightCircle, Plus, Trash2, Save, Package, Upload, Download, FileText, CheckCircle, XCircle, Clock, AlertCircle, ImageIcon, Share2, Maximize2, Minimize2, X, Eye, FileIcon, Camera, Flame, Snowflake, ThermometerSun } from 'lucide-react';
import { format } from 'date-fns';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import ActivityTimeline from '../components/ActivityTimeline';
import TimelineSummaryCompact from '../components/TimelineSummaryCompact';
import InvoiceSummaryCard from '../components/InvoiceSummaryCard';
import LogoUploader from '../components/LogoUploader';
import ExpenseRequestSection from '../components/ExpenseRequestSection';
import { useLeadStatuses } from '../hooks/useLeadStatuses';
import CelebrationAnimation from '../components/CelebrationAnimation';
import AppBreadcrumb from '../components/AppBreadcrumb';
import { useNavigation } from '../context/NavigationContext';
import OpportunityEstimation from '../components/OpportunityEstimation';
import { useTenantConfig } from '../context/TenantConfigContext';
import LeadScoringCard from '../components/LeadScoringCard';
import LeadGroupCard from '../components/LeadGroupCard';

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

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { statuses, getStatusLabel, getStatusColor } = useLeadStatuses();
  const { updateCurrentLabel } = useNavigation();
  const { hasIndustryFeature, tenantConfig, industry, branding, loading: configLoading } = useTenantConfig();
  
  // Check if Opportunity Estimation should be shown
  // Check ALL possible locations for industry_type
  const industryType = 
    tenantConfig?.industry?.industry_type ||  // From nested config
    industry?.industry_type ||                 // From context state
    tenantConfig?.industry_type ||             // Direct on config
    'generic';
  
  const isWaterBrand = industryType === 'water_brand';
  const hasBottleFeature = hasIndustryFeature('lead_bottle_tracking');
  const showOpportunityEstimation = isWaterBrand || hasBottleFeature;
  
  // Debug logging
  console.log('🔍 LeadDetail Opportunity Check:', {
    configLoading,
    industryType,
    isWaterBrand,
    hasBottleFeature,
    showOpportunityEstimation,
    tenantConfigExists: !!tenantConfig,
    tenantConfigIndustry: tenantConfig?.industry,
    industryState: industry
  });

  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [comments, setComments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  
  // Check if user is admin (CEO or Director)
  const isAdmin = user?.role === 'CEO' || user?.role === 'Director';
  
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
  const [activityDate, setActivityDate] = useState(''); // Admin-only: backdate activity
  const [convertingToAccount, setConvertingToAccount] = useState(false);
  const [generatingLeadId, setGeneratingLeadId] = useState(false);
  
  // Lead Group state for copying activities
  const [linkedLeads, setLinkedLeads] = useState([]);
  const [selectedLinkedLeads, setSelectedLinkedLeads] = useState([]);
  const [loadingLinkedLeads, setLoadingLinkedLeads] = useState(false);
  
  // Logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = React.useRef(null);
  
  // Proposal state
  const [proposal, setProposal] = useState(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [uploadingProposal, setUploadingProposal] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewingProposal, setReviewingProposal] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfViewerData, setPdfViewerData] = useState(null);
  const [loadingPdfViewer, setLoadingPdfViewer] = useState(false);
  
  // Email share dialog state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmailTo, setShareEmailTo] = useState([]);
  const [shareEmailCc, setShareEmailCc] = useState([]);
  const [shareEmailBcc, setShareEmailBcc] = useState([]);
  const [shareEmailToInput, setShareEmailToInput] = useState('');
  const [shareEmailCcInput, setShareEmailCcInput] = useState('');
  const [shareEmailBccInput, setShareEmailBccInput] = useState('');
  const [shareEmailSubject, setShareEmailSubject] = useState('Nyla Air Water - Proposal for review');
  const [shareEmailMessage, setShareEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [isEmailComposerExpanded, setIsEmailComposerExpanded] = useState(false);
  
  // Celebration animation state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationType, setCelebrationType] = useState('won'); // 'won' or 'customer'

  // Celebration trigger statuses (lowercase for comparison)
  const CELEBRATION_STATUSES = ['won', 'closed_won', 'active_customer'];

  useEffect(() => {
    fetchData();
    fetchMasterSkus();
    fetchProposal();
    fetchLinkedLeads();
  }, [id]);

  const fetchLinkedLeads = async () => {
    setLoadingLinkedLeads(true);
    try {
      const res = await axios.get(`${API_URL}/leads/${id}/group`, { withCredentials: true });
      const allLinked = [
        ...(res.data.parent_lead ? [res.data.parent_lead] : []),
        ...(res.data.child_leads || []),
        ...(res.data.peer_leads || [])
      ];
      setLinkedLeads(allLinked);
    } catch (error) {
      console.log('Could not load linked leads');
    } finally {
      setLoadingLinkedLeads(false);
    }
  };

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

  // Get proposal file type from filename
  const getProposalFileType = (fileName) => {
    if (!fileName) return 'unknown';
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'word';
    return 'unknown';
  };

  // Open PDF viewer
  const handleOpenPdfViewer = async () => {
    if (!proposal) return;
    
    setLoadingPdfViewer(true);
    try {
      const res = await axios.get(`${API_URL}/leads/${id}/proposal/download`, { withCredentials: true });
      const proposalData = res.data.proposal;
      setPdfViewerData(proposalData);
      setShowPdfViewer(true);
    } catch (error) {
      toast.error('Failed to load PDF for viewing');
    } finally {
      setLoadingPdfViewer(false);
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

  // Open share dialog and pre-populate fields
  const openShareDialog = async () => {
    // Pre-populate with user's email as sender context
    setShareEmailTo([]);
    setShareEmailToInput('');
    setShareEmailCcInput('');
    setShareEmailBccInput('');
    setShareEmailBcc([]);
    setShareEmailSubject('Nyla Air Water - Proposal for review');
    setIsEmailComposerExpanded(false);
    
    // Generate default email body with signature
    const companyName = lead?.company || 'your company';
    const firstName = user?.name?.split(' ')[0] || '';
    const lastName = user?.name?.split(' ').slice(1).join(' ') || '';
    const userPhone = user?.phone || '';
    const userEmail = user?.email || '';
    
    const defaultBody = `Dear Sir/Madam,

Please find attached the proposal for ${companyName}. We look forward to your feedback and the opportunity to serve you.

If you have any questions or need further information, please feel free to reach out.

Best Regards,
${firstName} ${lastName}
${userPhone}
${userEmail}`;
    
    setShareEmailMessage(defaultBody);
    
    // Fetch reporting manager's email for CC
    try {
      const res = await axios.get(`${API_URL}/users/${user.id}/reporting-manager`, { withCredentials: true });
      if (res.data.manager?.email) {
        setShareEmailCc([res.data.manager.email]);
      } else {
        setShareEmailCc([]);
      }
    } catch (error) {
      console.log('Could not fetch reporting manager');
      setShareEmailCc([]);
    }
    
    setShowShareDialog(true);
  };

  // Email chip handling functions
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  const addEmailChip = (type, value) => {
    const email = value.trim().replace(/,$/g, '');
    if (!email || !emailRegex.test(email)) return false;
    
    if (type === 'to' && !shareEmailTo.includes(email)) {
      setShareEmailTo([...shareEmailTo, email]);
      setShareEmailToInput('');
      return true;
    } else if (type === 'cc' && !shareEmailCc.includes(email)) {
      setShareEmailCc([...shareEmailCc, email]);
      setShareEmailCcInput('');
      return true;
    } else if (type === 'bcc' && !shareEmailBcc.includes(email)) {
      setShareEmailBcc([...shareEmailBcc, email]);
      setShareEmailBccInput('');
      return true;
    }
    return false;
  };
  
  const removeEmailChip = (type, email) => {
    if (type === 'to') {
      setShareEmailTo(shareEmailTo.filter(e => e !== email));
    } else if (type === 'cc') {
      setShareEmailCc(shareEmailCc.filter(e => e !== email));
    } else if (type === 'bcc') {
      setShareEmailBcc(shareEmailBcc.filter(e => e !== email));
    }
  };
  
  const handleEmailInputKeyDown = (type, e, value) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmailChip(type, value);
    } else if (e.key === 'Backspace' && !value) {
      // Remove last chip if input is empty and backspace is pressed
      if (type === 'to' && shareEmailTo.length > 0) {
        setShareEmailTo(shareEmailTo.slice(0, -1));
      } else if (type === 'cc' && shareEmailCc.length > 0) {
        setShareEmailCc(shareEmailCc.slice(0, -1));
      } else if (type === 'bcc' && shareEmailBcc.length > 0) {
        setShareEmailBcc(shareEmailBcc.slice(0, -1));
      }
    }
  };
  
  const handleEmailInputChange = (type, value) => {
    // Check if user pasted or typed a comma
    if (value.includes(',')) {
      const email = value.replace(/,/g, '').trim();
      if (email) {
        addEmailChip(type, email);
      }
      return;
    }
    
    if (type === 'to') setShareEmailToInput(value);
    else if (type === 'cc') setShareEmailCcInput(value);
    else if (type === 'bcc') setShareEmailBccInput(value);
  };

  // Send proposal via email
  const handleSendProposalEmail = async () => {
    // Add any pending input to the chips before sending
    if (shareEmailToInput.trim()) {
      addEmailChip('to', shareEmailToInput);
    }
    if (shareEmailCcInput.trim()) {
      addEmailChip('cc', shareEmailCcInput);
    }
    if (shareEmailBccInput.trim()) {
      addEmailChip('bcc', shareEmailBccInput);
    }
    
    // Use the arrays directly
    const toEmails = [...shareEmailTo];
    if (shareEmailToInput.trim() && emailRegex.test(shareEmailToInput.trim())) {
      toEmails.push(shareEmailToInput.trim());
    }
    
    if (toEmails.length === 0) {
      toast.error('Please enter at least one recipient email address');
      return;
    }
    
    const ccEmails = [...shareEmailCc];
    if (shareEmailCcInput.trim() && emailRegex.test(shareEmailCcInput.trim())) {
      ccEmails.push(shareEmailCcInput.trim());
    }
    
    const bccEmails = [...shareEmailBcc];
    if (shareEmailBccInput.trim() && emailRegex.test(shareEmailBccInput.trim())) {
      bccEmails.push(shareEmailBccInput.trim());
    }
    
    setSendingEmail(true);
    try {
      const res = await axios.post(`${API_URL}/leads/${id}/proposal/share-email`, {
        to_emails: toEmails,
        cc_emails: ccEmails,
        bcc_emails: bccEmails,
        subject: shareEmailSubject,
        message: shareEmailMessage
      }, { withCredentials: true });
      
      toast.success(res.data.message || 'Proposal sent successfully!');
      setShowShareDialog(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send email');
    } finally {
      setSendingEmail(false);
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
      
      // Update breadcrumb with lead name
      if (leadRes.data.company || leadRes.data.company_name) {
        updateCurrentLabel(leadRes.data.company || leadRes.data.company_name);
      }
      
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
    const previousStatus = lead?.status;
    try {
      await leadsAPI.update(id, { status: newStatus });
      toast.success('Status updated successfully');
      
      // Check if we should trigger celebration
      const isNewStatusCelebration = CELEBRATION_STATUSES.includes(newStatus.toLowerCase());
      const wasPreviouslyCelebration = previousStatus && CELEBRATION_STATUSES.includes(previousStatus.toLowerCase());
      
      // Only celebrate if moving TO a celebration status (not already in one)
      if (isNewStatusCelebration && !wasPreviouslyCelebration) {
        setCelebrationType(newStatus.toLowerCase().includes('customer') ? 'customer' : 'won');
        setShowCelebration(true);
      }
      
      fetchData();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to update status';
      toast.error(errorMessage, {
        description: 'Status change was not saved',
        duration: 6000
      });
    }
  };

  const handleTemperatureChange = async (newTemperature) => {
    try {
      await leadsAPI.update(id, { temperature: newTemperature });
      setLead(prev => ({ ...prev, temperature: newTemperature }));
      toast.success(`Lead marked as ${newTemperature}`);
    } catch (error) {
      toast.error('Failed to update temperature');
    }
  };

  const handleFollowUpChange = async (newDate) => {
    try {
      await leadsAPI.update(id, { next_followup_date: newDate });
      toast.success('Next follow-up date updated');
      fetchData();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to update follow-up date';
      toast.error(errorMessage, {
        description: 'Please try again or contact support'
      });
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) {
      toast.error('Please enter a comment');
      return;
    }

    setSubmittingComment(true);
    try {
      await commentsAPI.create({ lead_id: id, comment: newComment });
      toast.success('Comment added');
      setNewComment('');
      fetchData();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to add comment';
      toast.error(errorMessage, {
        description: 'Unable to save comment'
      });
    } finally {
      setSubmittingComment(false);
    }
  };

  // Handle logo upload
  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }
    
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      
      await axios.post(`${API_URL}/leads/${id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true
      });
      
      toast.success('Logo updated successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      // Reset file input
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!activityDescription.trim()) {
      toast.error('Please enter an activity description');
      return;
    }

    const previousStatus = lead?.status;
    setSubmittingActivity(true);
    try {
      // Build the activity payload with optional status change and follow-up
      const activityPayload = {
        lead_id: id,
        activity_type: activityType,
        description: activityDescription,
        interaction_method: interactionMethod
      };
      
      // Include status change if provided
      if (activityStatus && activityStatus !== 'keep_current') {
        activityPayload.new_status = activityStatus;
      }
      
      // Include follow-up date if provided
      if (activityFollowUpDate) {
        activityPayload.next_followup_date = activityFollowUpDate;
      }
      
      // Admin can set a custom activity date
      if (activityDate && isAdmin) {
        activityPayload.created_at = new Date(activityDate + 'T12:00:00Z').toISOString();
      }
      
      // Include linked leads to copy activity to
      if (selectedLinkedLeads.length > 0) {
        activityPayload.copy_to_lead_ids = selectedLinkedLeads;
      }
      
      // Single API call handles everything: activity logging + status update + follow-up + copy to linked leads
      await activitiesAPI.create(activityPayload);
      
      // Check if we should trigger celebration
      if (activityStatus && activityStatus !== 'keep_current') {
        const isNewStatusCelebration = CELEBRATION_STATUSES.includes(activityStatus.toLowerCase());
        const wasPreviouslyCelebration = previousStatus && CELEBRATION_STATUSES.includes(previousStatus.toLowerCase());
        
        if (isNewStatusCelebration && !wasPreviouslyCelebration) {
          setCelebrationType(activityStatus.toLowerCase().includes('customer') ? 'customer' : 'won');
          setShowCelebration(true);
        }
      }
      
      const copiedMsg = selectedLinkedLeads.length > 0 ? ` (copied to ${selectedLinkedLeads.length} linked leads)` : '';
      toast.success(`Activity logged successfully${copiedMsg}`);
      setActivityDescription('');
      setActivityStatus('');
      setActivityFollowUpDate('');
      setActivityDate('');
      setSelectedLinkedLeads([]);
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
    
    // Validate proposed SKU pricing is filled
    const skuPricing = lead.proposed_sku_pricing || proposedSkuPricing || [];
    if (!skuPricing || skuPricing.length === 0) {
      toast.error('Please add at least one SKU with pricing before converting to account');
      return;
    }
    
    // Check if any SKU has empty or invalid data
    const hasInvalidSKU = skuPricing.some(sku => 
      !sku.sku || 
      sku.sku.trim() === '' ||
      (sku.proposed_price === undefined && sku.price_per_unit === undefined) ||
      ((sku.proposed_price || sku.price_per_unit || 0) <= 0)
    );
    
    if (hasInvalidSKU) {
      toast.error('Please ensure all SKUs have a valid name and price greater than 0');
      return;
    }
    
    setConvertingToAccount(true);
    try {
      const response = await accountsAPI.convertFromLead(lead.id);
      
      // Trigger celebration for customer activation
      setCelebrationType('customer');
      setShowCelebration(true);
      
      // Wait for celebration to show briefly before navigating
      setTimeout(() => {
        toast.success(`Account created: ${response.data.account_id}`);
        navigate(`/accounts/${response.data.account_id}`);
      }, 1500);
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to convert lead to account';
      toast.error(message);
      setConvertingToAccount(false);
    }
  };

  const handleGenerateLeadId = async () => {
    setGeneratingLeadId(true);
    try {
      const response = await leadsAPI.generateLeadId(id);
      toast.success(response.data.message);
      // Refresh lead data
      const leadRes = await leadsAPI.getById(id);
      setLead(leadRes.data);
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to generate Lead ID';
      toast.error(message);
    } finally {
      setGeneratingLeadId(false);
    }
  };

  // SKU Pricing handlers
  const handleAddProposedSKU = () => {
    setProposedSkuPricing([...proposedSkuPricing, { sku: '', percentage: 0, price_per_unit: 0, return_bottle_credit: 0 }]);
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

  // Calculate SKU quantities and revenue based on opportunity estimation
  const getMonthlyBottles = () => {
    const estimation = lead?.opportunity_estimation;
    if (!estimation) return 0;
    return estimation.final_monthly || estimation.calculated_monthly || 0;
  };

  const calculateSkuMetrics = (sku) => {
    const monthlyBottles = getMonthlyBottles();
    const percentage = sku.percentage || 0;
    const estimatedQty = Math.round((monthlyBottles * percentage) / 100);
    const revenue = estimatedQty * (sku.price_per_unit || 0);
    return { estimatedQty, revenue };
  };

  const getTotalPercentage = () => {
    return proposedSkuPricing.reduce((sum, sku) => sum + (sku.percentage || 0), 0);
  };

  const getEstimatedMonthlyOpportunity = () => {
    return proposedSkuPricing.reduce((sum, sku) => {
      const { revenue } = calculateSkuMetrics(sku);
      return sum + revenue;
    }, 0);
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
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-0" data-testid="lead-detail-page">
      {/* Breadcrumb */}
      <AppBreadcrumb />
      
      {/* Header - Mobile Optimized */}
      <div className="flex items-start gap-2 sm:gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/leads')} data-testid="back-button" className="h-8 w-8 sm:h-10 sm:w-10 shrink-0">
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
        
        {/* Logo Display - Smaller on mobile */}
        <div className="shrink-0 relative group">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
            id="logo-upload-input"
          />
          <label 
            htmlFor="logo-upload-input" 
            className="cursor-pointer block"
            title="Click to upload/change logo"
          >
            {lead.logo_url ? (
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg border-2 border-primary/20 overflow-hidden bg-white shadow-sm relative group-hover:border-primary/50 transition-all">
                <img 
                  src={`${process.env.REACT_APP_BACKEND_URL}${lead.logo_url}`}
                  alt={`${lead.company} logo`}
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/20 group-hover:border-primary/50 group-hover:bg-primary/5 transition-all">
                {uploadingLogo ? (
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground/50 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground/50 group-hover:text-primary/70" />
                )}
              </div>
            )}
          </label>
          {uploadingLogo && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Company name and badges */}
          <div className="flex items-start sm:items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-semibold truncate">{lead.company}</h1>
            <Badge 
              className={`${getStatusColor(lead.status)} text-[10px] sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1 font-medium shrink-0`}
              data-testid="lead-status-badge-header"
            >
              {getStatusLabel(lead.status)}
            </Badge>
            {lead.category && (
              <Badge variant="outline" className="text-[10px] sm:text-sm capitalize hidden sm:inline-flex">
                {lead.category}
              </Badge>
            )}
          </div>
          
          {/* Second row - Temperature, ID, Follow-up */}
          <div className="flex items-center gap-2 sm:gap-4 mt-1.5 sm:mt-2 flex-wrap">
            {/* Temperature Selector - Compact on mobile */}
            <Select 
              value={lead.temperature || 'none'} 
              onValueChange={(value) => handleTemperatureChange(value === 'none' ? null : value)}
            >
              <SelectTrigger 
                className={`w-auto h-7 sm:h-9 gap-1 sm:gap-2 px-2 sm:px-3 rounded-full border text-xs sm:text-sm ${
                  lead.temperature === 'hot' ? 'bg-red-100 text-red-700 border-red-300' :
                  lead.temperature === 'warm' ? 'bg-orange-100 text-orange-700 border-orange-300' :
                  lead.temperature === 'cold' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                  'bg-gray-50 text-gray-600 border-gray-200'
                }`}
                data-testid="lead-temperature-select"
              >
                {lead.temperature === 'hot' && <Flame className="h-3 w-3 sm:h-4 sm:w-4 fill-red-500" />}
                {lead.temperature === 'warm' && <ThermometerSun className="h-3 w-3 sm:h-4 sm:w-4" />}
                {lead.temperature === 'cold' && <Snowflake className="h-3 w-3 sm:h-4 sm:w-4" />}
                {!lead.temperature && <ThermometerSun className="h-3 w-3 sm:h-4 sm:w-4 opacity-50" />}
                <SelectValue placeholder="Temp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="flex items-center gap-2 text-gray-500">
                    <span className="w-4 h-4" /> Not Set
                  </span>
                </SelectItem>
                <SelectItem value="hot">
                  <span className="flex items-center gap-2 text-red-600">
                    <Flame className="h-4 w-4 fill-red-500" /> Hot
                  </span>
                </SelectItem>
                <SelectItem value="warm">
                  <span className="flex items-center gap-2 text-orange-600">
                    <ThermometerSun className="h-4 w-4" /> Warm
                  </span>
                </SelectItem>
                <SelectItem value="cold">
                  <span className="flex items-center gap-2 text-blue-600">
                    <Snowflake className="h-4 w-4" /> Cold
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            
            {/* Lead ID */}
            {lead.lead_id ? (
              <p className="text-[10px] sm:text-sm font-mono text-muted-foreground" data-testid="lead-unique-id">
                <span className="hidden sm:inline">ID: </span>{lead.lead_id}
              </p>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateLeadId}
                disabled={generatingLeadId}
                className="h-6 sm:h-7 text-[10px] sm:text-xs border-amber-500 text-amber-700 hover:bg-amber-50 px-2"
                data-testid="generate-lead-id-btn"
              >
                {generatingLeadId ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>+ ID</>
                )}
              </Button>
            )}
            
            {/* Follow-up date - Hidden on very small screens */}
            {lead.next_followup_date && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>Follow-up: {format(new Date(lead.next_followup_date), 'MMM d')}</span>
              </div>
            )}
          </div>
          {lead.contact_person && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 truncate">Contact: {lead.contact_person}</p>
          )}
        </div>
        
        {/* Action Buttons - Stack on mobile */}
        <div className="flex items-center gap-2 shrink-0">
          {canConvert && (
            <Button
              onClick={handleConvertToAccount}
              disabled={convertingToAccount}
              variant="default"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3"
              data-testid="convert-to-account-btn"
            >
              {convertingToAccount ? (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <><ArrowRightCircle className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" /><span className="hidden sm:inline">Convert</span></>
              )}
            </Button>
          )}
          {lead.converted_to_account && lead.account_id && (
            <Button
              onClick={() => navigate(`/accounts/${lead.account_id}`)}
              variant="outline"
              size="sm"
              className="border-emerald-500 text-emerald-700 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3"
              data-testid="view-account-btn"
            >
              <Building2 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" /><span className="hidden sm:inline">Account</span>
            </Button>
          )}
          <Button onClick={() => navigate(`/leads/${id}/edit`)} data-testid="edit-lead-button" size="sm" className="text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
            <span className="hidden sm:inline">Edit Lead</span>
            <span className="sm:hidden">Edit</span>
          </Button>
        </div>
      </div>

      {/* Main Content Grid - Stack on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4 sm:gap-6">
        {/* Left Column - Lead Info */}
        <div className="lg:col-span-5 space-y-4 sm:space-y-6">
          {/* Timeline Summary - Moved to Top */}
          <TimelineSummaryCompact activities={activities} />

          {/* Proposed SKU Pricing - Moved to Top for Importance */}
          <Card className="p-3 sm:p-6" data-testid="proposed-sku-pricing-card">
            {/* Prominent Estimated Monthly Opportunity Display */}
            {proposedSkuPricing.length > 0 && getMonthlyBottles() > 0 && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-300">Est. Monthly Opportunity</p>
                    <p className="text-xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="estimated-monthly-opportunity">
                      ₹{getEstimatedMonthlyOpportunity().toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Based on</p>
                    <p className="text-sm sm:text-lg font-semibold text-emerald-600">{getMonthlyBottles().toLocaleString()} bottles/mo</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {getTotalPercentage()}% allocated
                      {getTotalPercentage() > 100 && (
                        <span className="text-red-500 ml-1">(exceeds 100%!)</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-sm sm:text-lg font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">Interested / Proposed SKUs</span>
                <span className="sm:hidden">SKUs</span>
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

            {/* No monthly bottles warning */}
            {proposedSkuPricing.length > 0 && getMonthlyBottles() === 0 && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Complete the Opportunity Estimation to see revenue calculations
                </p>
              </div>
            )}
            
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
                      <th className="text-center px-3 py-2 text-sm font-medium">% Dist.</th>
                      <th className="text-right px-3 py-2 text-sm font-medium">Est. Qty</th>
                      <th className="text-right px-3 py-2 text-sm font-medium">Price/Unit</th>
                      <th className="text-right px-3 py-2 text-sm font-medium">Revenue</th>
                      <th className="text-right px-3 py-2 text-sm font-medium">Bottle Credit</th>
                      {isEditingPricing && <th className="w-10"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {proposedSkuPricing.map((item, index) => {
                      const { estimatedQty, revenue } = calculateSkuMetrics(item);
                      return (
                        <tr key={index}>
                          <td className="px-3 py-2">
                            {isEditingPricing ? (
                              <Select
                                value={item.sku}
                                onValueChange={(val) => handleProposedSKUChange(index, 'sku', val)}
                              >
                                <SelectTrigger className="w-[160px]" data-testid={`proposed-sku-select-${index}`}>
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
                          <td className="px-3 py-2 text-center">
                            {isEditingPricing ? (
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={item.percentage || 0}
                                onChange={(e) => handleProposedSKUChange(index, 'percentage', e.target.value)}
                                className="w-20 text-center"
                                data-testid={`proposed-percentage-input-${index}`}
                              />
                            ) : (
                              <span>{item.percentage || 0}%</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="font-medium text-blue-600">{estimatedQty.toLocaleString()}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isEditingPricing ? (
                              <Input
                                type="number"
                                value={item.price_per_unit}
                                onChange={(e) => handleProposedSKUChange(index, 'price_per_unit', e.target.value)}
                                className="w-24 text-right"
                                data-testid={`proposed-price-input-${index}`}
                              />
                            ) : (
                              <span>₹{item.price_per_unit?.toLocaleString()}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="font-semibold text-emerald-600">₹{revenue.toLocaleString('en-IN')}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isEditingPricing ? (
                              <Input
                                type="number"
                                value={item.return_bottle_credit}
                                onChange={(e) => handleProposedSKUChange(index, 'return_bottle_credit', e.target.value)}
                                className="w-20 text-right"
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
                      );
                    })}
                  </tbody>
                  {/* Footer with totals */}
                  <tfoot className="bg-muted/30 border-t-2">
                    <tr>
                      <td className="px-3 py-2 font-semibold">Total</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-semibold ${getTotalPercentage() > 100 ? 'text-red-500' : getTotalPercentage() === 100 ? 'text-green-600' : ''}`}>
                          {getTotalPercentage()}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-600">
                        {proposedSkuPricing.reduce((sum, sku) => sum + calculateSkuMetrics(sku).estimatedQty, 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-600">
                        ₹{getEstimatedMonthlyOpportunity().toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2"></td>
                      {isEditingPricing && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

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
          {((lead.current_brands && lead.current_brands.length > 0) || lead.current_water_brand || lead.current_volume || lead.current_landing_price || lead.current_selling_price) && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Current Brand Details</h2>
              {lead.current_brands && lead.current_brands.length > 0 ? (
                <div className="border rounded-lg overflow-hidden" data-testid="lead-brands-grid">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase">
                        <th className="p-2.5 text-left font-medium">Brand Name</th>
                        <th className="p-2.5 text-left font-medium">Volume</th>
                        <th className="p-2.5 text-left font-medium">Landing Price</th>
                        <th className="p-2.5 text-left font-medium">Selling Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lead.current_brands.map((brand, idx) => (
                        <tr key={idx} className={`border-b last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`} data-testid={`lead-brand-row-${idx}`}>
                          <td className="p-2.5 font-medium">{brand.brand_name}</td>
                          <td className="p-2.5">{brand.volume}</td>
                          <td className="p-2.5">{brand.landing_price ? `₹${brand.landing_price}` : '-'}</td>
                          <td className="p-2.5">{brand.selling_price ? `₹${brand.selling_price}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
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
              )}
            </Card>
          )}

          {/* Invoice Summary */}
          <InvoiceSummaryCard invoiceData={invoiceData} />

          {/* Expense Requests Section */}
          {lead && (
            <ExpenseRequestSection
              entityType="lead"
              entityId={lead.id}
              entityName={lead.company}
              entityCity={lead.city}
            />
          )}

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
        <div className="lg:col-span-2 space-y-6">
          {/* Opportunity Estimation - Water Brand Industry Feature */}
          {showOpportunityEstimation && (
            <OpportunityEstimation
              leadId={lead.id}
              leadName={lead.company}
              existingEstimation={lead.opportunity_estimation}
              onSave={(estimation) => setLead(prev => ({ ...prev, opportunity_estimation: estimation }))}
            />
          )}

          {/* Lead Scoring Card */}
          <LeadScoringCard
            leadId={lead.id}
            leadCity={lead.city}
            leadCompany={lead.company}
          />

          {/* Lead Group Card - Link related leads */}
          <LeadGroupCard
            leadId={lead.id}
            leadCompany={lead.company}
            brandingColor={branding?.primary_color}
          />

          {/* Log Activity Section - Featured Component */}
          <Card className={`overflow-hidden transition-all duration-300 ${showActivityForm ? 'ring-2 ring-primary/20 shadow-lg' : 'hover:shadow-md'}`}>
            {/* Header with gradient - uses tenant branding */}
            <div 
              className={`p-4 ${showActivityForm ? 'bg-gradient-to-r from-primary/10 via-primary/5 to-transparent' : ''}`}
              style={!showActivityForm ? { background: `linear-gradient(to right, ${branding?.primary_color || '#0d9488'}, ${branding?.primary_color || '#0d9488'}dd)` } : {}}
            >
              <Button
                onClick={() => setShowActivityForm(!showActivityForm)}
                variant={showActivityForm ? 'outline' : 'ghost'}
                className={`w-full h-12 text-base font-semibold transition-all ${
                  showActivityForm 
                    ? 'bg-white hover:bg-gray-50 border-2' 
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/30'
                }`}
                data-testid="toggle-activity-form"
              >
                {showActivityForm ? (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Log Activity
                  </>
                )}
              </Button>
            </div>

            {/* Activity Form - Expanded */}
            {showActivityForm && (
              <div className="p-6 bg-gradient-to-b from-gray-50/50 to-white">
                <form onSubmit={handleAddActivity} className="space-y-5">
                  {/* Interaction Method - Prominent Selection */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-gray-700">How did you interact? *</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'phone_call', icon: '📞', label: 'Call', color: 'hover:bg-blue-50 hover:border-blue-300' },
                        { value: 'customer_visit', icon: '🚗', label: 'Visit', color: 'hover:bg-green-50 hover:border-green-300' },
                        { value: 'email', icon: '✉️', label: 'Email', color: 'hover:bg-purple-50 hover:border-purple-300' },
                        { value: 'whatsapp', icon: '💬', label: 'WhatsApp', color: 'hover:bg-emerald-50 hover:border-emerald-300' },
                        { value: 'sms', icon: '📱', label: 'SMS', color: 'hover:bg-orange-50 hover:border-orange-300' },
                        { value: 'other', icon: '📝', label: 'Other', color: 'hover:bg-gray-50 hover:border-gray-300' },
                      ].map((method) => (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() => {
                            setInteractionMethod(method.value);
                            if (method.value === 'phone_call') setActivityType('call');
                            else if (method.value === 'customer_visit') setActivityType('visit');
                            else if (method.value === 'email') setActivityType('email');
                            else if (method.value === 'whatsapp' || method.value === 'sms') setActivityType('call');
                            else setActivityType('note');
                          }}
                          className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                            interactionMethod === method.value
                              ? 'bg-primary/10 border-primary shadow-sm'
                              : `bg-white border-gray-200 ${method.color}`
                          }`}
                          data-testid={`interaction-${method.value}`}
                        >
                          <span className="text-xl">{method.icon}</span>
                          <span className={`text-xs font-medium ${interactionMethod === method.value ? 'text-primary' : 'text-gray-600'}`}>
                            {method.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description - Larger textarea */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700">What happened? *</Label>
                    <Textarea
                      value={activityDescription}
                      onChange={(e) => setActivityDescription(e.target.value)}
                      placeholder="Describe the key points of this interaction..."
                      rows={4}
                      required
                      className="resize-none bg-white border-2 border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl text-base"
                      data-testid="activity-description-input"
                    />
                  </div>
                  
                  {/* Status & Follow-up in a highlighted section */}
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 space-y-4 border border-amber-100">
                    <div className="flex items-center gap-2 text-amber-700">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-xs font-semibold uppercase tracking-wide">Quick Actions</span>
                    </div>
                    
                    {/* Row 1: Status Update + Activity Date (for Admin) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Status Update */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600">Update Status</Label>
                        <Select value={activityStatus || "keep_current"} onValueChange={(val) => setActivityStatus(val === "keep_current" ? "" : val)}>
                          <SelectTrigger className="bg-white h-10" data-testid="activity-status-select">
                            <SelectValue placeholder="Keep current" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            <SelectItem value="keep_current">Keep current status</SelectItem>
                            {statuses
                              .filter(s => s.is_active !== false && s.id && s.label)
                              .map(status => (
                                <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Activity Date - Admin Only (or empty space for alignment) */}
                      {isAdmin ? (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-gray-600">
                            Activity Date
                            <span className="ml-1 text-[10px] text-amber-600 font-normal">(Admin)</span>
                          </Label>
                          <Input
                            type="date"
                            value={activityDate}
                            onChange={(e) => setActivityDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="bg-white h-10 border-amber-200 focus:border-amber-400"
                            placeholder="Default: Today"
                            data-testid="activity-date-admin"
                          />
                          <p className="text-[10px] text-amber-600">Leave empty for today's date</p>
                        </div>
                      ) : (
                        <div></div>
                      )}
                    </div>
                    
                    {/* Row 2: Next Follow-up Date - Full width on separate row */}
                    <div className="pt-2 border-t border-amber-200/50">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600 flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                          Schedule Next Follow-up
                        </Label>
                        <div className="flex items-center gap-3">
                          <Input
                            type="date"
                            value={activityFollowUpDate}
                            onChange={(e) => setActivityFollowUpDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="bg-white h-10 max-w-[200px]"
                            data-testid="activity-followup-date"
                          />
                          <span className="text-xs text-gray-500">Optional - Set a reminder for your next touchpoint</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Copy to Linked Leads - Only show if there are linked leads */}
                  {linkedLeads.length > 0 && (
                    <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-4 space-y-3 border border-violet-100">
                      <div className="flex items-center gap-2 text-violet-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <span className="text-xs font-semibold uppercase tracking-wide">Apply to Linked Leads</span>
                      </div>
                      <div className="space-y-2">
                        {linkedLeads.map(linked => (
                          <label 
                            key={linked.id} 
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                              selectedLinkedLeads.includes(linked.id) 
                                ? 'bg-violet-100 border border-violet-300' 
                                : 'bg-white/50 border border-transparent hover:bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedLinkedLeads.includes(linked.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLinkedLeads([...selectedLinkedLeads, linked.id]);
                                } else {
                                  setSelectedLinkedLeads(selectedLinkedLeads.filter(id => id !== linked.id));
                                }
                              }}
                              className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                            />
                            <div className="flex-1">
                              <span className="font-medium text-sm">{linked.company}</span>
                              {linked.city && (
                                <span className="text-xs text-muted-foreground ml-2">({linked.city})</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                      {selectedLinkedLeads.length > 0 && (
                        <div className="pt-2 border-t border-violet-200 space-y-2">
                          <p className="text-xs text-violet-600 font-medium">
                            For {selectedLinkedLeads.length} selected lead{selectedLinkedLeads.length > 1 ? 's' : ''}:
                          </p>
                          <div className="flex flex-col gap-1 text-xs text-violet-700">
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Activity will be copied
                            </span>
                            {activityStatus && activityStatus !== 'keep_current' && (
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Status will be updated to "{activityStatus.replace(/_/g, ' ')}"
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Submit Button - Prominent */}
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-base font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 rounded-xl transition-all hover:shadow-xl hover:shadow-emerald-500/30" 
                    disabled={submittingActivity} 
                    data-testid="submit-activity-button"
                  >
                    {submittingActivity ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 
                        Saving Activity...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save Activity
                      </>
                    )}
                  </Button>
                </form>
              </div>
            )}
          </Card>

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
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-start gap-4">
                    {/* File Type Thumbnail */}
                    {getProposalFileType(proposal.file_name) === 'pdf' ? (
                      <div className="h-12 w-12 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-6 w-6 text-red-600 dark:text-red-400" />
                      </div>
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <FileIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{proposal.file_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-xs ${getProposalFileType(proposal.file_name) === 'pdf' ? 'border-red-300 text-red-600' : 'border-blue-300 text-blue-600'}`}>
                          {getProposalFileType(proposal.file_name) === 'pdf' ? 'PDF' : 'Word Document'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {(proposal.file_size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Version {proposal.version} • Uploaded by {proposal.uploaded_by_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(proposal.uploaded_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </div>
                  {/* Action Buttons - Separate Row */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
                    {/* View PDF Button - Only for PDFs */}
                    {getProposalFileType(proposal.file_name) === 'pdf' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleOpenPdfViewer}
                        disabled={loadingPdfViewer}
                        data-testid="proposal-view-btn"
                      >
                        {loadingPdfViewer ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Loading...</>
                        ) : (
                          <><Eye className="h-4 w-4 mr-1" /> View PDF</>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleProposalDownload}
                      data-testid="proposal-download-btn"
                    >
                      <Download className="h-4 w-4 mr-1" /> Download
                    </Button>
                    {proposal.status === 'approved' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openShareDialog}
                        className="text-primary"
                        data-testid="proposal-share-email-btn"
                      >
                        <Share2 className="h-4 w-4 mr-1" /> Share via Email
                      </Button>
                    )}
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

      {/* Share Proposal via Email Dialog - Email Client Style */}
      <Dialog open={showShareDialog} onOpenChange={(open) => { setShowShareDialog(open); if (!open) setIsEmailComposerExpanded(false); }}>
        <DialogContent className={`${isEmailComposerExpanded ? 'sm:max-w-[90vw] sm:max-h-[90vh] h-[90vh]' : 'sm:max-w-[700px]'} flex flex-col transition-all duration-200`}>
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                New Message
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEmailComposerExpanded(!isEmailComposerExpanded)}
                className="h-8 w-8 p-0"
                title={isEmailComposerExpanded ? "Minimize" : "Expand"}
              >
                {isEmailComposerExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </DialogHeader>
          
          <div className={`flex-1 overflow-y-auto space-y-3 ${isEmailComposerExpanded ? 'py-4' : 'py-2'}`}>
            {/* From Row */}
            <div className="flex items-center border-b pb-2">
              <span className="w-12 text-sm text-muted-foreground flex-shrink-0">From:</span>
              <span className="text-sm font-medium">{user?.email || ''}</span>
            </div>
            
            {/* To Row with Chips */}
            <div className="flex items-start border-b pb-2">
              <span className="w-12 text-sm text-muted-foreground flex-shrink-0 pt-1.5">To:</span>
              <div className="flex-1 flex flex-wrap items-center gap-1">
                {shareEmailTo.map((email, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
                    {email}
                    <button onClick={() => removeEmailChip('to', email)} className="hover:bg-primary/20 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Input
                  type="email"
                  placeholder={shareEmailTo.length === 0 ? "Add recipients..." : ""}
                  value={shareEmailToInput}
                  onChange={(e) => handleEmailInputChange('to', e.target.value)}
                  onKeyDown={(e) => handleEmailInputKeyDown('to', e, shareEmailToInput)}
                  onBlur={() => { if (shareEmailToInput.trim()) addEmailChip('to', shareEmailToInput); }}
                  className="border-0 shadow-none focus-visible:ring-0 h-7 px-1 min-w-[120px] flex-1"
                  data-testid="share-email-to"
                />
              </div>
            </div>
            
            {/* CC Row with Chips */}
            <div className="flex items-start border-b pb-2">
              <span className="w-12 text-sm text-muted-foreground flex-shrink-0 pt-1.5">Cc:</span>
              <div className="flex-1 flex flex-wrap items-center gap-1">
                {shareEmailCc.map((email, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                    {email}
                    <button onClick={() => removeEmailChip('cc', email)} className="hover:bg-blue-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Input
                  type="email"
                  placeholder=""
                  value={shareEmailCcInput}
                  onChange={(e) => handleEmailInputChange('cc', e.target.value)}
                  onKeyDown={(e) => handleEmailInputKeyDown('cc', e, shareEmailCcInput)}
                  onBlur={() => { if (shareEmailCcInput.trim()) addEmailChip('cc', shareEmailCcInput); }}
                  className="border-0 shadow-none focus-visible:ring-0 h-7 px-1 min-w-[120px] flex-1"
                  data-testid="share-email-cc"
                />
              </div>
            </div>
            
            {/* BCC Row with Chips */}
            <div className="flex items-start border-b pb-2">
              <span className="w-12 text-sm text-muted-foreground flex-shrink-0 pt-1.5">Bcc:</span>
              <div className="flex-1 flex flex-wrap items-center gap-1">
                {shareEmailBcc.map((email, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                    {email}
                    <button onClick={() => removeEmailChip('bcc', email)} className="hover:bg-gray-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Input
                  type="email"
                  placeholder=""
                  value={shareEmailBccInput}
                  onChange={(e) => handleEmailInputChange('bcc', e.target.value)}
                  onKeyDown={(e) => handleEmailInputKeyDown('bcc', e, shareEmailBccInput)}
                  onBlur={() => { if (shareEmailBccInput.trim()) addEmailChip('bcc', shareEmailBccInput); }}
                  className="border-0 shadow-none focus-visible:ring-0 h-7 px-1 min-w-[120px] flex-1"
                  data-testid="share-email-bcc"
                />
              </div>
            </div>
            
            {/* Subject Row */}
            <div className="flex items-center border-b pb-2">
              <span className="w-12 text-sm text-muted-foreground flex-shrink-0">Subject:</span>
              <Input
                value={shareEmailSubject}
                onChange={(e) => setShareEmailSubject(e.target.value)}
                className="border-0 shadow-none focus-visible:ring-0 h-8 px-1 font-medium"
                data-testid="share-email-subject"
              />
            </div>
            
            {/* Email Body - Larger Area */}
            <div className="flex-1">
              <Textarea
                placeholder="Compose your message..."
                value={shareEmailMessage}
                onChange={(e) => setShareEmailMessage(e.target.value)}
                className={`w-full resize-none font-sans text-sm leading-relaxed ${isEmailComposerExpanded ? 'min-h-[50vh]' : 'min-h-[280px]'}`}
                data-testid="share-email-message"
              />
            </div>
            
            {/* Attachment Preview */}
            {proposal && (
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium">{proposal.file_name}</span>
                <span className="text-muted-foreground">({(proposal.file_size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
          </div>
          
          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => { setShowShareDialog(false); setIsEmailComposerExpanded(false); }}>
              Discard
            </Button>
            <Button onClick={handleSendProposalEmail} disabled={sendingEmail} className="min-w-[120px]">
              {sendingEmail ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
              ) : (
                <><Send className="mr-2 h-4 w-4" /> Send</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Viewer Dialog */}
      <Dialog open={showPdfViewer} onOpenChange={setShowPdfViewer}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 pr-8">
              <div className="h-8 w-8 rounded bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <span className="truncate">{pdfViewerData?.file_name || 'Proposal'}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="relative flex items-center justify-center bg-black/5 dark:bg-black/20 min-h-[400px] max-h-[70vh] overflow-auto">
            {pdfViewerData && pdfViewerData.file_data && (
              <embed
                src={`data:application/pdf;base64,${pdfViewerData.file_data}#toolbar=1&navpanes=1&scrollbar=1`}
                type="application/pdf"
                className="w-full h-[65vh]"
              />
            )}
          </div>
          <DialogFooter className="p-4 pt-2 border-t">
            <Button variant="outline" onClick={() => setShowPdfViewer(false)}>
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
            <Button onClick={handleProposalDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Celebration Animation */}
      <CelebrationAnimation
        show={showCelebration}
        onComplete={() => setShowCelebration(false)}
        type={celebrationType}
        leadName={lead?.company_name || lead?.contact_name || ''}
      />
    </div>
  );
}
