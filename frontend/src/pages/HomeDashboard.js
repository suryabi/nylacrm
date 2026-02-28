import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Loader2, Sparkles } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

// Import all widgets
import {
  WeatherTimeWidget,
  TodaySummaryWidget,
  ActionItemsWidget,
  UpcomingFollowupsWidget,
  UpcomingMeetingsWidget,
  MonthlyPerformanceWidget,
  PipelineSummaryWidget,
  RecentActivityWidget,
  NewTaskDialog,
  NewMeetingDialog,
  MeetingDetailDialog
} from '../components/widgets';
import WaterQuoteWidget from '../components/widgets/WaterQuoteWidget';
import SalesQuoteWidget from '../components/widgets/SalesQuoteWidget';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const getDefaultMeetingState = () => ({
  title: '',
  description: '',
  meeting_type: 'client',
  meeting_date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '10:00',
  duration_minutes: 30,
  location: '',
  internal_attendees: [],
  external_attendees: [],
  create_zoom_meeting: true
});

export default function HomeDashboard() {
  const { user, activeTime } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [showNewMeetingDialog, setShowNewMeetingDialog] = useState(false);
  const [showMeetingDetailDialog, setShowMeetingDetailDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [users, setUsers] = useState([]);
  const [taskFilter, setTaskFilter] = useState('assigned');
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [editMode, setEditMode] = useState(false);
  
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
  const [newMeeting, setNewMeeting] = useState(getDefaultMeetingState());
  
  // Weather and time state
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [locationName, setLocationName] = useState('');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/dashboard`, { withCredentials: true });
      setDashboardData(response.data);
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

  const fetchDefaultWeather = async () => {
    try {
      const weatherRes = await fetch(
        `${API_URL}/weather?latitude=17.385&longitude=78.4867`
      );
      const weatherData = await weatherRes.json();
      setWeather(weatherData.current);
      setLocationName('Hyderabad');
    } catch {
      setWeather(null);
    }
    setWeatherLoading(false);
  };

  const fetchWeather = async () => {
    setWeatherLoading(true);
    try {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const weatherRes = await fetch(
              `${API_URL}/weather?latitude=${latitude}&longitude=${longitude}`
            );
            const weatherData = await weatherRes.json();
            setWeather(weatherData.current);
            
            try {
              const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
              );
              const geoData = await geoRes.json();
              const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.county || '';
              setLocationName(city);
            } catch {
              setLocationName('Your Location');
            }
            setWeatherLoading(false);
          },
          () => fetchDefaultWeather(),
          { timeout: 10000 }
        );
      } else {
        fetchDefaultWeather();
      }
    } catch {
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchUsers();
    fetchWeather();
    
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timeInterval);
  }, []);

  // Auto-select the appropriate tab
  useEffect(() => {
    if (!dashboardData || !user?.id) return;
    
    const tasks = dashboardData?.action_items?.tasks || [];
    const assignedToMe = tasks.filter(t => t.assigned_to === user.id);
    const createdByMe = tasks.filter(t => t.assigned_by === user.id || t.created_by === user.id);
    
    if (assignedToMe.length === 0 && createdByMe.length > 0) {
      setTaskFilter('created');
    }
  }, [dashboardData, user?.id]);

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

  const handleCreateOrUpdateMeeting = async () => {
    if (!newMeeting.title.trim()) {
      toast.error('Please enter a meeting title');
      return;
    }
    
    setSavingMeeting(true);
    try {
      const internalEmails = newMeeting.internal_attendees.map(id => {
        const u = users.find(user => user.id === id);
        return u?.email || '';
      }).filter(e => e);
      const internalNames = newMeeting.internal_attendees.map(id => {
        const u = users.find(user => user.id === id);
        return u?.name || '';
      }).filter(n => n);
      
      const meetingData = {
        title: newMeeting.title,
        description: newMeeting.description,
        meeting_type: newMeeting.meeting_type,
        meeting_date: newMeeting.meeting_date,
        start_time: newMeeting.start_time,
        duration_minutes: newMeeting.duration_minutes,
        location: newMeeting.location,
        attendees: [...internalEmails, ...newMeeting.external_attendees],
        attendee_names: [...internalNames, ...newMeeting.external_attendees.map(e => e.split('@')[0])],
        create_zoom_meeting: newMeeting.create_zoom_meeting && !editMode
      };
      
      let response;
      if (editMode && selectedMeeting?.id) {
        response = await axios.put(`${API_URL}/meetings/${selectedMeeting.id}`, meetingData, { withCredentials: true });
        toast.success('Meeting rescheduled successfully');
      } else {
        response = await axios.post(`${API_URL}/meetings`, meetingData, { withCredentials: true });
        if (newMeeting.create_zoom_meeting && response.data.meeting_link) {
          toast.success('Meeting scheduled with Zoom link!');
        } else {
          toast.success('Meeting scheduled successfully');
        }
      }
      
      setShowNewMeetingDialog(false);
      setNewMeeting(getDefaultMeetingState());
      setEditMode(false);
      setSelectedMeeting(null);
      fetchDashboardData();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to schedule meeting';
      toast.error(errorMsg);
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleViewMeeting = (meeting) => {
    setSelectedMeeting(meeting);
    setShowMeetingDetailDialog(true);
  };

  const handleEditMeeting = (meeting) => {
    const internalIds = [];
    const externalEmails = [];
    
    meeting.attendees?.forEach((email, idx) => {
      const user = users.find(u => u.email === email);
      if (user) {
        internalIds.push(user.id);
      } else {
        externalEmails.push(email);
      }
    });
    
    setNewMeeting({
      title: meeting.title,
      description: meeting.description || '',
      meeting_type: meeting.meeting_type,
      meeting_date: meeting.meeting_date,
      start_time: meeting.start_time,
      duration_minutes: meeting.duration_minutes,
      location: meeting.location || '',
      internal_attendees: internalIds,
      external_attendees: externalEmails,
      create_zoom_meeting: !!meeting.meeting_link
    });
    setSelectedMeeting(meeting);
    setEditMode(true);
    setShowMeetingDetailDialog(false);
    setShowNewMeetingDialog(true);
  };

  const handleCancelMeeting = (meeting) => {
    setSelectedMeeting(meeting);
    setShowCancelDialog(true);
  };

  const confirmCancelMeeting = async () => {
    if (!selectedMeeting) return;
    
    try {
      await axios.put(`${API_URL}/meetings/${selectedMeeting.id}`, 
        { status: 'cancelled' }, 
        { withCredentials: true }
      );
      toast.success('Meeting cancelled');
      setShowCancelDialog(false);
      setShowMeetingDetailDialog(false);
      setSelectedMeeting(null);
      fetchDashboardData();
    } catch (error) {
      toast.error('Failed to cancel meeting');
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

  const handleUpdateTask = async (taskId, updates) => {
    try {
      await axios.put(`${API_URL}/tasks/${taskId}`, updates, { withCredentials: true });
      toast.success(updates.assigned_to ? 'Task reassigned' : 'Comment added');
      fetchDashboardData();
    } catch (error) {
      toast.error('Failed to update task');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
          </div>
          <p className="text-muted-foreground text-sm animate-pulse">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const { action_items, upcoming_leads, upcoming_meetings, today_summary, pipeline, monthly_performance, recent_activities } = dashboardData || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="home-dashboard">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header Section */}
        <header className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Welcome Section */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-3xl lg:text-4xl font-bold tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white bg-clip-text text-transparent">
                  Good {getGreeting()}, {user?.name?.split(' ')[0]}
                </h1>
                <Sparkles className="h-6 w-6 text-amber-500 animate-pulse" />
              </div>
              <p className="text-muted-foreground text-lg">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
            
            {/* Weather & Time Widget */}
            <WeatherTimeWidget
              weather={weather}
              weatherLoading={weatherLoading}
              locationName={locationName}
              currentTime={currentTime}
              activeTime={activeTime}
            />
          </div>
        </header>

        {/* Quote Widgets - Visible Above the Fold */}
        <section className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <WaterQuoteWidget />
          <SalesQuoteWidget />
        </section>

        {/* Stats Summary - Bento Grid Row 1 */}
        <section className="mb-8">
          <TodaySummaryWidget todaySummary={today_summary} />
        </section>

        {/* Main Content - Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Primary Content (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Action Items - Large Card */}
            <ActionItemsWidget
              actionItems={action_items}
              user={user}
              users={users}
              taskFilter={taskFilter}
              setTaskFilter={setTaskFilter}
              onCompleteTask={handleCompleteTask}
              onUpdateTask={handleUpdateTask}
              onNewTask={() => {
                setNewTask(prev => ({ ...prev, assigned_to: user?.id || '' }));
                setShowNewTaskDialog(true);
              }}
            />
            
            {/* Bottom Row - Two cards side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <UpcomingFollowupsWidget upcomingLeads={upcoming_leads} />
              <RecentActivityWidget recentActivities={recent_activities} />
            </div>
          </div>

          {/* Right Column - Secondary Content (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Meetings - Featured Card */}
            <UpcomingMeetingsWidget
              upcomingMeetings={upcoming_meetings}
              onNewMeeting={() => {
                setNewMeeting(getDefaultMeetingState());
                setEditMode(false);
                setShowNewMeetingDialog(true);
              }}
              onViewMeeting={handleViewMeeting}
              onEditMeeting={handleEditMeeting}
              onCancelMeeting={handleCancelMeeting}
            />
            
            {/* Performance - Compact Card */}
            <MonthlyPerformanceWidget monthlyPerformance={monthly_performance} />
            
            {/* Pipeline - Compact Card */}
            <PipelineSummaryWidget pipeline={pipeline} />
          </div>
        </div>

      </div>

      {/* Dialogs */}
      <NewTaskDialog
        open={showNewTaskDialog}
        onOpenChange={setShowNewTaskDialog}
        newTask={newTask}
        setNewTask={setNewTask}
        users={users}
        user={user}
        onSave={handleCreateTask}
        saving={savingTask}
      />

      <NewMeetingDialog
        open={showNewMeetingDialog}
        onOpenChange={(open) => {
          setShowNewMeetingDialog(open);
          if (!open) {
            setEditMode(false);
            setNewMeeting(getDefaultMeetingState());
          }
        }}
        newMeeting={newMeeting}
        setNewMeeting={setNewMeeting}
        onSave={handleCreateOrUpdateMeeting}
        saving={savingMeeting}
        users={users}
        editMode={editMode}
      />

      <MeetingDetailDialog
        open={showMeetingDetailDialog}
        onOpenChange={setShowMeetingDetailDialog}
        meeting={selectedMeeting}
        onEdit={handleEditMeeting}
        onCancel={handleCancelMeeting}
      />

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel "{selectedMeeting?.title}"? 
              {selectedMeeting?.attendees?.length > 0 && (
                <span className="block mt-2">
                  All attendees will be notified via email.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Meeting</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelMeeting} className="bg-red-600 hover:bg-red-700">
              Cancel Meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Helper function for greeting
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
