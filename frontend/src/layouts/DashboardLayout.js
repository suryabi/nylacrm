import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Bell, Settings, LogOut, Menu, X } from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Leads', href: '/leads', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Daily Status', href: '/daily-status', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Team Status', href: '/team-status', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager'] },
  { name: 'Bottle Preview', href: '/bottle-preview', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Follow-ups', href: '/follow-ups', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'] },
  { name: 'Reports', href: '/reports', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager'] },
  { name: 'Locations', href: '/locations', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager'] },
  { name: 'Team', href: '/team', roles: ['ceo', 'director', 'vp', 'admin', 'sales_manager'] },
];

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredNav = navigation.filter(item => item.roles.includes(user?.role));

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation - Horizontal */}
      <nav className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-foreground">Nyla CRM</h1>
              
              {/* Desktop Navigation */}
              <div className="hidden lg:flex items-center gap-2">
                {filteredNav.map((item) => {
                  const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground-muted hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="rounded-full hidden md:flex">
                <Bell className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full hidden md:flex">
                <Settings className="h-5 w-5" />
              </Button>
              
              {/* User Menu */}
              <div className="hidden md:flex items-center gap-3 pl-3 border-l border-border">
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{user?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              </div>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden rounded-full" 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden mt-4 pb-4 border-t border-border pt-4 space-y-2">
              {filteredNav.map((item) => {
                const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground-muted hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full justify-start rounded-xl mt-4"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
