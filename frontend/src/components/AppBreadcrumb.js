import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb';

/**
 * Route configuration for breadcrumb generation
 * Maps paths to their display names and parent routes
 */
const ROUTE_CONFIG = {
  '/home': { label: 'Home', icon: Home },
  '/dashboard': { label: 'Sales Overview', parent: '/home' },
  '/leads': { label: 'Leads', parent: '/home' },
  '/leads/new': { label: 'New Lead', parent: '/leads' },
  '/leads/kanban': { label: 'Kanban View', parent: '/leads' },
  '/accounts': { label: 'Accounts', parent: '/home' },
  '/pipeline': { label: 'Pipeline', parent: '/home' },
  '/follow-ups': { label: 'Follow-ups', parent: '/home' },
  '/daily-status': { label: 'Daily Status', parent: '/home' },
  '/status-summary': { label: 'Status Summary', parent: '/daily-status' },
  '/team': { label: 'Team Management', parent: '/home' },
  '/leaves': { label: 'Leave Management', parent: '/home' },
  '/travel-requests': { label: 'Travel Requests', parent: '/home' },
  '/budget-requests': { label: 'Budget Requests', parent: '/home' },
  '/target-planning': { label: 'Target Planning', parent: '/home' },
  '/sales-portal': { label: 'Sales Portal', parent: '/home' },
  '/lead-discovery': { label: 'Lead Discovery', parent: '/home' },
  '/cogs-calculator': { label: 'COGS Calculator', parent: '/home' },
  '/sales-revenue': { label: 'Revenue Report', parent: '/dashboard' },
  '/sku-performance': { label: 'SKU Performance', parent: '/dashboard' },
  '/resource-performance': { label: 'Resource Performance', parent: '/dashboard' },
  '/account-performance': { label: 'Account Performance', parent: '/dashboard' },
  '/transportation-calculator': { label: 'Transportation Calculator', parent: '/home' },
  '/sku-management': { label: 'SKU Management', parent: '/home' },
  '/company-profile': { label: 'Company Profile', parent: '/home' },
  '/files-documents': { label: 'Files & Documents', parent: '/home' },
  '/master-locations': { label: 'Master Locations', parent: '/home' },
  '/master-lead-status': { label: 'Lead Statuses', parent: '/home' },
  '/master-business-categories': { label: 'Business Categories', parent: '/home' },
  '/locations': { label: 'Location Analytics', parent: '/dashboard' },
  '/reports': { label: 'Reports', parent: '/home' },
  '/reports-new': { label: 'Reports', parent: '/home' },
  // Production context
  '/maintenance': { label: 'Maintenance', parent: '/home' },
  '/inventory': { label: 'Inventory', parent: '/home' },
  '/quality-control': { label: 'Quality Control', parent: '/home' },
  '/assets': { label: 'Assets', parent: '/home' },
  '/vendors': { label: 'Vendors', parent: '/home' },
};

/**
 * Dynamic route patterns that need special handling
 */
const DYNAMIC_ROUTES = [
  { pattern: /^\/leads\/([^/]+)\/edit$/, parent: '/leads', labelFn: () => 'Edit Lead' },
  { pattern: /^\/leads\/([^/]+)$/, parent: '/leads', labelFn: (params, context) => context?.leadName || 'Lead Details' },
  { pattern: /^\/accounts\/([^/]+)$/, parent: '/accounts', labelFn: (params, context) => context?.accountName || 'Account Details' },
  { pattern: /^\/target-planning\/([^/]+)$/, parent: '/target-planning', labelFn: (params, context) => context?.planName || 'Plan Dashboard' },
];

/**
 * AppBreadcrumb Component
 * Automatically generates breadcrumb navigation based on current route
 * 
 * @param {Object} props
 * @param {Object} props.context - Optional context data (e.g., lead name, account name)
 * @param {Array} props.customItems - Custom breadcrumb items to override auto-generation
 */
const AppBreadcrumb = ({ context = {}, customItems = null }) => {
  const location = useLocation();
  const params = useParams();
  const currentPath = location.pathname;

  // Don't show breadcrumbs on home, login, or splash pages
  if (['/', '/login', '/home', '/auth/callback'].includes(currentPath)) {
    return null;
  }

  // Use custom items if provided
  if (customItems && customItems.length > 0) {
    return (
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/home" className="flex items-center gap-1 hover:text-primary">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {customItems.map((item, index) => (
            <React.Fragment key={index}>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                {index === customItems.length - 1 ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.path} className="hover:text-primary">
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  // Build breadcrumb trail
  const buildBreadcrumbTrail = () => {
    const trail = [];
    let path = currentPath;
    let label = '';
    let isDynamic = false;

    // Check for dynamic routes first
    for (const route of DYNAMIC_ROUTES) {
      const match = path.match(route.pattern);
      if (match) {
        isDynamic = true;
        label = route.labelFn(params, context);
        trail.unshift({ path, label, isCurrent: true });
        path = route.parent;
        break;
      }
    }

    // If not a dynamic route, check static routes
    if (!isDynamic) {
      const config = ROUTE_CONFIG[path];
      if (config) {
        trail.unshift({ path, label: config.label, isCurrent: true });
        path = config.parent;
      }
    }

    // Walk up the parent chain
    while (path) {
      const config = ROUTE_CONFIG[path];
      if (config) {
        trail.unshift({ path, label: config.label, isCurrent: false });
        path = config.parent;
      } else {
        break;
      }
    }

    return trail;
  };

  const trail = buildBreadcrumbTrail();

  if (trail.length === 0) {
    return null;
  }

  return (
    <Breadcrumb className="mb-4" data-testid="app-breadcrumb">
      <BreadcrumbList>
        {/* Home is always first */}
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/home" className="flex items-center gap-1 hover:text-primary transition-colors">
              <Home className="h-4 w-4" />
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {trail.map((item, index) => {
          // Skip home if it's in the trail (we already show it)
          if (item.path === '/home') return null;
          
          return (
            <React.Fragment key={item.path}>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                {item.isCurrent ? (
                  <BreadcrumbPage className="font-medium">{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.path} className="hover:text-primary transition-colors">
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default AppBreadcrumb;
