import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LayoutDashboard, Loader2, Plus, Calendar } from 'lucide-react';

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
  NewMeetingDialog
} from '../components/widgets';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function HomeDashboard() {
  const { user, activeTime } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [showNewMeetingDialog, setShowNewMeetingDialog] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [users, setUsers] = useState([]);
  const [taskFilter, setTaskFilter] = useState('assigned');
  
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
        `https://api.open-meteo.com/v1/forecast?latitude=17.385&longitude=78.4867&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
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
              `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { action_items, upcoming_leads, upcoming_meetings, today_summary, pipeline, monthly_performance, recent_activities } = dashboardData || {};

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="home-dashboard">
      {/* Header with Weather and Time */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            Welcome back, {user?.name?.split(' ')[0]}!
          </h1>
          <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        
        <WeatherTimeWidget
          weather={weather}
          weatherLoading={weatherLoading}
          locationName={locationName}
          currentTime={currentTime}
          activeTime={activeTime}
        />
        
        {/* Action Buttons */}
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
      <TodaySummaryWidget todaySummary={today_summary} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <ActionItemsWidget
            actionItems={action_items}
            user={user}
            users={users}
            taskFilter={taskFilter}
            setTaskFilter={setTaskFilter}
            onCompleteTask={handleCompleteTask}
            onUpdateTask={handleUpdateTask}
          />
          
          <UpcomingFollowupsWidget upcomingLeads={upcoming_leads} />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <UpcomingMeetingsWidget
            upcomingMeetings={upcoming_meetings}
            onNewMeeting={() => setShowNewMeetingDialog(true)}
          />
          <MonthlyPerformanceWidget monthlyPerformance={monthly_performance} />
          <PipelineSummaryWidget pipeline={pipeline} />
          <RecentActivityWidget recentActivities={recent_activities} />
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
        onOpenChange={setShowNewMeetingDialog}
        newMeeting={newMeeting}
        setNewMeeting={setNewMeeting}
        onSave={handleCreateMeeting}
        saving={savingMeeting}
      />
    </div>
  );
}
