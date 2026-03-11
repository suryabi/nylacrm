import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContextContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '../context/NavigationContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import { Button } from '../components/ui/button';
import { 
  LogOut, Menu, ChevronDown, ChevronRight, 
  LayoutDashboard, Users, Building2, Store,
  Search, Target, CalendarDays, UsersRound,
  Calculator, Truck, Package, Droplets,
  FolderOpen, Building, UserCog, CalendarOff,
  Kanban, Wrench, Box, ShieldCheck, Boxes,
  Factory, ArrowLeftRight, MapPin, Sun, Moon, Home, Settings, Plane, Wallet, Receipt, FileText, Contact
} from 'lucide-react';

const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';

// Dashboard submenu items
const dashboardSubmenu = [
  { name: 'Sales Overview', href: '/dashboard', moduleKey: 'report_sales_overview', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
  { name: 'Revenue Report', href: '/sales-revenue', moduleKey: 'report_revenue', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales'] },
  { name: 'SKU Performance', href: '/sku-performance', moduleKey: 'report_sku_performance', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales'] },
  { name: 'Resource Performance', href: '/resource-performance', moduleKey: 'report_resource_performance', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales'] },
  { name: 'Account Performance', href: '/account-performance', moduleKey: 'report_account_performance', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales'] },
];

// Sales Context Navigation
const salesNavigationGroups = [
  {
    title: 'Core',
    items: [
      { name: 'Home', href: '/home', icon: Home, moduleKey: 'home', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, moduleKey: 'dashboard', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'], hasSubmenu: true },
      { name: 'Leads', href: '/leads', icon: Users, moduleKey: 'leads', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
      { name: 'Pipeline', href: '/leads/kanban', icon: Kanban, moduleKey: 'pipeline', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
      { name: 'Accounts', href: '/accounts', icon: Building2, moduleKey: 'accounts', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
      { name: 'Sales Portal', href: '/sales-portal', icon: Store, moduleKey: 'sales_portal', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
    ]
  },
  {
    title: 'Lead & Sales Operations',
    items: [
      { name: 'Lead Discovery', href: '/lead-discovery', icon: Search, moduleKey: 'lead_discovery', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
      { name: 'Target Planning', href: '/target-planning', icon: Target, moduleKey: 'target_planning', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales'] },
      { name: 'Daily Status', href: '/daily-status', icon: CalendarDays, moduleKey: 'daily_status', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
      { name: 'Status Summary', href: '/status-summary', icon: UsersRound, moduleKey: 'status_summary', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales'] },
    ]
  },
  {
    title: 'Pricing & Logistics',
    items: [
      { name: 'COGS Calculator', href: '/cogs-calculator', icon: Calculator, moduleKey: 'cogs_calculator' },
      { name: 'Transport Calculator', href: '/transportation-calculator', icon: Truck, moduleKey: 'transport_calculator', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
    ]
  },
  {
    title: 'Product & SKU',
    items: [
      { name: 'SKU Management', href: '/sku-management', icon: Package, moduleKey: 'sku_management', roles: ['CEO', 'Director', 'National Sales Head'] },
      { name: 'Bottle Preview', href: '/bottle-preview', icon: Droplets, moduleKey: 'bottle_preview', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
    ]
  },
  {
    title: 'Documents',
    items: [
      { name: 'Company Documents', href: '/company-documents', icon: FileText, moduleKey: 'company_documents', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Business Development Executive', 'Sales Representative', 'System Admin'] },
      { name: 'Files & Documents', href: '/files-documents', icon: FolderOpen, moduleKey: 'files_documents', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'admin', 'Admin'] },
    ]
  },
  {
    title: 'Requests',
    items: [
      { name: 'Leaves', href: '/leaves', icon: CalendarOff, moduleKey: 'leaves', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
      { name: 'Travel Request', href: '/travel-requests', icon: Plane, moduleKey: 'travel_requests', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
      { name: 'Budget Request', href: '/budget-requests', icon: Wallet, moduleKey: 'budget_requests', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
    ]
  },
  {
    title: 'Organization',
    items: [
      { name: 'Company Profile', href: '/company-profile', icon: Building, moduleKey: 'company_profile', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales'] },
      { name: 'Team', href: '/team', icon: UserCog, moduleKey: 'team', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales'] },
      { name: 'Contacts', href: '/contacts', icon: Contact, moduleKey: 'contacts', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Business Development Executive', 'Sales Representative'] },
      { name: 'Master Locations', href: '/master-locations', icon: MapPin, moduleKey: 'master_locations', roles: ['CEO', 'Director', 'System Admin'] },
      { name: 'Lead Statuses', href: '/master-lead-status', icon: Settings, moduleKey: 'lead_statuses', roles: ['CEO', 'Director', 'System Admin'] },
      { name: 'Business Categories', href: '/master-business-categories', icon: Building, moduleKey: 'business_categories', roles: ['CEO', 'Director', 'System Admin'] },
      { name: 'Contact Categories', href: '/master-contact-categories', icon: Users, moduleKey: 'contact_categories', roles: ['CEO', 'Director', 'System Admin'] },
      { name: 'Expense Categories', href: '/expense-category-master', icon: Receipt, moduleKey: 'expense_categories', roles: ['CEO', 'Director', 'System Admin'] },
    ]
  },
  {
    title: 'Admin',
    items: [
      { name: 'Tenant Settings', href: '/tenant-settings', icon: Settings, roles: ['CEO', 'Director', 'System Admin'] },
    ]
  },
];

// Production Context Navigation
const productionNavigationGroups = [
  {
    title: 'Production',
    items: [
      { name: 'Maintenance', href: '/maintenance', icon: Wrench, moduleKey: 'maintenance', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff'] },
      { name: 'Inventory', href: '/inventory', icon: Boxes, moduleKey: 'inventory', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff'] },
      { name: 'Quality Control', href: '/quality-control', icon: ShieldCheck, moduleKey: 'quality_control', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff'] },
    ]
  },
  {
    title: 'Assets & Vendors',
    items: [
      { name: 'Assets', href: '/assets', icon: Box, moduleKey: 'assets', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor'] },
      { name: 'Vendors', href: '/vendors', icon: Truck, moduleKey: 'vendors', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor'] },
    ]
  },
  {
    title: 'Product & SKU',
    items: [
      { name: 'SKU Management', href: '/sku-management', icon: Package, moduleKey: 'sku_management', roles: ['CEO', 'Director', 'Vice President', 'Production Manager'] },
    ]
  },
  {
    title: 'Documents',
    items: [
      { name: 'Files & Documents', href: '/files-documents', icon: FolderOpen, moduleKey: 'files_documents', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff'] },
    ]
  },
  {
    title: 'Organization',
    items: [
      { name: 'Company Profile', href: '/company-profile', icon: Building, moduleKey: 'company_profile', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor'] },
      { name: 'Team', href: '/team', icon: UserCog, moduleKey: 'team', roles: ['CEO', 'Director', 'Vice President', 'Production Manager'] },
    ]
  },
];

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const { currentContext, switchContext, canAccessBothContexts } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const { navigateTo } = useNavigation();
  const { isModuleEnabled } = useTenantConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(
    location.pathname === '/dashboard' || location.pathname === '/sales-revenue' || 
    location.pathname === '/target-sku' || location.pathname === '/target-resource' ||
    location.pathname === '/sku-performance' || location.pathname === '/resource-performance' ||
    location.pathname === '/account-performance'
  );
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleGroup = (title) => {
    setCollapsedGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  // Handle sidebar navigation - resets the breadcrumb trail
  const handleSidebarNav = (href) => {
    setSidebarOpen(false);
    navigateTo(href, { fromSidebar: true });
  };

  const handleContextSwitch = (newContext) => {
    switchContext(newContext);
    // Navigate to appropriate default page
    if (newContext === 'production') {
      navigateTo('/maintenance', { fromSidebar: true });
    } else {
      navigateTo('/home', { fromSidebar: true });
    }
  };

  // Select navigation groups based on current context
  const navigationGroups = currentContext === 'production' ? productionNavigationGroups : salesNavigationGroups;

  // Filter dashboard submenu based on role AND module configuration
  const filteredDashboardSubmenu = dashboardSubmenu.filter(item => {
    const roleAllowed = !item.roles || item.roles.includes(user?.role);
    const moduleEnabled = !item.moduleKey || isModuleEnabled(item.moduleKey);
    return roleAllowed && moduleEnabled;
  });
  
  const isDashboardActive = location.pathname === '/dashboard' || location.pathname === '/sales-revenue' || 
    location.pathname === '/target-sku' || location.pathname === '/target-resource' ||
    location.pathname === '/sku-performance' || location.pathname === '/resource-performance' ||
    location.pathname === '/account-performance';

  // Filter navigation groups based on user role AND module configuration
  // If item has no roles array, it's available to all users
  // If item has no moduleKey, it's always available
  const filteredGroups = navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      const roleAllowed = !item.roles || item.roles.includes(user?.role);
      const moduleEnabled = !item.moduleKey || isModuleEnabled(item.moduleKey);
      return roleAllowed && moduleEnabled;
    })
  })).filter(group => group.items.length > 0);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[hsl(200,35%,12%)] dark:bg-[hsl(200,40%,8%)] transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <img src={NYLA_LOGO} alt="Nyla Air Water" className="h-10 w-10 rounded-lg object-cover" />
              <div>
                <h1 className="text-white font-bold text-lg tracking-tight">Nyla Air Water</h1>
                <p className="text-white/60 text-xs">{currentContext === 'production' ? 'Production' : 'Sales CRM'}</p>
              </div>
            </div>
          </div>
          
          {/* Context Switcher */}
          {canAccessBothContexts && (
            <div className="px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2 bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => handleContextSwitch('sales')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all ${
                    currentContext === 'sales'
                      ? 'bg-primary text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                  data-testid="context-switch-sales"
                >
                  <Store className="w-3.5 h-3.5" />
                  Sales
                </button>
                <button
                  onClick={() => handleContextSwitch('production')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all ${
                    currentContext === 'production'
                      ? 'bg-primary text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                  data-testid="context-switch-production"
                >
                  <Factory className="w-3.5 h-3.5" />
                  Production
                </button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 py-4 overflow-y-auto scrollbar-thin">
            {filteredGroups.map((group, groupIndex) => (
              <div key={group.title} className={groupIndex > 0 ? 'mt-2' : ''}>
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center justify-between px-5 py-2 text-xs font-semibold text-white/50 uppercase tracking-wider hover:text-white/70 transition-colors"
                >
                  <span>{group.title}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${collapsedGroups[group.title] ? '-rotate-90' : ''}`} />
                </button>

                {/* Group Items */}
                {!collapsedGroups[group.title] && (
                  <div className="mt-1 space-y-0.5 px-3">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      
                      // Handle Dashboard with submenu
                      if (item.hasSubmenu && item.name === 'Dashboard') {
                        return (
                          <div key={item.name}>
                            <button
                              onClick={() => setDashboardOpen(!dashboardOpen)}
                              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                isDashboardActive
                                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                                  : 'text-white/80 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <span className="flex items-center gap-3">
                                <Icon className="h-4 w-4" />
                                {item.name}
                              </span>
                              {dashboardOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            {dashboardOpen && (
                              <div className="mt-1 ml-7 space-y-0.5 border-l border-white/20 pl-3">
                                {filteredDashboardSubmenu.map((subItem) => {
                                  const isSubActive = location.pathname === subItem.href;
                                  return (
                                    <button
                                      key={subItem.name}
                                      onClick={() => handleSidebarNav(subItem.href)}
                                      className={`block w-full text-left px-3 py-2 rounded-md text-sm transition-all ${
                                        isSubActive
                                          ? 'bg-primary/20 text-primary font-medium'
                                          : 'text-white/60 hover:bg-white/10 hover:text-white/90'
                                      }`}
                                    >
                                      {subItem.name}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }
                      
                      const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                      return (
                        <button
                          key={item.name}
                          onClick={() => handleSidebarNav(item.href)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                              : 'text-white/80 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-white/60 truncate capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
            
            {/* Theme Toggle */}
            <Button
              onClick={toggleTheme}
              variant="ghost"
              data-testid="theme-toggle-btn"
              className="w-full justify-start text-white/60 hover:text-white hover:bg-white/10 rounded-lg mb-1"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-4 w-4 mr-2" />
                  Light Mode
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 mr-2" />
                  Dark Mode
                </>
              )}
            </Button>
            
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="w-full justify-start text-white/60 hover:text-white hover:bg-white/10 rounded-lg"
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
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Top Bar (Mobile) */}
        <header className="bg-card border-b border-border px-4 py-3 lg:hidden sticky top-0 z-30 shadow-sm">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg hover:bg-secondary"
            >
              <Menu className="h-5 w-5 text-foreground" />
            </Button>
            <div className="flex items-center gap-2">
              <img src={NYLA_LOGO} alt="Nyla Air Water" className="h-8 w-8 rounded-lg" />
              <span className="font-bold text-foreground">Nyla Air Water</span>
            </div>
            <div className="w-10" />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto bg-background">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
