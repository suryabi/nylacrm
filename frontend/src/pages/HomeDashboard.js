import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { format, parseISO, addDays, startOfWeek, endOfWeek, isToday, isTomorrow } from 'date-fns';
import {
  LayoutDashboard, Loader2, Phone, Mail, Calendar, Clock, Target,
  CheckCircle, AlertTriangle, TrendingUp, Users, ChevronRight,
  Plus, X, CalendarDays, Activity, Zap, ArrowRight, Building2,
  User, AlertCircle, CheckSquare, Square, Circle, ChevronDown, ChevronUp, Send, ExternalLink
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Priority colors
const PRIORITY_COLORS = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200'
};

// Status colors for leads
const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  qualified: 'bg-green-100 text-green-700',
  proposal_sent: 'bg-purple-100 text-purple-700',
  negotiation: 'bg-orange-100 text-orange-700'
};

export default function HomeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [showNewMeetingDialog, setShowNewMeetingDialog] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [users, setUsers] = useState([]);
  const [taskFilter, setTaskFilter] = useState('assigned'); // 'assigned' or 'created'
  
  // New task form
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    task_type: 'general',
    priority: 'medium',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    due_time: '',
    assigned_to: ''
  });
  
  // New meeting form
  const [newMeeting, setNewMeeting] = useState({
    title: '',
    description: '',
    meeting_type: 'client',
    meeting_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '10:00',
    duration_minutes: 30,
    location: '',
    attendees: '',
    attendee_names: ''
  });
  
  // Week navigation for meetings
  const [meetingWeekStart, setMeetingWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  
  // Task expansion state
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [taskComment, setTaskComment] = useState('');
  const [taskReassignTo, setTaskReassignTo] = useState('');
  const [updatingTask, setUpdatingTask] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchUsers();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/dashboard`, { withCredentials: true });
      setDashboardData(response.data);
      
      // Auto-select the appropriate tab based on which list has items
      const tasks = response.data?.action_items?.tasks || [];
      const assignedToMe = tasks.filter(t => t.assigned_to === user?.id);
      const createdByMe = tasks.filter(t => t.assigned_by === user?.id || t.created_by === user?.id);
      
      if (assignedToMe.length === 0 && createdByMe.length > 0) {
        setTaskFilter('created');
      } else {
        setTaskFilter('assigned');
      }
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`, { withCredentials: true });
      setUsers(response.data.filter(u => u.is_active));
    } catch (error) {
      console.error('Failed to load users');
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Please enter a task title');
      return;
    }
    if (!newTask.assigned_to) {
      toast.error('Please select an assignee');
      return;
    }
    
    setSavingTask(true);
    try {
      await axios.post(`${API_URL}/tasks`, newTask, { withCredentials: true });
      toast.success('Task created successfully');
      setShowNewTaskDialog(false);
      setNewTask({
        title: '',
        description: '',
        task_type: 'general',
        priority: 'medium',
        due_date: format(new Date(), 'yyyy-MM-dd'),
        due_time: '',
        assigned_to: ''
      });
      fetchDashboardData();
    } catch (error) {
      toast.error('Failed to create task');
    } finally {
      setSavingTask(false);
    }
  };

  const handleCreateMeeting = async () => {
    if (!newMeeting.title.trim()) {
      toast.error('Please enter a meeting title');
      return;
    }
    
    setSavingMeeting(true);
    try {
      const meetingData = {
        ...newMeeting,
        attendees: newMeeting.attendees.split(',').map(e => e.trim()).filter(e => e),
        attendee_names: newMeeting.attendee_names.split(',').map(n => n.trim()).filter(n => n)
      };
      await axios.post(`${API_URL}/meetings`, meetingData, { withCredentials: true });
      toast.success('Meeting scheduled successfully');
      setShowNewMeetingDialog(false);
      setNewMeeting({
        title: '',
        description: '',
        meeting_type: 'client',
        meeting_date: format(new Date(), 'yyyy-MM-dd'),
        start_time: '10:00',
        duration_minutes: 30,
        location: '',
        attendees: '',
        attendee_names: ''
      });
      fetchDashboardData();
    } catch (error) {
      toast.error('Failed to schedule meeting');
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleCompleteTask = async (taskId) => {
    try {
      await axios.put(`${API_URL}/tasks/${taskId}`, { status: 'completed' }, { withCredentials: true });
      toast.success('Task completed');
      fetchDashboardData();
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to update task';
      toast.error(message);
    }
  };

  const handleUpdateTask = async (taskId) => {
    if (!taskComment.trim() && !taskReassignTo) {
      toast.error('Please add a comment or select someone to reassign');
      return;
    }
    
    setUpdatingTask(true);
    try {
      const updates = {};
      if (taskComment.trim()) {
        updates.comment = taskComment.trim();
      }
      if (taskReassignTo) {
        updates.assigned_to = taskReassignTo;
      }
      
      await axios.put(`${API_URL}/tasks/${taskId}`, updates, { withCredentials: true });
      toast.success(taskReassignTo ? 'Task reassigned' : 'Comment added');
      setExpandedTaskId(null);
      setTaskComment('');
      setTaskReassignTo('');
      fetchDashboardData();
    } catch (error) {
      toast.error('Failed to update task');
    } finally {
      setUpdatingTask(false);
    }
  };

  const toggleTaskExpand = (taskId, task = null) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      setTaskComment('');
      setTaskReassignTo('');
    } else {
      setExpandedTaskId(taskId);
      setTaskComment('');
      // Default reassign to the person who assigned the task
      setTaskReassignTo(task?.assigned_by || '');
    }
  };

  const getWinScoreColor = (score) => {
    if (score >= 70) return 'text-green-600 bg-green-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  // Get navigation URL for approval tasks
  const getApprovalTaskUrl = (task) => {
    if (!task.is_approval_task) return null;
    
    switch (task.approval_type) {
      case 'leave_request':
        return '/leaves';
      case 'proposal':
        return task.lead_id ? `/leads/${task.lead_id}` : null;
      case 'contract':
        return task.account_id ? `/accounts/${task.account_id}` : null;
      default:
        return null;
    }
  };

  // Get label for approval task link
  const getApprovalTaskLabel = (task) => {
    if (!task.is_approval_task) return null;
    
    switch (task.approval_type) {
      case 'leave_request':
        return 'View Leave Request';
      case 'proposal':
        return 'View Proposal';
      case 'contract':
        return 'View Contract';
      default:
        return 'View Details';
    }
  };

  const formatMeetingDate = (dateStr) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { action_items, upcoming_leads, recommended_leads, upcoming_meetings, today_summary, pipeline, monthly_performance, recent_activities } = dashboardData || {};

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="home-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {user?.name?.split(' ')[0]}!
          </h1>
          <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            setNewTask(prev => ({ ...prev, assigned_to: user?.id || '' }));
            setShowNewTaskDialog(true);
          }} data-testid="new-task-btn">
            <Plus className="h-4 w-4 mr-2" /> New Task
          </Button>
          <Button onClick={() => setShowNewMeetingDialog(true)} data-testid="new-meeting-btn">
            <Calendar className="h-4 w-4 mr-2" /> Schedule Meeting
          </Button>
        </div>
      </div>

      {/* Today's Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-700/50">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-600">TODAY'S ACTIVITIES</span>
          </div>
          <p className="text-2xl font-bold text-blue-700">{today_summary?.total_activities || 0}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-700/50">
          <div className="flex items-center gap-2 mb-2">
            <Phone className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium text-green-600">CALLS</span>
          </div>
          <p className="text-2xl font-bold text-green-700">{today_summary?.calls || 0}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-700/50">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-medium text-purple-600">EMAILS</span>
          </div>
          <p className="text-2xl font-bold text-purple-700">{today_summary?.emails || 0}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20 border-orange-200 dark:border-orange-700/50">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-orange-600" />
            <span className="text-xs font-medium text-orange-600">MEETINGS</span>
          </div>
          <p className="text-2xl font-bold text-orange-700">{today_summary?.meetings || 0}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Action Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action Items */}
          <Card className="p-0 overflow-hidden border-0 shadow-lg">
            <div className="flex items-center justify-between p-5 bg-gradient-to-r from-primary/10 to-primary/5 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-primary" />
                Action Items
              </h2>
              <Badge className="bg-primary/20 text-primary border-0 font-semibold">
                {(action_items?.tasks?.length || 0) + (action_items?.overdue_follow_ups?.length || 0)} pending
              </Badge>
            </div>
            
            <div className="p-5">
            {/* Task Filter Tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg mb-4 w-fit">
              <button
                onClick={() => setTaskFilter('assigned')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  taskFilter === 'assigned' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Assigned to Me
              </button>
              <button
                onClick={() => setTaskFilter('created')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  taskFilter === 'created' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Created by Me
              </button>
            </div>
            
            {/* Tasks */}
            {(() => {
              const filteredTasks = action_items?.tasks?.filter(task => 
                taskFilter === 'assigned' 
                  ? task.assigned_to === user?.id 
                  : (task.assigned_by === user?.id || task.created_by === user?.id)
              ) || [];
              
              return filteredTasks.length > 0 ? (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Tasks ({filteredTasks.length})
                </h3>
                <div className="space-y-3">
                  {filteredTasks.map(task => (
                    <div key={task.id} className="bg-card border rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-start gap-3 p-4">
                        {/* Complete button - only show for creator (or assignee for approval tasks) */}
                        {(task.assigned_by === user?.id || task.created_by === user?.id || 
                          (task.is_approval_task && task.assigned_to === user?.id)) ? (
                          <button
                            onClick={() => handleCompleteTask(task.id)}
                            className="mt-1 text-muted-foreground hover:text-green-600 transition-colors"
                            title="Mark complete"
                          >
                            <Square className="h-5 w-5" />
                          </button>
                        ) : (
                          <div className="mt-1 w-5" /> 
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-foreground">{task.title}</p>
                            <Badge variant="outline" className="text-xs capitalize border-primary/30 text-primary">
                              {task.status?.replace('_', ' ') || 'pending'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Due: {format(parseISO(task.due_date), 'MMM d')}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.assigned_to === user?.id ? 'You' : task.assigned_to_name || 'Unassigned'}
                            </span>
                            {task.created_by === user?.id && task.assigned_to !== user?.id && (
                              <Badge variant="secondary" className="text-xs py-0">Created by you</Badge>
                            )}
                          </div>
                          {/* Latest Comment Preview */}
                          {task.comments?.length > 0 && (
                            <div className="mt-2 p-2 bg-muted/50 rounded-lg border-l-2 border-primary/50">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">{task.comments[task.comments.length - 1].created_by_name}:</span>{' '}
                                {task.comments[task.comments.length - 1].text}
                              </p>
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                {format(parseISO(task.comments[task.comments.length - 1].created_at), 'MMM d, h:mm a')}
                              </p>
                            </div>
                          )}
                          {/* Navigation link for approval tasks */}
                          {task.is_approval_task && getApprovalTaskUrl(task) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(getApprovalTaskUrl(task));
                              }}
                              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {getApprovalTaskLabel(task)}
                            </button>
                          )}
                        </div>
                        <Badge className={`${PRIORITY_COLORS[task.priority]} shrink-0`}>{task.priority}</Badge>
                        <button
                          onClick={() => toggleTaskExpand(task.id, task)}
                          className="text-muted-foreground hover:text-primary p-1.5 hover:bg-muted rounded-lg transition-colors"
                          title={expandedTaskId === task.id ? "Collapse" : "Expand"}
                        >
                          {expandedTaskId === task.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      
                      {/* Expanded section */}
                      {expandedTaskId === task.id && (
                        <div className="px-4 pb-4 pt-2 border-t space-y-3">
                          {task.description && (
                            <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded-lg">{task.description}</p>
                          )}
                          <div className="flex gap-2">
                            <Input
                              placeholder="Add an update..."
                              value={taskComment}
                              onChange={(e) => setTaskComment(e.target.value)}
                              className="flex-1 h-10 bg-background border-2 border-muted focus:border-primary shadow-sm"
                            />
                            <Select value={taskReassignTo} onValueChange={setTaskReassignTo}>
                              <SelectTrigger className="w-[150px] h-10 bg-background border-2 border-muted">
                                <SelectValue placeholder="Reassign to" />
                              </SelectTrigger>
                              <SelectContent>
                                {users.filter(u => u.id !== task.assigned_to).map(u => (
                                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              className="h-10 px-4"
                              onClick={() => handleUpdateTask(task.id)}
                              disabled={updatingTask || (!taskComment.trim() && !taskReassignTo)}
                            >
                              {updatingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No tasks {taskFilter === 'assigned' ? 'assigned to you' : 'created by you'}</p>
              </div>
            );
            })()}
            
            {/* Overdue Follow-ups */}
            {action_items?.overdue_follow_ups?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Overdue Follow-ups
                </h3>
                <div className="space-y-3">
                  {action_items.overdue_follow_ups.map(lead => (
                    <div
                      key={lead.id}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                      className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{lead.company}</p>
                        <p className="text-xs text-red-600 mt-0.5">Was due: {format(parseISO(lead.next_follow_up), 'MMM d')}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {(!action_items?.tasks?.length && !action_items?.overdue_follow_ups?.length) && (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500/50 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">All caught up!</p>
                <p className="text-sm text-muted-foreground/70">No pending action items</p>
              </div>
            )}
            </div>
          </Card>

          {/* Upcoming Leads */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Upcoming Follow-ups
              </h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/follow-ups')}>
                View all <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            
            {upcoming_leads?.length > 0 ? (
              <div className="space-y-2">
                {upcoming_leads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{lead.company}</p>
                      <p className="text-xs text-muted-foreground">{lead.contact_person}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="text-xs">
                        {formatMeetingDate(lead.next_follow_up)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No upcoming follow-ups this week</p>
            )}
          </Card>

          {/* Smart Lead Recommendations */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Leads to Focus On
              </h2>
              <span className="text-xs text-muted-foreground">Based on win probability</span>
            </div>
            
            {recommended_leads?.length > 0 ? (
              <div className="space-y-3">
                {recommended_leads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${getWinScoreColor(lead.win_score)}`}>
                      {lead.win_score}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{lead.company}</p>
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-700'} variant="secondary">
                          {lead.status?.replace(/_/g, ' ')}
                        </Badge>
                        {lead.next_follow_up && (
                          <span className="text-xs text-muted-foreground">
                            Follow-up: {format(parseISO(lead.next_follow_up), 'MMM d')}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No lead recommendations</p>
            )}
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Monthly Performance */}
          <Card className="p-5">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Target className="h-5 w-5 text-primary" />
              Monthly Performance
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Target</span>
                <span className="font-medium">₹{((monthly_performance?.target || 0) / 100000).toFixed(1)}L</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Achieved</span>
                <span className="font-medium text-green-600">₹{((monthly_performance?.actual || 0) / 100000).toFixed(1)}L</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(monthly_performance?.percentage || 0, 100)}%` }}
                />
              </div>
              <p className="text-center text-sm font-medium">
                {monthly_performance?.percentage || 0}% of target achieved
              </p>
            </div>
          </Card>

          {/* Pipeline Summary */}
          <Card className="p-5">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              Pipeline Summary
            </h2>
            <div className="space-y-2">
              {pipeline?.map(item => (
                <div key={item.status} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{item.status.replace(/_/g, ' ')}</span>
                  <Badge variant="secondary">{item.count}</Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Upcoming Meetings */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Upcoming Meetings
              </h2>
            </div>
            
            {upcoming_meetings?.length > 0 ? (
              <div className="space-y-3">
                {upcoming_meetings.slice(0, 5).map(meeting => (
                  <div key={meeting.id} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-start justify-between mb-1">
                      <p className="font-medium text-sm truncate">{meeting.title}</p>
                      <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
                        {formatMeetingDate(meeting.meeting_date)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {meeting.start_time} • {meeting.duration_minutes} min
                    </p>
                    {meeting.location && (
                      <p className="text-xs text-muted-foreground truncate mt-1">{meeting.location}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4 text-sm">No meetings scheduled</p>
            )}
          </Card>

          {/* Recent Activity */}
          <Card className="p-5">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-primary" />
              Recent Activity
            </h2>
            {recent_activities?.length > 0 ? (
              <div className="space-y-3">
                {recent_activities.slice(0, 5).map(activity => (
                  <div key={activity.id} className="flex items-start gap-2 text-sm">
                    <Circle className="h-2 w-2 mt-1.5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">
                        <span className="font-medium">{activity.activity_type}</span>
                        {activity.company && <span className="text-muted-foreground"> - {activity.company}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4 text-sm">No recent activity</p>
            )}
          </Card>
        </div>
      </div>

      {/* New Task Dialog */}
      <Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>Add a task for yourself or assign to a team member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="Enter task title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Add details..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newTask.task_type} onValueChange={(v) => setNewTask({ ...newTask, task_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="visit">Visit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date *</Label>
                <Input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Time (optional)</Label>
                <Input
                  type="time"
                  value={newTask.due_time}
                  onChange={(e) => setNewTask({ ...newTask, due_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign To *</Label>
              <Select value={newTask.assigned_to} onValueChange={(v) => setNewTask({ ...newTask, assigned_to: v })}>
                <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={user?.id}>Myself ({user?.name})</SelectItem>
                  {users.filter(u => u.id !== user?.id).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTaskDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={savingTask}>
              {savingTask ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Meeting Dialog */}
      <Dialog open={showNewMeetingDialog} onOpenChange={setShowNewMeetingDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Schedule Meeting</DialogTitle>
            <DialogDescription>Create a new meeting entry</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={newMeeting.title}
                onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                placeholder="Meeting title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newMeeting.description}
                onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value })}
                placeholder="Meeting agenda..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newMeeting.meeting_type} onValueChange={(v) => setNewMeeting({ ...newMeeting, meeting_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client Meeting</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={newMeeting.duration_minutes.toString()} onValueChange={(v) => setNewMeeting({ ...newMeeting, duration_minutes: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="90">1.5 hours</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={newMeeting.meeting_date}
                  onChange={(e) => setNewMeeting({ ...newMeeting, meeting_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Start Time *</Label>
                <Input
                  type="time"
                  value={newMeeting.start_time}
                  onChange={(e) => setNewMeeting({ ...newMeeting, start_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location / Link</Label>
              <Input
                value={newMeeting.location}
                onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                placeholder="Office, Zoom link, or address"
              />
            </div>
            <div className="space-y-2">
              <Label>Attendee Emails</Label>
              <Input
                value={newMeeting.attendees}
                onChange={(e) => setNewMeeting({ ...newMeeting, attendees: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
              />
              <p className="text-xs text-muted-foreground">Separate multiple emails with commas</p>
            </div>
            <div className="space-y-2">
              <Label>Attendee Names</Label>
              <Input
                value={newMeeting.attendee_names}
                onChange={(e) => setNewMeeting({ ...newMeeting, attendee_names: e.target.value })}
                placeholder="John Doe, Jane Smith"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewMeetingDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateMeeting} disabled={savingMeeting}>
              {savingMeeting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Schedule Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
