import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isValid } from 'date-fns';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Loader2, Clock, CheckCircle, AlertTriangle, ChevronRight, Plus,
  User, AlertCircle, CheckSquare, Square, ChevronDown, ChevronUp, Send, ExternalLink
} from 'lucide-react';

// Safe date formatter
const formatSafeDate = (dateString, formatStr = 'MMM d') => {
  if (!dateString) return 'N/A';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return 'N/A';
    return format(date, formatStr);
  } catch (e) {
    return 'N/A';
  }
};

// Priority colors
const PRIORITY_STYLES = {
  urgent: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  high: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
  medium: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
};

export function ActionItemsWidget({
  actionItems,
  user,
  users,
  taskFilter,
  setTaskFilter,
  onCompleteTask,
  onUpdateTask
}) {
  const navigate = useNavigate();
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [taskComment, setTaskComment] = useState('');
  const [taskReassignTo, setTaskReassignTo] = useState('');
  const [updatingTask, setUpdatingTask] = useState(false);

  const toggleTaskExpand = (taskId, task = null) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      setTaskComment('');
      setTaskReassignTo('');
    } else {
      setExpandedTaskId(taskId);
      setTaskComment('');
      setTaskReassignTo(task?.assigned_by || '');
    }
  };

  const handleUpdateTask = async (taskId) => {
    if (!taskComment.trim() && !taskReassignTo) return;
    
    setUpdatingTask(true);
    const updates = {};
    if (taskComment.trim()) updates.comment = taskComment.trim();
    if (taskReassignTo) updates.assigned_to = taskReassignTo;
    
    await onUpdateTask(taskId, updates);
    setExpandedTaskId(null);
    setTaskComment('');
    setTaskReassignTo('');
    setUpdatingTask(false);
  };

  // Get navigation URL for approval tasks
  const getApprovalTaskUrl = (task) => {
    if (!task.is_approval_task) return null;
    switch (task.approval_type) {
      case 'leave_request': return '/leaves';
      case 'proposal': return task.lead_id ? `/leads/${task.lead_id}` : null;
      case 'contract': return task.account_id ? `/accounts/${task.account_id}` : null;
      default: return null;
    }
  };

  const getApprovalTaskLabel = (task) => {
    if (!task.is_approval_task) return null;
    switch (task.approval_type) {
      case 'leave_request': return 'View Leave Request';
      case 'proposal': return 'View Proposal';
      case 'contract': return 'View Contract';
      default: return 'View Details';
    }
  };

  const filteredTasks = actionItems?.tasks?.filter(task =>
    taskFilter === 'assigned'
      ? task.assigned_to === user?.id
      : (task.assigned_by === user?.id || task.created_by === user?.id)
  ) || [];

  const pendingCount = (actionItems?.tasks?.length || 0) + (actionItems?.overdue_follow_ups?.length || 0);

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
      {/* Header */}
      <div className="p-4 sm:p-5 pb-3 sm:pb-4 flex flex-col gap-3 sm:gap-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/50 dark:to-purple-900/30">
              <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-white">Action Items</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{pendingCount} items need attention</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline"
              size="sm"
              onClick={() => navigate('/tasks')}
              className="h-8 sm:h-9 px-2 sm:px-4"
            >
              <ExternalLink className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">View All</span>
            </Button>
          </div>
        </div>
        
        {/* Filter Tabs - Full width on mobile */}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => setTaskFilter('assigned')}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              taskFilter === 'assigned'
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Assigned to Me
          </button>
          <button
            onClick={() => setTaskFilter('created')}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              taskFilter === 'created'
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Created by Me
          </button>
        </div>
      </div>
      
      <div className="p-5">
        {/* Tasks */}
        {filteredTasks.length > 0 ? (
          <div className="space-y-3">
            {filteredTasks.map(task => (
              <div 
                key={task.id} 
                className="bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-xl hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200"
              >
                <div className="flex items-start gap-3 p-4">
                  {/* Complete button */}
                  {(task.assigned_by === user?.id || task.created_by === user?.id ||
                    (task.is_approval_task && task.assigned_to === user?.id)) ? (
                    <button
                      onClick={() => onCompleteTask(task.id)}
                      className="mt-0.5 text-slate-300 hover:text-emerald-500 dark:text-slate-600 dark:hover:text-emerald-400 transition-colors"
                      title="Mark complete"
                    >
                      <Square className="h-5 w-5" />
                    </button>
                  ) : (
                    <div className="mt-0.5 w-5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-800 dark:text-white">{task.title}</p>
                      <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0">
                        {task.status?.replace('_', ' ') || 'pending'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Due: {formatSafeDate(task.due_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {task.assigned_to === user?.id ? 'You' : task.assigned_to_name || 'Unassigned'}
                      </span>
                    </div>
                    {/* Latest Comment Preview */}
                    {task.comments?.length > 0 && (
                      <div className="mt-2 p-2 bg-white dark:bg-slate-800/50 rounded-lg border-l-2 border-violet-400">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{task.comments[task.comments.length - 1].created_by_name}:</span>{' '}
                          {task.comments[task.comments.length - 1].text}
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
                  <Badge className={`${PRIORITY_STYLES[task.priority]} shrink-0 text-[10px] font-medium border`}>{task.priority}</Badge>
                  <button
                    onClick={() => toggleTaskExpand(task.id, task)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
                  <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    {task.description && (
                      <p className="text-sm text-muted-foreground bg-white dark:bg-slate-800/50 p-3 rounded-lg">{task.description}</p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a comment..."
                        value={taskComment}
                        onChange={(e) => setTaskComment(e.target.value)}
                        className="flex-1 h-9 text-sm bg-white dark:bg-slate-800"
                      />
                      <Select value={taskReassignTo} onValueChange={setTaskReassignTo}>
                        <SelectTrigger className="w-[140px] h-9 text-sm bg-white dark:bg-slate-800">
                          <SelectValue placeholder="Reassign" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.filter(u => u.id !== task.assigned_to).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-9 px-4"
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
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-emerald-200 dark:text-emerald-900/50 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-400 font-medium">All caught up!</p>
            <p className="text-sm text-muted-foreground">No tasks {taskFilter === 'assigned' ? 'assigned to you' : 'created by you'}</p>
          </div>
        )}
        
        {/* Overdue Follow-ups */}
        {actionItems?.overdue_follow_ups?.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Overdue Follow-ups
            </h3>
            <div className="space-y-2">
              {actionItems.overdue_follow_ups.map(lead => (
                <div
                  key={lead.id}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/20 transition-all duration-200"
                >
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 dark:text-white truncate">{lead.company}</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">Was due: {formatSafeDate(lead.next_follow_up)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-red-400" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
