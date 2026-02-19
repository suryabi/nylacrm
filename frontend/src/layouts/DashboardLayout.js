import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { LogOut, Menu, ChevronDown, ChevronRight } from 'lucide-react';

const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';

// Dashboard submenu items
const dashboardSubmenu = [
  { name: 'Sales Overview', href: '/dashboard', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business'] },
  { name: 'Revenue Report', href: '/sales-revenue', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager'] },
  { name: 'SKU Performance', href: '/sku-performance', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager'] },
  { name: 'Resource Performance', href: '/resource-performance', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager'] },
  { name: 'Target x SKU', href: '/target-sku', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager'] },
  { name: 'Target x Resource', href: '/target-resource', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager'] },
];

const navigation = [
  { name: 'Dashboard', href: '/dashboard', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business'], hasSubmenu: true },
  { name: 'Leads', href: '/leads', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business'] },
  { name: 'Lead Discovery', href: '/lead-discovery', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business'] },
  { name: 'COGS Calculator', href: '/cogs-calculator', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head'] },
  { name: 'Proposals', href: '/proposals', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business'] },
  { name: 'Targets', href: '/targets', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager'] },
  { name: 'Sales Portal', href: '/sales-portal', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business'] },
  { name: 'Daily Status', href: '/daily-status', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business'] },
  { name: 'Team Status', href: '/team-status', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager'] },
  { name: 'Bottle Preview', href: '/bottle-preview', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business'] },
  { name: 'Leaves', href: '/leaves', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business'] },
  { name: 'Team', href: '/team', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager'] },
];

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(
    location.pathname === '/dashboard' || location.pathname === '/sales-revenue' || 
    location.pathname === '/target-sku' || location.pathname === '/target-resource' ||
    location.pathname === '/sku-performance' || location.pathname === '/resource-performance'
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredNav = navigation.filter(item => item.roles.includes(user?.role));
  const filteredDashboardSubmenu = dashboardSubmenu.filter(item => item.roles.includes(user?.role));
  const isDashboardActive = location.pathname === '/dashboard' || location.pathname === '/sales-revenue' || 
    location.pathname === '/target-sku' || location.pathname === '/target-resource' ||
    location.pathname === '/sku-performance' || location.pathname === '/resource-performance';

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
              // Handle Dashboard with submenu
              if (item.hasSubmenu && item.name === 'Dashboard') {
                return (
                  <div key={item.name}>
                    <button
                      onClick={() => setDashboardOpen(!dashboardOpen)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                        isDashboardActive
                          ? 'bg-primary text-white'
                          : 'text-foreground-muted hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      <span>{item.name}</span>
                      {dashboardOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    {dashboardOpen && (
                      <div className="mt-1 ml-4 space-y-1">
                        {filteredDashboardSubmenu.map((subItem) => {
                          const isSubActive = location.pathname === subItem.href;
                          return (
                            <Link
                              key={subItem.name}
                              to={subItem.href}
                              onClick={() => setSidebarOpen(false)}
                              className={`block px-4 py-2 rounded-lg text-sm transition-colors ${
                                isSubActive
                                  ? 'bg-primary/20 text-primary font-medium'
                                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                              }`}
                            >
                              {subItem.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              
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
