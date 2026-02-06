import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { LogOut, Menu, X } from 'lucide-react';

const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Leads', href: '/leads', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Targets', href: '/targets', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager'] },
  { name: 'Reports', href: '/reports-new', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager'] },
  { name: 'Sales Portal', href: '/sales-portal', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Daily Status', href: '/daily-status', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Team Status', href: '/team-status', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager'] },
  { name: 'Bottle Preview', href: '/bottle-preview', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Leaves', href: '/leaves', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Team', href: '/team', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager'] },
];

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredNav = navigation.filter(item => item.roles.includes(user?.role));

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border">
            <img src={NYLA_LOGO} alt="Nyla" className="h-12 mx-auto rounded-full" />
            <p className="text-center text-sm text-muted-foreground mt-2">Sales CRM</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {filteredNav.map((item) => {
              const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-foreground-muted hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full justify-start rounded-xl"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Top Bar (Mobile) */}
        <header className="bg-card border-b border-border px-6 py-4 lg:hidden sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="rounded-full"
            >
              <Menu className="h-6 w-6" />
            </Button>
            <img src={NYLA_LOGO} alt="Nyla" className="h-8 rounded-full" />
            <div className="w-10" />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
