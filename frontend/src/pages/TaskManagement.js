import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO, isValid, isPast, isToday } from 'date-fns';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';
import {
  Plus, Search, LayoutList, Kanban, Target, Tag, 
  Calendar, User, Users, AlertTriangle, CheckCircle2,
  Circle, ArrowRight, MoreHorizontal, Loader2, Flag, Building2,
  Eye, Pencil, Trash2, X, ChevronDown, Settings, Flame, Clock
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const SEVERITY_STYLES = {
  high: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  low: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' }
};

const STATUS_CONFIG = {
  open: { label: 'Open', icon: Circle, color: 'text-blue-600', bg: 'bg-blue-50' },
  in_progress: { label: 'In Progress', icon: ArrowRight, color: 'text-amber-600', bg: 'bg-amber-50' },
  review: { label: 'In Review', icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50' },
  closed: { label: 'Closed', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' }
};

const KANBAN_COLUMNS = ['open', 'in_progress', 'review', 'closed'];

const TABLE_HEADER_CLASS = "text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs";

const getTableRowClass = (index) => `border-b border-emerald-50 transition-colors duration-200 cursor-pointer ${index % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'} hover:bg-emerald-50/60`;

const getInitials = (name) => {
  if (!name) return 'NA';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const formatDate = (dateString, formatStr = 'MMM d, yyyy') => {
  if (!dateString) return null;
  try {
    const date = parseISO(dateString);
    return isValid(date) ? format(date, formatStr) : null;
  } catch { return null; }
};

const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  try {
    const date = parseISO(dueDate);
    return isValid(date) && isPast(date) && !isToday(date);
  } catch { return false; }
};

// ─── Metric Card ────────────────────────────────────────
function MetricCard({ label, value, icon: Icon, color, bg, iconBg, isActive, onClick, testId }) {
  return (
    <Card
      onClick={onClick}
      className={`border rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)] hover:shadow-[0_8px_24px_rgba(6,95,70,0.08)] hover:-translate-y-[2px] transition-[transform,box-shadow] duration-300 cursor-pointer ${bg} ${isActive ? 'ring-2 ring-emerald-500 border-emerald-300' : 'border-emerald-100/60'}`}
      data-testid={testId}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${iconBg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div>
            <p className="text-xl font-light text-slate-900 dark:text-white">{value}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Task Table ─────────────────────────────────────────
function TaskTable({ tasks, navigate, openEditTask, handleDeleteTask }) {
  return (
    <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-emerald-50/30 border-b border-emerald-100/60">
                {['Task', 'Status', 'Severity', 'Department', 'Assignees', 'Due Date', ''].map(h => (
                  <th key={h} className={`${TABLE_HEADER_CLASS} ${h === '' ? 'text-center' : ''}`}>{h || 'Actions'}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">No tasks found.</td></tr>
              ) : tasks.map((task, index) => (
                <tr key={task.id} className={getTableRowClass(index)} onClick={() => navigate(`/tasks/${task.id}`)} data-testid={`task-row-${task.id}`}>
                  <td className="p-4" style={{ maxWidth: '400px' }}>
                    <p className="font-medium text-slate-900 dark:text-white truncate" style={{ maxWidth: '400px' }} title={task.title}>{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500">{task.task_number}</span>
                      {task.labels_data?.map(label => (
                        <Badge key={label.id} className="text-[10px] px-1.5 py-0" style={{ backgroundColor: label.color + '20', color: label.color, borderColor: label.color }}>{label.name}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge variant="outline" className={`${STATUS_CONFIG[task.status]?.bg} ${STATUS_CONFIG[task.status]?.color} border-0`}>
                      {STATUS_CONFIG[task.status]?.label || task.status}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge className={`${SEVERITY_STYLES[task.severity]?.bg} ${SEVERITY_STYLES[task.severity]?.text} ${SEVERITY_STYLES[task.severity]?.border} border`}>{task.severity}</Badge>
                  </td>
                  <td className="p-4 text-slate-600">{task.department_id}</td>
                  <td className="p-4">
                    <div className="flex -space-x-2">
                      {task.assignees_data?.slice(0, 3).map(a => (
                        <div key={a.id} className="w-8 h-8 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-xs font-medium text-emerald-700" title={a.name}>{getInitials(a.name)}</div>
                      ))}
                      {task.assignees?.length > 3 && <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-xs font-medium text-slate-600">+{task.assignees.length - 3}</div>}
                    </div>
                  </td>
                  <td className="p-4">
                    {task.due_date ? (
                      <div className={`flex items-center gap-1.5 ${isOverdue(task.due_date) ? 'text-red-600' : 'text-slate-600'}`}>
                        <Calendar className="h-4 w-4" />
                        {formatDate(task.due_date, 'MMM d')}
                        {isOverdue(task.due_date) && <AlertTriangle className="h-3 w-3" />}
                      </div>
                    ) : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="p-4 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={e => { e.stopPropagation(); openEditTask(task); }}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={e => { e.stopPropagation(); handleDeleteTask(task.id); }}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Kanban Board ───────────────────────────────────────
function KanbanBoard({ tasks, navigate, handleStatusChange }) {
  const tasksByStatus = KANBAN_COLUMNS.reduce((acc, status) => {
    acc[status] = tasks.filter(t => t.status === status);
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kanban-board">
      {KANBAN_COLUMNS.map(status => (
        <div key={status} className="space-y-3">
          <div className={`flex items-center gap-2 p-3 rounded-lg ${STATUS_CONFIG[status]?.bg}`}>
            {React.createElement(STATUS_CONFIG[status]?.icon, { className: `h-4 w-4 ${STATUS_CONFIG[status]?.color}` })}
            <span className={`font-medium text-sm ${STATUS_CONFIG[status]?.color}`}>{STATUS_CONFIG[status]?.label}</span>
            <Badge variant="secondary" className="ml-auto text-xs">{tasksByStatus[status]?.length || 0}</Badge>
          </div>
          <div className="space-y-2 min-h-[200px]">
            {tasksByStatus[status]?.map(task => (
              <Card key={task.id} className="cursor-pointer hover:shadow-md transition-shadow border-l-4" style={{ borderLeftColor: task.severity === 'high' ? '#ef4444' : task.severity === 'medium' ? '#f59e0b' : '#10b981' }} onClick={() => navigate(`/tasks/${task.id}`)} data-testid={`kanban-card-${task.id}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-slate-900 dark:text-white line-clamp-2">{task.title}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0"><MoreHorizontal className="h-3 w-3" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {KANBAN_COLUMNS.filter(s => s !== status).map(ns => (
                          <DropdownMenuItem key={ns} onClick={e => { e.stopPropagation(); handleStatusChange(task.id, ns); }}>Move to {STATUS_CONFIG[ns]?.label}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {task.labels_data?.slice(0, 2).map(label => (
                      <span key={label.id} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: label.color + '20', color: label.color }}>{label.name}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{task.task_number}</span>
                    {task.due_date && <span className={isOverdue(task.due_date) ? 'text-red-600 font-medium' : ''}>{formatDate(task.due_date, 'MMM d')}</span>}
                  </div>
                  {task.assignees_data?.length > 0 && (
                    <div className="flex -space-x-1.5 pt-1">
                      {task.assignees_data.slice(0, 3).map(a => (
                        <div key={a.id} className="w-6 h-6 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-[10px] font-medium text-emerald-700" title={a.name}>{getInitials(a.name)}</div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Department Multi-Select Popover ────────────────────
function DeptMultiSelect({ departments, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(d => d !== id) : [...selected, id]);
  };
  const allSelected = selected.length === departments.length;
  const toggleAll = () => onChange(allSelected ? [] : departments.map(d => d.id));
  const label = selected.length === 0 ? 'All Departments' : selected.length === 1 ? selected[0] : `${selected.length} Depts`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 min-w-[140px] justify-between text-sm font-normal" data-testid="task-dept-multi-filter">
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="px-2 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded" onClick={toggleAll}>
          <Checkbox checked={allSelected} />
          <span className="text-sm font-medium">Select All</span>
        </div>
        <DropdownMenuSeparator />
        {departments.map(d => (
          <div key={d.id} className="px-2 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded" onClick={() => toggle(d.id)}>
            <Checkbox checked={selected.includes(d.id)} />
            <span className="text-sm">{d.name}</span>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


// ═════════════════════════════════════════════════════════
// ─── MAIN COMPONENT ─────────────────────────────────────
// ═════════════════════════════════════════════════════════

export default function TaskManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Core state
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [labels, setLabels] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [user, setUser] = useState(null);

  // Primary tab: "my" or "all"
  const [primaryTab, setPrimaryTab] = useState(searchParams.get('primary') || 'my');
  // Sub-view: "list", "kanban", "milestones", "labels"
  const [subView, setSubView] = useState(searchParams.get('sub') || 'list');
  const [searchQuery, setSearchQuery] = useState('');

  // "My Tasks" filters
  const [myFilters, setMyFilters] = useState({
    status: '',
    severity: '',
    activeMetric: '',  // track which metric card is active
  });
  const [myOverdue, setMyOverdue] = useState(false);

  // "All Tasks" filters
  const [allFilters, setAllFilters] = useState({
    status: '',
    severity: '',
    department_ids: [],
    assignee_id: '',
    view: 'all',
    activeMetric: '',
  });
  const [allOverdue, setAllOverdue] = useState(false);
  const [deptInitialized, setDeptInitialized] = useState(false);

  // Dialog state
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editingLabel, setEditingLabel] = useState(null);
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', severity: 'medium', status: 'open',
    department_id: '', assignees: [], milestone_id: '', labels: [],
    due_date: '', reminder_date: '', linked_entity_type: '', linked_entity_id: ''
  });
  const [labelForm, setLabelForm] = useState({ name: '', color: '#6366f1', description: '' });
  const [milestoneForm, setMilestoneForm] = useState({ title: '', description: '', due_date: '', department_id: '' });

  const canManageSettings = user && ['CEO', 'Director', 'System Admin'].some(r => user.role?.toLowerCase() === r.toLowerCase());

  // Headers helper
  const getHeaders = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  // ─── Fetch ────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const headers = getHeaders();

      // Build params based on primary tab
      const params = {};
      if (primaryTab === 'my') {
        params.view = 'mine';
        if (myFilters.status) params.status = myFilters.status;
        if (myFilters.severity) params.severity = myFilters.severity;
        if (myOverdue) params.overdue = 'true';
      } else {
        if (allFilters.view && allFilters.view !== 'all') params.view = allFilters.view;
        if (allFilters.department_ids.length > 0) params.department_id = allFilters.department_ids.join(',');
        if (allFilters.status) params.status = allFilters.status;
        if (allFilters.severity) params.severity = allFilters.severity;
        if (allFilters.assignee_id) params.assignee_id = allFilters.assignee_id;
        if (allOverdue) params.overdue = 'true';
      }

      // Build stats params
      const statsParams = {};
      if (allFilters.department_ids.length > 0) statsParams.department_id = allFilters.department_ids.join(',');

      const [tasksRes, labelsRes, milestonesRes, deptRes, usersRes, statsRes, meRes] = await Promise.all([
        axios.get(`${API}/api/task-management/tasks`, { headers, params }),
        axios.get(`${API}/api/task-management/labels`, { headers }),
        axios.get(`${API}/api/task-management/milestones`, { headers }),
        axios.get(`${API}/api/task-management/departments`, { headers }),
        axios.get(`${API}/api/users`, { headers }),
        axios.get(`${API}/api/task-management/tasks/stats`, { headers, params: statsParams }),
        axios.get(`${API}/api/auth/me`, { headers })
      ]);

      setTasks(tasksRes.data);
      setLabels(labelsRes.data);
      setMilestones(milestonesRes.data);
      setDepartments(deptRes.data);
      setUsers(usersRes.data);
      setStats(statsRes.data);
      setUser(meRes.data);

      // Default "All Tasks" department filter to user's departments (once)
      if (!deptInitialized && meRes.data) {
        const userDepts = Array.isArray(meRes.data.department) ? meRes.data.department : [meRes.data.department].filter(Boolean);
        if (userDepts.length > 0) {
          setAllFilters(f => ({ ...f, department_ids: userDepts }));
        }
        setDeptInitialized(true);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [primaryTab, myFilters, myOverdue, allFilters, allOverdue, deptInitialized]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // URL sync
  useEffect(() => {
    const params = { primary: primaryTab, sub: subView };
    setSearchParams(params, { replace: true });
  }, [primaryTab, subView, setSearchParams]);

  // ─── CRUD handlers ────────────────────────────────────
  const handleSaveTask = async () => {
    if (!taskForm.title.trim()) { toast.error('Task title is required'); return; }
    if (!taskForm.department_id) { toast.error('Department is required'); return; }
    setSaving(true);
    try {
      const headers = getHeaders();
      if (editingTask) {
        await axios.put(`${API}/api/task-management/tasks/${editingTask.id}`, taskForm, { headers });
        toast.success('Task updated');
      } else {
        await axios.post(`${API}/api/task-management/tasks`, taskForm, { headers });
        toast.success('Task created');
      }
      setShowTaskDialog(false);
      resetTaskForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save task');
    } finally { setSaving(false); }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try { await axios.delete(`${API}/api/task-management/tasks/${taskId}`, { headers: getHeaders() }); toast.success('Task deleted'); fetchData(); }
    catch { toast.error('Failed to delete task'); }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try { await axios.put(`${API}/api/task-management/tasks/${taskId}`, { status: newStatus }, { headers: getHeaders() }); fetchData(); }
    catch { toast.error('Failed to update status'); }
  };

  const handleSaveLabel = async () => {
    if (!labelForm.name.trim()) { toast.error('Label name is required'); return; }
    setSaving(true);
    try {
      const headers = getHeaders();
      if (editingLabel) { await axios.put(`${API}/api/task-management/labels/${editingLabel.id}`, labelForm, { headers }); toast.success('Label updated'); }
      else { await axios.post(`${API}/api/task-management/labels`, labelForm, { headers }); toast.success('Label created'); }
      setShowLabelDialog(false); setLabelForm({ name: '', color: '#6366f1', description: '' }); setEditingLabel(null); fetchData();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to save label'); }
    finally { setSaving(false); }
  };

  const handleDeleteLabel = async (labelId) => {
    if (!window.confirm('Delete this label?')) return;
    try { await axios.delete(`${API}/api/task-management/labels/${labelId}`, { headers: getHeaders() }); toast.success('Label deleted'); fetchData(); }
    catch { toast.error('Failed to delete label'); }
  };

  const handleSaveMilestone = async () => {
    if (!milestoneForm.title.trim()) { toast.error('Milestone title is required'); return; }
    setSaving(true);
    try {
      const headers = getHeaders();
      if (editingMilestone) { await axios.put(`${API}/api/task-management/milestones/${editingMilestone.id}`, milestoneForm, { headers }); toast.success('Milestone updated'); }
      else { await axios.post(`${API}/api/task-management/milestones`, milestoneForm, { headers }); toast.success('Milestone created'); }
      setShowMilestoneDialog(false); setMilestoneForm({ title: '', description: '', due_date: '', department_id: '' }); setEditingMilestone(null); fetchData();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to save milestone'); }
    finally { setSaving(false); }
  };

  const handleDeleteMilestone = async (milestoneId) => {
    if (!window.confirm('Delete this milestone?')) return;
    try { await axios.delete(`${API}/api/task-management/milestones/${milestoneId}`, { headers: getHeaders() }); toast.success('Milestone deleted'); fetchData(); }
    catch { toast.error('Failed to delete milestone'); }
  };

  const resetTaskForm = () => {
    setTaskForm({
      title: '', description: '', severity: 'medium', status: 'open',
      department_id: Array.isArray(user?.department) ? (user.department[0] || '') : (user?.department || ''),
      assignees: [], milestone_id: '', labels: [], due_date: '', reminder_date: '',
      linked_entity_type: '', linked_entity_id: ''
    });
    setEditingTask(null);
  };

  const openEditTask = (task) => {
    setTaskForm({
      title: task.title, description: task.description || '', severity: task.severity, status: task.status,
      department_id: task.department_id, assignees: task.assignees || [], milestone_id: task.milestone_id || '',
      labels: task.labels || [], due_date: task.due_date || '', reminder_date: task.reminder_date || '',
      linked_entity_type: task.linked_entity_type || '', linked_entity_id: task.linked_entity_id || ''
    });
    setEditingTask(task);
    setShowTaskDialog(true);
  };

  // Filter displayed tasks by search
  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(t => t.title?.toLowerCase().includes(q) || t.task_number?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
  }, [tasks, searchQuery]);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  }

  // ─── Render helpers ───────────────────────────────────
  const renderMyMetrics = () => {
    if (!stats) return null;
    const metrics = [
      { label: 'Total', value: stats.my_total || 0, icon: LayoutList, color: 'text-slate-700', bg: 'bg-slate-50', iconBg: 'bg-slate-100', key: '' },
      { label: 'Assigned to Me', value: stats.my_tasks || 0, icon: User, color: 'text-blue-600', bg: 'bg-blue-50', iconBg: 'bg-blue-100', key: 'assigned' },
      { label: 'Created by Me', value: stats.created_by_me || 0, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', key: 'created' },
      { label: 'In Progress', value: stats.my_in_progress || 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', iconBg: 'bg-amber-100', key: 'in_progress' },
      { label: 'Overdue', value: stats.my_overdue || 0, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', iconBg: 'bg-red-100', key: 'overdue' },
      { label: 'High Priority', value: stats.my_high_severity || 0, icon: Flame, color: 'text-orange-600', bg: 'bg-orange-50', iconBg: 'bg-orange-100', key: 'high' },
    ];
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="my-task-stats">
        {metrics.map(m => (
          <MetricCard key={m.label} {...m} isActive={myFilters.activeMetric === m.key}
            testId={`my-stat-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => {
              if (m.key === 'overdue') { setMyOverdue(true); setMyFilters({ status: '', severity: '', activeMetric: 'overdue' }); }
              else if (m.key === 'assigned') { setMyOverdue(false); setMyFilters({ status: '', severity: '', activeMetric: 'assigned' }); }
              else if (m.key === 'created') { setMyOverdue(false); setMyFilters({ status: '', severity: '', activeMetric: 'created' }); }
              else if (m.key === 'in_progress') { setMyOverdue(false); setMyFilters({ status: 'in_progress', severity: '', activeMetric: 'in_progress' }); }
              else if (m.key === 'high') { setMyOverdue(false); setMyFilters({ status: '', severity: 'high', activeMetric: 'high' }); }
              else { setMyOverdue(false); setMyFilters({ status: '', severity: '', activeMetric: '' }); }
            }}
          />
        ))}
      </div>
    );
  };

  const renderAllMetrics = () => {
    if (!stats) return null;
    const metrics = [
      { label: 'Total', value: stats.total || 0, icon: LayoutList, color: 'text-slate-700', bg: 'bg-slate-50', iconBg: 'bg-slate-100', key: '' },
      { label: 'Open', value: stats.by_status?.open || 0, icon: Circle, color: 'text-blue-600', bg: 'bg-blue-50', iconBg: 'bg-blue-100', key: 'open' },
      { label: 'In Progress', value: stats.by_status?.in_progress || 0, icon: ArrowRight, color: 'text-amber-600', bg: 'bg-amber-50', iconBg: 'bg-amber-100', key: 'in_progress' },
      { label: 'In Review', value: stats.by_status?.review || 0, icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50', iconBg: 'bg-purple-100', key: 'review' },
      { label: 'Overdue', value: stats.overdue || 0, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', iconBg: 'bg-red-100', key: 'overdue' },
      { label: 'Closed', value: stats.by_status?.closed || 0, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', key: 'closed' },
    ];
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="all-task-stats">
        {metrics.map(m => (
          <MetricCard key={m.label} {...m} isActive={allFilters.activeMetric === m.key}
            testId={`all-stat-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => {
              if (m.key === 'overdue') { setAllOverdue(true); setAllFilters(f => ({ ...f, status: '', activeMetric: 'overdue' })); }
              else if (m.key) { setAllOverdue(false); setAllFilters(f => ({ ...f, status: m.key, activeMetric: m.key })); }
              else { setAllOverdue(false); setAllFilters(f => ({ ...f, status: '', activeMetric: '' })); }
            }}
          />
        ))}
      </div>
    );
  };

  const renderSubViewTabs = () => (
    <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
      <TabsTrigger value="list" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
        <LayoutList className="h-4 w-4 mr-2" />List
      </TabsTrigger>
      <TabsTrigger value="kanban" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
        <Kanban className="h-4 w-4 mr-2" />Board
      </TabsTrigger>
      {primaryTab === 'all' && (
        <>
          <TabsTrigger value="milestones" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            <Target className="h-4 w-4 mr-2" />Milestones
          </TabsTrigger>
          {canManageSettings && (
            <TabsTrigger value="labels" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
              <Tag className="h-4 w-4 mr-2" />Labels
            </TabsTrigger>
          )}
        </>
      )}
    </TabsList>
  );

  const renderFilters = () => {
    if (primaryTab === 'my') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 w-56" data-testid="task-search-input" />
          </div>
          <Select value={myFilters.status || "all_status"} onValueChange={v => { setMyFilters(f => ({ ...f, status: v === 'all_status' ? '' : v, activeMetric: '' })); setMyOverdue(false); }}>
            <SelectTrigger className="w-32" data-testid="my-task-status-filter"><Circle className="h-4 w-4 mr-2 text-slate-400" /><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all_status">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="review">In Review</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={myFilters.severity || "all_sev"} onValueChange={v => setMyFilters(f => ({ ...f, severity: v === 'all_sev' ? '' : v, activeMetric: '' }))}>
            <SelectTrigger className="w-32" data-testid="my-task-severity-filter"><Flag className="h-4 w-4 mr-2 text-slate-400" /><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all_sev">All</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          {(myFilters.status || myFilters.severity || myOverdue) && (
            <Button variant="ghost" size="sm" onClick={() => { setMyFilters({ status: '', severity: '', activeMetric: '' }); setMyOverdue(false); }} className="text-red-500 hover:text-red-600 hover:bg-red-50" data-testid="my-task-clear-filters">
              <X className="h-4 w-4 mr-1" />Clear
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 w-56" data-testid="task-search-input" />
        </div>
        <DeptMultiSelect departments={departments} selected={allFilters.department_ids} onChange={ids => setAllFilters(f => ({ ...f, department_ids: ids }))} />
        <Select value={allFilters.status || "all_status"} onValueChange={v => { setAllFilters(f => ({ ...f, status: v === 'all_status' ? '' : v, activeMetric: '' })); setAllOverdue(false); }}>
          <SelectTrigger className="w-32" data-testid="all-task-status-filter"><Circle className="h-4 w-4 mr-2 text-slate-400" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all_status">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="review">In Review</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={allFilters.severity || "all_sev"} onValueChange={v => setAllFilters(f => ({ ...f, severity: v === 'all_sev' ? '' : v, activeMetric: '' }))}>
          <SelectTrigger className="w-32" data-testid="all-task-severity-filter"><Flag className="h-4 w-4 mr-2 text-slate-400" /><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all_sev">All</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {(allFilters.status || allFilters.severity || allOverdue || allFilters.department_ids.length > 0) && (
          <Button variant="ghost" size="sm" onClick={() => { setAllFilters(f => ({ ...f, status: '', severity: '', department_ids: [], activeMetric: '' })); setAllOverdue(false); }} className="text-red-500 hover:text-red-600 hover:bg-red-50" data-testid="all-task-clear-filters">
            <X className="h-4 w-4 mr-1" />Clear
          </Button>
        )}
      </div>
    );
  };

  const renderMilestones = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Milestones</h3>
        {canManageSettings && (
          <Button onClick={() => { setMilestoneForm({ title: '', description: '', due_date: '', department_id: '' }); setEditingMilestone(null); setShowMilestoneDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" />New Milestone
          </Button>
        )}
      </div>
      <div className="grid gap-4">
        {milestones.length === 0 ? (
          <Card className="p-8 text-center text-slate-500">No milestones created yet.</Card>
        ) : milestones.map(milestone => (
          <Card key={milestone.id} className="overflow-hidden border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]" data-testid={`milestone-${milestone.id}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-emerald-600" />
                    <h4 className="font-semibold text-slate-900">{milestone.title}</h4>
                    <Badge variant={milestone.status === 'open' ? 'default' : 'secondary'}>{milestone.status}</Badge>
                  </div>
                  {milestone.description && <p className="text-sm text-slate-500">{milestone.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {milestone.due_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Due: {formatDate(milestone.due_date)}</span>}
                    <span>{milestone.total_tasks || 0} tasks</span>
                    <span className="text-emerald-600">{milestone.closed_tasks || 0} completed</span>
                  </div>
                </div>
                {canManageSettings && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setMilestoneForm({ title: milestone.title, description: milestone.description || '', due_date: milestone.due_date || '', department_id: milestone.department_id || '' }); setEditingMilestone(milestone); setShowMilestoneDialog(true); }}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteMilestone(milestone.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="mt-3"><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${milestone.total_tasks ? (milestone.closed_tasks / milestone.total_tasks) * 100 : 0}%` }} /></div></div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderLabels = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Labels</h3>
        <Button onClick={() => { setLabelForm({ name: '', color: '#6366f1', description: '' }); setEditingLabel(null); setShowLabelDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />New Label
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {labels.length === 0 ? (
          <Card className="col-span-full p-8 text-center text-slate-500">No labels created yet.</Card>
        ) : labels.map(label => (
          <Card key={label.id} className="overflow-hidden border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]" data-testid={`label-${label.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full" style={{ backgroundColor: label.color }} /><span className="font-medium">{label.name}</span></div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setLabelForm({ name: label.name, color: label.color, description: label.description || '' }); setEditingLabel(label); setShowLabelDialog(true); }}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteLabel(label.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {label.description && <p className="text-xs text-slate-500 mt-2">{label.description}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  // ─── MAIN RENDER ──────────────────────────────────────
  return (
    <div className="p-6 space-y-6" data-testid="task-management-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Tasks & Requests</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage tasks, milestones, and track progress across departments</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageSettings && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Settings<ChevronDown className="h-4 w-4 ml-2" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setPrimaryTab('all'); setSubView('labels'); }}><Tag className="h-4 w-4 mr-2" />Manage Labels</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setPrimaryTab('all'); setSubView('milestones'); }}><Target className="h-4 w-4 mr-2" />Manage Milestones</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={() => { resetTaskForm(); setShowTaskDialog(true); }} className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-task-btn">
            <Plus className="h-4 w-4 mr-2" />New Task
          </Button>
        </div>
      </div>

      {/* Primary Tabs: My Tasks | All Tasks */}
      <Tabs value={primaryTab} onValueChange={(v) => { setPrimaryTab(v); setSubView('list'); setSearchQuery(''); }} className="space-y-5">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 h-11">
          <TabsTrigger value="my" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 px-5" data-testid="tab-my-tasks">
            <User className="h-4 w-4 mr-2" />My Tasks
          </TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 px-5" data-testid="tab-all-tasks">
            <Users className="h-4 w-4 mr-2" />All Tasks
          </TabsTrigger>
        </TabsList>

        {/* ─── MY TASKS TAB ─── */}
        <TabsContent value="my" className="space-y-5">
          {renderMyMetrics()}
          <Tabs value={subView} onValueChange={setSubView} className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {renderSubViewTabs()}
              {renderFilters()}
            </div>
            <TabsContent value="list"><TaskTable tasks={filteredTasks} navigate={navigate} openEditTask={openEditTask} handleDeleteTask={handleDeleteTask} /></TabsContent>
            <TabsContent value="kanban"><KanbanBoard tasks={filteredTasks} navigate={navigate} handleStatusChange={handleStatusChange} /></TabsContent>
          </Tabs>
        </TabsContent>

        {/* ─── ALL TASKS TAB ─── */}
        <TabsContent value="all" className="space-y-5">
          {renderAllMetrics()}
          <Tabs value={subView} onValueChange={setSubView} className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {renderSubViewTabs()}
              {renderFilters()}
            </div>
            <TabsContent value="list"><TaskTable tasks={filteredTasks} navigate={navigate} openEditTask={openEditTask} handleDeleteTask={handleDeleteTask} /></TabsContent>
            <TabsContent value="kanban"><KanbanBoard tasks={filteredTasks} navigate={navigate} handleStatusChange={handleStatusChange} /></TabsContent>
            <TabsContent value="milestones">{renderMilestones()}</TabsContent>
            {canManageSettings && <TabsContent value="labels">{renderLabels()}</TabsContent>}
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* ─── TASK DIALOG ─── */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : 'Create New Task'}</DialogTitle>
            <DialogDescription>Fill in the task details below</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the task..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department *</Label>
                <Select value={taskForm.department_id} onValueChange={v => setTaskForm(f => ({ ...f, department_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={taskForm.severity} onValueChange={v => setTaskForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={taskForm.status} onValueChange={v => setTaskForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_CONFIG).map(([key, config]) => <SelectItem key={key} value={key}>{config.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Milestone</Label>
                <Select value={taskForm.milestone_id || "none"} onValueChange={v => setTaskForm(f => ({ ...f, milestone_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select milestone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {milestones.filter(m => m.status === 'open').map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assignees {taskForm.department_id && <span className="text-xs text-slate-400 ml-1">(from {taskForm.department_id})</span>}</Label>
              <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border border-emerald-100 rounded-lg bg-slate-50/50">
                {taskForm.assignees.length === 0 ? <span className="text-sm text-slate-400">No assignees selected</span> :
                  taskForm.assignees.map(aId => {
                    const a = users.find(u => u.id === aId);
                    if (!a) return null;
                    return (
                      <div key={aId} className="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-emerald-100 rounded-full text-sm">
                        <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-medium text-white">{getInitials(a.name)}</div>
                        <span className="text-emerald-800">{a.name}</span>
                        <button type="button" onClick={() => setTaskForm(f => ({ ...f, assignees: f.assignees.filter(id => id !== aId) }))} className="ml-1 text-emerald-600 hover:text-emerald-800"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    );
                  })}
              </div>
              <div className="border border-emerald-100 rounded-lg max-h-48 overflow-y-auto">
                {!taskForm.department_id ? <div className="p-3 text-sm text-slate-400 text-center">Select a department first</div> :
                  users.filter(u => {
                    const uDepts = Array.isArray(u.department) ? u.department : [u.department || ''];
                    return uDepts.some(d => d?.toLowerCase() === taskForm.department_id?.toLowerCase()) || !u.department || (Array.isArray(u.department) && u.department.length === 0);
                  }).map(u => {
                    const isSelected = taskForm.assignees.includes(u.id);
                    return (
                      <div key={u.id} onClick={() => setTaskForm(f => ({ ...f, assignees: isSelected ? f.assignees.filter(id => id !== u.id) : [...f.assignees, u.id] }))} className={`flex items-center gap-3 p-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${isSelected ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{getInitials(u.name)}</div>
                        <div className="flex-1"><p className="text-sm font-medium text-slate-700">{u.name}</p><p className="text-xs text-slate-400">{u.role}</p></div>
                        {isSelected && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                      </div>
                    );
                  })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Labels</Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-lg min-h-[60px]">
                {labels.map(label => (
                  <label key={label.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={taskForm.labels.includes(label.id)} onCheckedChange={checked => setTaskForm(f => ({ ...f, labels: checked ? [...f.labels, label.id] : f.labels.filter(id => id !== label.id) }))} />
                    <span className="text-sm px-2 py-0.5 rounded-full" style={{ backgroundColor: label.color + '20', color: label.color }}>{label.name}</span>
                  </label>
                ))}
                {labels.length === 0 && <span className="text-sm text-slate-400">No labels available</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Reminder Date</Label><Input type="date" value={taskForm.reminder_date} onChange={e => setTaskForm(f => ({ ...f, reminder_date: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveTask} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingTask ? 'Update Task' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Label Dialog */}
      <Dialog open={showLabelDialog} onOpenChange={setShowLabelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingLabel ? 'Edit Label' : 'Create Label'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={labelForm.name} onChange={e => setLabelForm(f => ({ ...f, name: e.target.value }))} placeholder="Label name" /></div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={labelForm.color} onChange={e => setLabelForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded border cursor-pointer" />
                <Input value={labelForm.color} onChange={e => setLabelForm(f => ({ ...f, color: e.target.value }))} placeholder="#6366f1" className="flex-1" />
              </div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Input value={labelForm.description} onChange={e => setLabelForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" /></div>
            <div className="pt-2"><Label>Preview</Label><Badge className="mt-2" style={{ backgroundColor: labelForm.color + '20', color: labelForm.color, borderColor: labelForm.color }}>{labelForm.name || 'Label name'}</Badge></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLabelDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveLabel} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{editingLabel ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Milestone Dialog */}
      <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingMilestone ? 'Edit Milestone' : 'Create Milestone'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Title *</Label><Input value={milestoneForm.title} onChange={e => setMilestoneForm(f => ({ ...f, title: e.target.value }))} placeholder="Milestone title" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={milestoneForm.description} onChange={e => setMilestoneForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe this milestone..." rows={2} /></div>
            <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={milestoneForm.due_date} onChange={e => setMilestoneForm(f => ({ ...f, due_date: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Department (Optional)</Label>
              <Select value={milestoneForm.department_id || "org-wide"} onValueChange={v => setMilestoneForm(f => ({ ...f, department_id: v === 'org-wide' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Organization-wide" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="org-wide">Organization-wide</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMilestoneDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveMilestone} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{editingMilestone ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
