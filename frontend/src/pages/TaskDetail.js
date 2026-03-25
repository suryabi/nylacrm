import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO, isValid, isPast, isToday } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';
import {
  ArrowLeft, Calendar, Clock, User, Users, Tag, Target, Building2,
  Link2, Eye, EyeOff, MessageSquare, Activity, Pencil, Trash2, Send,
  MoreHorizontal, Loader2, Flag, Circle, ArrowRight, CheckCircle2,
  AlertTriangle, Plus, X
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

// Severity styles - using global theme colors
const SEVERITY_STYLES = {
  high: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200' },
  low: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200' }
};

// Status configurations - aligned with global theme
const STATUS_CONFIG = {
  open: { label: 'Open', icon: Circle, color: 'text-blue-600', bg: 'bg-blue-50' },
  in_progress: { label: 'In Progress', icon: ArrowRight, color: 'text-amber-600', bg: 'bg-amber-50' },
  review: { label: 'In Review', icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50' },
  closed: { label: 'Closed', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' }
};

// Card styling from design guidelines
const CARD_CLASS = "border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]";

// Get 2-letter initials from name
const getInitials = (name) => {
  if (!name) return 'NA';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

// Format date safely
const formatDate = (dateString, formatStr = 'MMM d, yyyy') => {
  if (!dateString) return null;
  try {
    const date = parseISO(dateString);
    return isValid(date) ? format(date, formatStr) : null;
  } catch {
    return null;
  }
};

// Check if overdue
const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  try {
    const date = parseISO(dueDate);
    return isValid(date) && isPast(date) && !isToday(date);
  } catch {
    return false;
  }
};

// Activity descriptions
const getActivityDescription = (activity) => {
  const action = activity.action;
  if (action === 'created') return 'created this task';
  if (action === 'commented') return 'added a comment';
  if (action === 'updated_status') return `changed status from "${activity.old_value}" to "${activity.new_value}"`;
  if (action === 'updated_severity') return `changed severity from "${activity.old_value}" to "${activity.new_value}"`;
  if (action === 'updated_assignees') return 'updated assignees';
  if (action === 'updated_labels') return 'updated labels';
  if (action === 'updated_milestone_id') return activity.new_value ? 'added to milestone' : 'removed from milestone';
  if (action === 'updated_due_date') return `changed due date to "${activity.new_value}"`;
  if (action.startsWith('updated_')) return `updated ${action.replace('updated_', '').replace('_', ' ')}`;
  return action;
};

export default function TaskDetail() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState(null);
  const [labels, setLabels] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [user, setUser] = useState(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  
  const [activeTab, setActiveTab] = useState('comments');

  // Check permissions
  const canManageSettings = user && ['CEO', 'Director', 'System Admin'].some(
    r => user.role?.toLowerCase() === r.toLowerCase()
  );
  const isCreator = user?.id === task?.created_by;
  const isAssignee = task?.assignees?.includes(user?.id);
  const canEdit = canManageSettings || isCreator || isAssignee;

  // Fetch task data
  const fetchTask = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [taskRes, labelsRes, milestonesRes, deptRes, usersRes, meRes] = await Promise.all([
        axios.get(`${API}/api/task-management/tasks/${taskId}`, { headers }),
        axios.get(`${API}/api/task-management/labels`, { headers }),
        axios.get(`${API}/api/task-management/milestones`, { headers }),
        axios.get(`${API}/api/task-management/departments`, { headers }),
        axios.get(`${API}/api/users`, { headers }),
        axios.get(`${API}/api/auth/me`, { headers })
      ]);
      
      setTask(taskRes.data);
      setLabels(labelsRes.data);
      setMilestones(milestonesRes.data);
      setDepartments(deptRes.data);
      setUsers(usersRes.data);
      setUser(meRes.data);
      
      // Initialize edit form
      setEditForm({
        title: taskRes.data.title,
        description: taskRes.data.description || '',
        severity: taskRes.data.severity,
        status: taskRes.data.status,
        department_id: taskRes.data.department_id,
        assignees: taskRes.data.assignees || [],
        milestone_id: taskRes.data.milestone_id || '',
        labels: taskRes.data.labels || [],
        due_date: taskRes.data.due_date || '',
        reminder_date: taskRes.data.reminder_date || ''
      });
    } catch (error) {
      console.error('Error fetching task:', error);
      toast.error('Failed to load task');
      if (error.response?.status === 404) {
        navigate('/tasks');
      }
    } finally {
      setLoading(false);
    }
  }, [taskId, navigate]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Update task
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/api/task-management/tasks/${taskId}`, editForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Task updated');
      setIsEditing(false);
      fetchTask();
    } catch (error) {
      toast.error('Failed to update task');
    } finally {
      setSaving(false);
    }
  };

  // Quick status change
  const handleStatusChange = async (newStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/api/task-management/tasks/${taskId}`, 
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Status updated');
      fetchTask();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  // Add comment
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    
    setSubmittingComment(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/task-management/tasks/${taskId}/comments`, 
        { content: newComment, mentions: [] },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Comment added');
      setNewComment('');
      fetchTask();
    } catch (error) {
      toast.error('Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/task-management/tasks/${taskId}/comments/${commentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Comment deleted');
      fetchTask();
    } catch (error) {
      toast.error('Failed to delete comment');
    }
  };

  // Watch/Unwatch
  const handleWatch = async () => {
    try {
      const token = localStorage.getItem('token');
      const isWatching = task?.watchers?.includes(user?.id);
      
      if (isWatching) {
        await axios.delete(`${API}/api/task-management/tasks/${taskId}/watch`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Stopped watching');
      } else {
        await axios.post(`${API}/api/task-management/tasks/${taskId}/watch`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Now watching');
      }
      fetchTask();
    } catch (error) {
      toast.error('Failed to update watch status');
    }
  };

  // Delete task
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this task? This cannot be undone.')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/task-management/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Task deleted');
      navigate('/tasks');
    } catch (error) {
      toast.error('Failed to delete task');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Task not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/tasks')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tasks
        </Button>
      </div>
    );
  }

  const isWatching = task?.watchers?.includes(user?.id);

  return (
    <div className="p-6 space-y-6" data-testid="task-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate('/tasks')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Tasks
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleWatch}>
            {isWatching ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {isWatching ? 'Unwatch' : 'Watch'}
          </Button>
          {canEdit && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsEditing(!isEditing)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
              {isEditing && (
                <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save Changes
                </Button>
              )}
            </>
          )}
          {(canManageSettings || isCreator) && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task Header */}
          <Card className={CARD_CLASS}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-4">
                  {isEditing ? (
                    <Input
                      value={editForm.title}
                      onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
                      className="text-xl font-bold"
                    />
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-slate-500">{task.task_number}</span>
                        <Badge variant={task.status === 'closed' ? 'secondary' : 'default'} className={`${STATUS_CONFIG[task.status]?.bg} ${STATUS_CONFIG[task.status]?.color} border-0`}>
                          {STATUS_CONFIG[task.status]?.label}
                        </Badge>
                        <Badge className={`${SEVERITY_STYLES[task.severity]?.bg} ${SEVERITY_STYLES[task.severity]?.text} ${SEVERITY_STYLES[task.severity]?.border} border`}>
                          {task.severity}
                        </Badge>
                        {isOverdue(task.due_date) && task.status !== 'closed' && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Overdue
                          </Badge>
                        )}
                      </div>
                      <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                        {task.title}
                      </h1>
                    </div>
                  )}

                  {/* Quick Status Change */}
                  {!isEditing && canEdit && task.status !== 'closed' && (
                    <div className="flex items-center gap-2 pt-2">
                      <span className="text-sm text-slate-500">Quick actions:</span>
                      {Object.entries(STATUS_CONFIG)
                        .filter(([key]) => key !== task.status)
                        .map(([key, config]) => (
                          <Button
                            key={key}
                            variant="outline"
                            size="sm"
                            className={`${config.bg} ${config.color} border-0 hover:opacity-80`}
                            onClick={() => handleStatusChange(key)}
                          >
                            {React.createElement(config.icon, { className: 'h-3 w-3 mr-1' })}
                            {config.label}
                          </Button>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="mt-6">
                <Label className="text-sm font-medium text-slate-500 mb-2 block">Description</Label>
                {isEditing ? (
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                    rows={4}
                    placeholder="Add a description..."
                  />
                ) : (
                  <div className="prose prose-sm max-w-none">
                    {task.description ? (
                      <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{task.description}</p>
                    ) : (
                      <p className="text-slate-400 italic">No description provided</p>
                    )}
                  </div>
                )}
              </div>

              {/* Labels */}
              {(task.labels_data?.length > 0 || isEditing) && (
                <div className="mt-6">
                  <Label className="text-sm font-medium text-slate-500 mb-2 block">Labels</Label>
                  {isEditing ? (
                    <div className="flex flex-wrap gap-2">
                      {labels.map(label => (
                        <label key={label.id} className="cursor-pointer">
                          <Badge
                            className={`${editForm.labels.includes(label.id) ? 'ring-2 ring-offset-1' : 'opacity-50'}`}
                            style={{ backgroundColor: label.color + '20', color: label.color, borderColor: label.color }}
                            onClick={() => {
                              setEditForm(f => ({
                                ...f,
                                labels: f.labels.includes(label.id)
                                  ? f.labels.filter(id => id !== label.id)
                                  : [...f.labels, label.id]
                              }));
                            }}
                          >
                            {label.name}
                          </Badge>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {task.labels_data?.map(label => (
                        <Badge 
                          key={label.id}
                          style={{ backgroundColor: label.color + '20', color: label.color, borderColor: label.color }}
                        >
                          {label.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comments & Activity */}
          <Card className={CARD_CLASS}>
            <CardHeader className="pb-2">
              <div className="flex gap-4 border-b">
                <button
                  className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'comments' 
                      ? 'border-emerald-600 text-emerald-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                  onClick={() => setActiveTab('comments')}
                >
                  <MessageSquare className="h-4 w-4 inline mr-2" />
                  Comments ({task.comments?.length || 0})
                </button>
                <button
                  className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'activity' 
                      ? 'border-emerald-600 text-emerald-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                  onClick={() => setActiveTab('activity')}
                >
                  <Activity className="h-4 w-4 inline mr-2" />
                  Activity ({task.activities?.length || 0})
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {activeTab === 'comments' ? (
                <div className="space-y-4">
                  {/* Add Comment */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700 shrink-0">
                      {getInitials(user?.name)}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Write a comment..."
                        rows={2}
                      />
                      <div className="flex justify-end">
                        <Button 
                          size="sm" 
                          onClick={handleAddComment} 
                          disabled={!newComment.trim() || submittingComment}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {submittingComment ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                          Comment
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Comments List */}
                  <div className="space-y-4 pt-4 border-t">
                    {task.comments?.length === 0 ? (
                      <p className="text-center text-slate-400 py-4">No comments yet</p>
                    ) : (
                      task.comments?.map(comment => (
                        <div key={comment.id} className="flex gap-3" data-testid={`comment-${comment.id}`}>
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-700 shrink-0">
                            {getInitials(comment.created_by_name)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900">{comment.created_by_name}</span>
                              <span className="text-xs text-slate-400">
                                {formatDate(comment.created_at, 'MMM d, yyyy h:mm a')}
                              </span>
                              {(comment.created_by === user?.id || canManageSettings) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                                  onClick={() => handleDeleteComment(comment.id)}
                                >
                                  <Trash2 className="h-3 w-3 text-slate-400" />
                                </Button>
                              )}
                            </div>
                            <p className="text-slate-700 mt-1 whitespace-pre-wrap">{comment.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {task.activities?.length === 0 ? (
                    <p className="text-center text-slate-400 py-4">No activity yet</p>
                  ) : (
                    task.activities?.map(activity => (
                      <div key={activity.id} className="flex items-start gap-3 text-sm">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-medium text-slate-600 shrink-0 mt-0.5">
                          {getInitials(activity.created_by_name)}
                        </div>
                        <div className="flex-1">
                          <p className="text-slate-600">
                            <span className="font-medium text-slate-900">{activity.created_by_name}</span>
                            {' '}{getActivityDescription(activity)}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {formatDate(activity.created_at, 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Details Card */}
          <Card className={CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-emerald-800/70 uppercase tracking-wider">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Department */}
              <div>
                <Label className="text-xs text-slate-500">Department</Label>
                {isEditing ? (
                  <Select value={editForm.department_id} onValueChange={(v) => setEditForm(f => ({ ...f, department_id: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {departments.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium">{task.department_id}</span>
                  </div>
                )}
              </div>

              {/* Severity */}
              <div>
                <Label className="text-xs text-slate-500">Severity</Label>
                {isEditing ? (
                  <Select value={editForm.severity} onValueChange={(v) => setEditForm(f => ({ ...f, severity: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <Flag className="h-4 w-4 text-slate-400" />
                    <Badge className={`${SEVERITY_STYLES[task.severity]?.bg} ${SEVERITY_STYLES[task.severity]?.text}`}>
                      {task.severity}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Milestone */}
              <div>
                <Label className="text-xs text-slate-500">Milestone</Label>
                {isEditing ? (
                  <Select value={editForm.milestone_id || "none"} onValueChange={(v) => setEditForm(f => ({ ...f, milestone_id: v === "none" ? "" : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {milestones.filter(m => m.status === 'open').map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <Target className="h-4 w-4 text-slate-400" />
                    <span className="text-sm">{task.milestone_data?.title || 'None'}</span>
                  </div>
                )}
              </div>

              {/* Due Date */}
              <div>
                <Label className="text-xs text-slate-500">Due Date</Label>
                {isEditing ? (
                  <Input
                    type="date"
                    value={editForm.due_date}
                    onChange={(e) => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <div className={`flex items-center gap-2 mt-1 ${isOverdue(task.due_date) ? 'text-red-600' : ''}`}>
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span className="text-sm">
                      {task.due_date ? (
                        <>
                          {formatDate(task.due_date)}
                          {isOverdue(task.due_date) && task.status !== 'closed' && (
                            <span className="text-red-600 ml-2">(Overdue)</span>
                          )}
                        </>
                      ) : 'Not set'}
                    </span>
                  </div>
                )}
              </div>

              {/* Reminder */}
              <div>
                <Label className="text-xs text-slate-500">Reminder</Label>
                {isEditing ? (
                  <Input
                    type="date"
                    value={editForm.reminder_date}
                    onChange={(e) => setEditForm(f => ({ ...f, reminder_date: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span className="text-sm">{task.reminder_date ? formatDate(task.reminder_date) : 'Not set'}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Assignees Card */}
          <Card className={CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-emerald-800/70 uppercase tracking-wider">Assignees</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {users.map(u => (
                    <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={editForm.assignees.includes(u.id)}
                        onChange={(e) => {
                          setEditForm(f => ({
                            ...f,
                            assignees: e.target.checked
                              ? [...f.assignees, u.id]
                              : f.assignees.filter(id => id !== u.id)
                          }));
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{u.name}</span>
                    </label>
                  ))}
                </div>
              ) : task.assignees_data?.length > 0 ? (
                <div className="space-y-2">
                  {task.assignees_data.map(assignee => (
                    <div key={assignee.id} className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700">
                        {getInitials(assignee.name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{assignee.name}</p>
                        <p className="text-xs text-slate-500">{assignee.department}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No assignees</p>
              )}
            </CardContent>
          </Card>

          {/* Reporter Card */}
          <Card className={CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-emerald-800/70 uppercase tracking-wider">Reporter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-700">
                  {getInitials(task.created_by_name)}
                </div>
                <div>
                  <p className="text-sm font-medium">{task.created_by_name}</p>
                  <p className="text-xs text-slate-500">
                    Created {formatDate(task.created_at, 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Watchers Card */}
          <Card className={CARD_CLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-emerald-800/70 uppercase tracking-wider">
                Watchers ({task.watchers?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex -space-x-2">
                {task.watchers?.slice(0, 8).map((watcherId, i) => {
                  const watcher = users.find(u => u.id === watcherId);
                  return (
                    <div
                      key={watcherId}
                      className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-xs font-medium text-slate-700"
                      title={watcher?.name || 'User'}
                    >
                      {getInitials(watcher?.name)}
                    </div>
                  );
                })}
                {task.watchers?.length > 8 && (
                  <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-medium text-slate-600">
                    +{task.watchers.length - 8}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
