import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { leadsAPI, activitiesAPI, commentsAPI, usersAPI } from '../utils/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Phone, Building2, User, MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import ActivityTimeline from '../components/ActivityTimeline';

const statusColors = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-green-100 text-green-800',
  proposal: 'bg-purple-100 text-purple-800',
  closed_won: 'bg-emerald-100 text-emerald-800',
  closed_lost: 'bg-red-100 text-red-800',
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
  
  // Activity creation state
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityType, setActivityType] = useState('call');
  const [interactionMethod, setInteractionMethod] = useState('phone_call');
  const [activityDescription, setActivityDescription] = useState('');
  const [submittingActivity, setSubmittingActivity] = useState(false);

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
      await activitiesAPI.create({
        lead_id: id,
        activity_type: activityType,
        description: activityDescription,
        interaction_method: interactionMethod
      });
      toast.success('Activity added');
      setActivityDescription('');
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
          <h1 className="text-3xl font-semibold">{lead.company}</h1>
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
            <div className="flex items-center gap-4">
              <Badge className={`${statusColors[lead.status]} text-sm px-3 py-1`}>
                {lead.status.replace('_', ' ')}
              </Badge>
              <Select value={lead.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[200px]" data-testid="status-selector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="closed_won">Closed Won</SelectItem>
                  <SelectItem value="closed_lost">Closed Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

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
                  <Select value={interactionMethod} onValueChange={setInteractionMethod}>
                    <SelectTrigger data-testid="interaction-method-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone_call">Phone Call</SelectItem>
                      <SelectItem value="customer_visit">Customer Visit</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Activity Type *</Label>
                  <Select value={activityType} onValueChange={setActivityType}>
                    <SelectTrigger data-testid="activity-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="visit">Visit</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
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
                <Button type="submit" disabled={submittingActivity} data-testid="submit-activity-button">
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
