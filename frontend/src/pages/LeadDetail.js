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

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [leadRes, activitiesRes, commentsRes, usersRes] = await Promise.all([
        leadsAPI.getById(id),
        activitiesAPI.getByLeadId(id),
        commentsAPI.getByLeadId(id),
        usersAPI.getAll(),
      ]);
      setLead(leadRes.data);
      setActivities(activitiesRes.data);
      setComments(commentsRes.data);
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
          <h1 className="text-3xl font-semibold">{lead.name}</h1>
          <p className="text-muted-foreground mt-1">{lead.company}</p>
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
              {lead.company && (
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p className="font-medium">{lead.company}</p>
                  </div>
                </div>
              )}
              {assignedUser && (
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned To</p>
                    <p className="font-medium">{assignedUser.name}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

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
              {comments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No comments yet</p>
              ) : (
                comments.map((comment) => {
                  const commenter = users.find(u => u.id === comment.created_by);
                  return (
                    <div key={comment.id} className="bg-muted/50 p-4 rounded-lg" data-testid={`comment-${comment.id}`}>
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-medium text-sm">{commenter?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(comment.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                      <p className="text-sm">{comment.comment}</p>
                    </div>
                  );
                })
              )}
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
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Activity Timeline</h2>
            <div className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-muted-foreground text-sm">No activities yet</p>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="flex gap-3" data-testid={`activity-${activity.id}`}>
                    <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
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
                  <p className="font-medium">${lead.estimated_value.toLocaleString()}</p>
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
