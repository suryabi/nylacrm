import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { leadsAPI, activitiesAPI, commentsAPI, usersAPI } from '../utils/api';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Phone, Building2, User, MessageSquare, Send, Loader2 } from 'lucide-react';
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

const statusColors = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-green-100 text-green-800',
  not_qualified: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-purple-100 text-purple-800',
  proposal_stage: 'bg-orange-100 text-orange-800',
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
    'proposal_stage': 'Proposal Stage',
    'won': 'Won',
    'lost': 'Lost',
    'future_followup': 'Future Follow up'
  };
  return labels[status] || status;
};

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [comments, setComments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  
  // Activity creation state
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityType, setActivityType] = useState('call');
  const [interactionMethod, setInteractionMethod] = useState('phone_call');
  const [activityDescription, setActivityDescription] = useState('');
  const [submittingActivity, setSubmittingActivity] = useState(false);
  const [activityStatus, setActivityStatus] = useState('');
  const [activityFollowUpDate, setActivityFollowUpDate] = useState('');

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const leadRes = await leadsAPI.getById(id);
      setLead(leadRes.data);
      
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
      toast.error('Failed to update status');
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
    if (!activityDescription.trim()) return;

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
      toast.error('Failed to add activity');
    } finally {
      setSubmittingActivity(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  if (!lead) {
    return <div className="text-center py-12">Lead not found</div>;
  }

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
        <Button onClick={() => navigate(`/leads/${id}/edit`)} data-testid="edit-lead-button">
          Edit Lead
        </Button>
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

          {/* Lead Status */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Lead Status</h2>
            <div className="flex items-center gap-4 mb-4">
              <Badge className={`${statusColors[lead.status]} text-sm px-3 py-1`}>
                {getStatusLabel(lead.status)}
              </Badge>
              <Select value={lead.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[200px]" data-testid="status-selector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="not_qualified">Not Qualified</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="proposal_stage">Proposal Stage</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="future_followup">Future Follow up</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="mt-4 pt-4 border-t">
              <Label className="mb-2 block">Next Follow-up Date</Label>
              <Input
                type="date"
                value={lead.next_followup_date || ''}
                onChange={(e) => handleFollowUpChange(e.target.value)}
                className="w-full"
                min={new Date().toISOString().split('T')[0]}
              />
              {lead.next_followup_date && (
                <p className="text-xs text-muted-foreground mt-2">
                  Follow-up scheduled for: {format(new Date(lead.next_followup_date), 'MMM d, yyyy')}
                </p>
              )}
            </div>
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
                  <Select value={activityStatus} onValueChange={setActivityStatus}>
                    <SelectTrigger data-testid="activity-status-select">
                      <SelectValue placeholder="Keep current status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Keep current status</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="not_qualified">Not Qualified</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="proposal_stage">Proposal Stage</SelectItem>
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
