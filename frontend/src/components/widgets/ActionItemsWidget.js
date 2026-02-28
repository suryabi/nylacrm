import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
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

// Priority colors
const PRIORITY_COLORS = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200'
};

export function ActionItemsWidget({
  actionItems,
  user,
  users,
  taskFilter,
  setTaskFilter,
  onCompleteTask,
  onUpdateTask,
  onNewTask
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

  return (
    <Card className="p-0 overflow-hidden border-0 shadow-lg">
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-primary/10 to-primary/5 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-primary" />
          Action Items
        </h2>
        <div className="flex items-center gap-3">
          <Badge className="bg-primary/20 text-primary border-0 font-semibold">
            {(actionItems?.tasks?.length || 0) + (actionItems?.overdue_follow_ups?.length || 0)} pending
          </Badge>
          <Button size="sm" variant="outline" onClick={onNewTask} data-testid="new-task-btn">
            <Plus className="h-4 w-4 mr-1" /> New Task
          </Button>
        </div>
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
        {filteredTasks.length > 0 ? (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Tasks ({filteredTasks.length})
            </h3>
            <div className="space-y-3">
              {filteredTasks.map(task => (
                <div key={task.id} className="bg-card border rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-start gap-3 p-4">
                    {/* Complete button */}
                    {(task.assigned_by === user?.id || task.created_by === user?.id ||
                      (task.is_approval_task && task.assigned_to === user?.id)) ? (
                      <button
                        onClick={() => onCompleteTask(task.id)}
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
        )}
        
        {/* Overdue Follow-ups */}
        {actionItems?.overdue_follow_ups?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Overdue Follow-ups
            </h3>
            <div className="space-y-3">
              {actionItems.overdue_follow_ups.map(lead => (
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
        
        {(!actionItems?.tasks?.length && !actionItems?.overdue_follow_ups?.length) && (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500/50 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">All caught up!</p>
            <p className="text-sm text-muted-foreground/70">No pending action items</p>
          </div>
        )}
      </div>
    </Card>
  );
}
