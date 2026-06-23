import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContextContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '../context/NavigationContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import { Button } from '../components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import AskNyla from '../components/widgets/AskNyla';
import DistributorChatButton from '../components/DistributorChatButton';
import NotificationBell from '../components/NotificationBell';
import FacilitySwitcher from '../components/distributor/FacilitySwitcher';
import { 
  LogOut, Menu, ChevronDown, ChevronRight, 
  LayoutDashboard, Users, Building2, Store,
  Search, Target, CalendarDays, UsersRound,
  Calculator, Truck, Package, Droplets,
  FolderOpen, Building, UserCog, CalendarOff,
  Kanban, Wrench, Box, ShieldCheck, Boxes,
  Factory, ArrowLeftRight, ArrowRight, MapPin, Sun, Moon, Home, Settings, Bell, Plane, Wallet, Receipt, FileText, Contact, Crown, Gauge, ClipboardList, BarChart3, LineChart, Megaphone, CalendarRange, Layers, NotebookPen, AlertTriangle, DollarSign, Tag, KeyRound, IndianRupee, Sparkles, BookOpen, PackageOpen, Cable, PackagePlus, PanelLeftClose, PanelLeftOpen, Printer, Mail, Share2, MessageSquareWarning, RotateCcw
} from 'lucide-react';

// Platform Admin emails
const PLATFORM_ADMIN_EMAILS = ['surya.yadavalli@gmail.com', 'surya.yadavalli@nylaairwater.earth'];

const NYLA_LOGO = null;

// Dashboard submenu items
const dashboardSubmenu = [
  { name: 'Sales Overview', href: '/dashboard', moduleKey: 'report_sales_overview', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
  { name: 'Revenue Report', href: '/sales-revenue', moduleKey: 'report_revenue', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
  { name: 'Revenue Analytics', href: '/revenue-analytics', moduleKey: 'report_revenue_analytics', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
  { name: 'SKU Performance', href: '/sku-performance', moduleKey: 'report_sku_performance', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
  { name: 'Resource Performance', href: '/resource-performance', moduleKey: 'report_resource_performance', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
  { name: 'Account Performance', href: '/account-performance', moduleKey: 'report_account_performance', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
];

// Sales Context Navigation
const salesNavigationGroups = [
  {
    title: 'Core',
    items: [
      { name: 'Home', href: '/home', icon: Home, moduleKey: 'home', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, moduleKey: 'dashboard', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'], hasSubmenu: true },
      { name: 'Leads', href: '/leads', icon: Users, moduleKey: 'leads', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Pipeline', href: '/leads/kanban', icon: Kanban, moduleKey: 'pipeline', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Accounts', href: '/accounts', icon: Building2, moduleKey: 'accounts', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Account GOP Metrics', href: '/accounts/sku-pricing', icon: Package, moduleKey: 'account_gop_metrics', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Invoices', href: '/invoices', icon: FileText, moduleKey: 'invoices', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Customer Returns', href: '/customer-returns', icon: PackageOpen, moduleKey: 'customer_returns', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Design Requests', href: '/marketing-requests', icon: Sparkles, moduleKey: 'marketing_requests', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Print Requests', href: '/print-requests', icon: Printer, moduleKey: 'print_requests', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Sales Portal', href: '/sales-portal', icon: Store, moduleKey: 'sales_portal', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Lead & Sales Operations',
    items: [
      { name: 'Lead Discovery', href: '/lead-discovery', icon: Search, moduleKey: 'lead_discovery', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Target Planning', href: '/target-planning', icon: Target, moduleKey: 'target_planning', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Performance Tracker', href: '/performance', icon: BarChart3, moduleKey: 'performance_tracker', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Investor Dashboard', href: '/investor-dashboard', icon: LineChart, moduleKey: 'investor_dashboard', roles: ['CEO', 'Director', 'Admin', 'System Admin', 'Investor'] },
      { name: 'Daily Status', href: '/daily-status', icon: CalendarDays, moduleKey: 'daily_status', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Meeting Minutes', href: '/meeting-minutes', icon: NotebookPen, moduleKey: 'meeting_minutes', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'My Calendar', href: '/personal-calendar', icon: CalendarDays, moduleKey: 'personal_calendar', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin', 'Production Manager', 'Production Engineer', 'QC Manager', 'Distributor', 'Distributor Manager', 'Marketing Manager', 'Marketing Executive', 'Content Creator'] },
      { name: 'Mail', href: '/mail', icon: Mail },
      { name: 'Status Summary', href: '/status-summary', icon: UsersRound, moduleKey: 'status_summary', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Customer Complaints', href: '/complaints', icon: MessageSquareWarning, moduleKey: 'customer_complaints', roles: ['CEO', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Pricing & Logistics',
    items: [
      { name: 'COGS Calculator', href: '/cogs-calculator', icon: Calculator, moduleKey: 'cogs_calculator' },
      { name: 'Transport Calculator', href: '/transportation-calculator', icon: Truck, moduleKey: 'transport_calculator', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Product & SKU',
    items: [
      { name: 'Bottle Preview', href: '/bottle-preview', icon: Droplets, moduleKey: 'bottle_preview', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Presentation Generator', href: '/gamma-generator', icon: Sparkles, moduleKey: 'gamma_generator', roles: ['CEO', 'Admin', 'System Admin'] },
      { name: 'Proposal Template', href: '/proposal-template', icon: FileText, roles: ['CEO', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Documents',
    items: [
      { name: 'Company Documents', href: '/company-documents', icon: FileText, moduleKey: 'company_documents', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Business Development Executive', 'Sales Representative', 'Admin', 'System Admin'] },
      { name: 'Files & Documents', href: '/files-documents', icon: FolderOpen, moduleKey: 'files_documents', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Knowledge Base', href: '/knowledge-base', icon: BookOpen, moduleKey: 'knowledge_base', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin', 'Marketing Manager', 'Marketing Executive', 'Content Creator'] },
      { name: 'Email Templates', href: '/email-templates', icon: Mail, roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Business Development Executive', 'Sales Representative', 'Admin', 'System Admin', 'Marketing Manager', 'Marketing Executive'] },
      { name: 'Notifications', href: '/notification-settings', icon: Bell, roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Business Development Executive', 'Sales Representative', 'Admin', 'System Admin', 'Marketing Manager', 'Marketing Executive', 'Content Creator', 'Production Manager', 'Production Executive', 'Distribution Manager', 'Distribution Executive'] },
      { name: 'Sharing Recipients', href: '/settings/share-recipients', icon: Share2, roles: ['CEO', 'Director', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Requests',
    items: [
      { name: 'Leaves', href: '/leaves', icon: CalendarOff, moduleKey: 'leaves', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Travel Request', href: '/travel-requests', icon: Plane, moduleKey: 'travel_requests', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Budget Request', href: '/budget-requests', icon: Wallet, moduleKey: 'budget_requests', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Tasks & Requests', href: '/tasks', icon: ClipboardList, moduleKey: 'task_management', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Organization',
    items: [
      { name: 'Company Profile', href: '/company-profile', icon: Building, moduleKey: 'company_profile', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Team', href: '/team', icon: UserCog, moduleKey: 'team', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Admin', 'System Admin'] },
      { name: 'Contacts', href: '/contacts', icon: Contact, moduleKey: 'contacts', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep', 'Business Development Executive', 'Sales Representative', 'Admin', 'System Admin'] },
    ]
  },
];

// Production Context Navigation
const productionNavigationGroups = [
  {
    title: 'Production',
    items: [
      { name: 'Dashboard', href: '/production-dashboard', icon: BarChart3, moduleKey: 'production_dashboard', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
      { name: 'Production Batches', href: '/production-batches', icon: Factory, moduleKey: 'production_batches', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
      { name: 'QC Routes', href: '/qc-routes', icon: ArrowRight, moduleKey: 'qc_routes', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Admin', 'System Admin'] },
      { name: 'QC Team', href: '/qc-team', icon: Users, moduleKey: 'qc_team', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Admin', 'System Admin'] },
      { name: 'Rejection Reasons', href: '/rejection-reasons', icon: AlertTriangle, moduleKey: 'rejection_reasons', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Admin', 'System Admin'] },
      { name: 'Rejection Report', href: '/rejection-report', icon: BarChart3, moduleKey: 'rejection_report', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
      { name: 'Rejection Cost Config', href: '/production/rejection-cost-config', icon: IndianRupee, moduleKey: 'rejection_cost_config', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Admin', 'System Admin'] },
      { name: 'Packaging Types', href: '/packaging-types', icon: Boxes, moduleKey: 'packaging_types', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Admin', 'System Admin'] },
      { name: 'Maintenance', href: '/maintenance', icon: Wrench, moduleKey: 'maintenance', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
      { name: 'Inventory', href: '/inventory', icon: Boxes, moduleKey: 'inventory', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
      { name: 'Customer Returns', href: '/customer-returns', icon: PackageOpen, moduleKey: 'customer_returns', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
      { name: 'Design Requests', href: '/marketing-requests', icon: Sparkles, moduleKey: 'marketing_requests', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
      { name: 'Print Requests', href: '/print-requests', icon: Printer, moduleKey: 'print_requests', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
      { name: 'Quality Control', href: '/quality-control', icon: ShieldCheck, moduleKey: 'quality_control', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
      { name: 'Customer Complaints', href: '/complaints', icon: MessageSquareWarning, moduleKey: 'customer_complaints', roles: ['CEO', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Assets & Vendors',
    items: [
      { name: 'Assets', href: '/assets', icon: Box, moduleKey: 'assets', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Admin', 'System Admin'] },
      { name: 'Vendors', href: '/vendors', icon: Truck, moduleKey: 'vendors', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Documents',
    items: [
      { name: 'Files & Documents', href: '/files-documents', icon: FolderOpen, moduleKey: 'files_documents', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Organization',
    items: [
      { name: 'Company Profile', href: '/company-profile', icon: Building, moduleKey: 'company_profile', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Admin', 'System Admin'] },
      { name: 'Team', href: '/team', icon: UserCog, moduleKey: 'team', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Admin', 'System Admin'] },
      { name: 'Tasks & Requests', href: '/tasks', icon: ClipboardList, moduleKey: 'task_management', roles: ['CEO', 'Director', 'Vice President', 'Production Manager', 'Production Supervisor', 'Production Staff', 'Admin', 'System Admin'] },
    ]
  },
];

// Distribution Context Navigation
const distributionNavigationGroups = [
  {
    title: 'Distribution',
    items: [
      { name: 'Distributors', href: '/distributors', icon: Truck, moduleKey: 'distributors', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Admin', 'System Admin'] },
      { name: 'Stock Transfers', href: '/distributor/stock-transfers', icon: ArrowLeftRight, moduleKey: 'distributors', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Admin', 'System Admin'] },
      { name: 'Customer Returns', href: '/customer-returns', icon: PackageOpen, moduleKey: 'customer_returns', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Admin', 'System Admin', 'Distributor', 'Distributor Manager'] },
      { name: 'Stock Dashboard', href: '/stock-dashboard', icon: Package, moduleKey: 'stock_dashboard', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Admin', 'System Admin'] },
      { name: 'Cost Cards', href: '/cost-cards', icon: DollarSign, moduleKey: 'cost_cards', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Documents',
    items: [
      { name: 'Files & Documents', href: '/files-documents', icon: FolderOpen, moduleKey: 'files_documents', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Admin', 'System Admin'] },
    ]
  },
  {
    title: 'Organization',
    items: [
      { name: 'Company Profile', href: '/company-profile', icon: Building, moduleKey: 'company_profile', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Admin', 'System Admin'] },
      { name: 'Team', href: '/team', icon: UserCog, moduleKey: 'team', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Admin', 'System Admin'] },
      { name: 'Tasks & Requests', href: '/tasks', icon: ClipboardList, moduleKey: 'task_management', roles: ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Admin', 'System Admin'] },
    ]
  },
];

// Distributor User Navigation (full self-service portal menu).
// Each item deep-links to a tab on the user's own distributor detail page.
const buildDistributorUserNavigationGroups = (distributorId) => {
  const tab = (t) => `/distributors/${distributorId}?tab=${t}`;
  return [
    {
      title: 'Overview',
      items: [
        { name: 'Home', href: '/distributor-home', icon: Home, roles: ['Distributor'] },
        { name: 'Stock Dashboard', href: tab('stock-dashboard'), icon: BarChart3, roles: ['Distributor'] },
      ],
    },
    {
      title: 'Operations',
      items: [
        { name: 'Stock In', href: tab('stockin'), icon: Package, roles: ['Distributor'] },
        { name: 'Stock Entry', href: tab('stock-entry'), icon: PackagePlus, roles: ['Distributor'] },
        { name: 'Stock Out', href: tab('stockout'), icon: Truck, roles: ['Distributor'], highlight: true },
        { name: 'Customer Returns', href: tab('returns'), icon: PackageOpen, roles: ['Distributor'] },
      ],
    },
    {
      title: 'Deliveries',
      items: [
        { name: 'Delivery Schedules', href: '/distributor/delivery-schedules', icon: CalendarRange, roles: ['Distributor'] },
      ],
    },
    {
      title: 'Finance',
      items: [
        { name: 'Settlements', href: tab('settlements'), icon: Receipt, roles: ['Distributor'] },
        { name: 'Reconciliation', href: tab('billing'), icon: Calculator, roles: ['Distributor'] },
      ],
    },
    {
      title: 'My Account',
      items: [
        { name: 'My Profile', href: tab('profile'), icon: Building2, roles: ['Distributor'] },
        { name: 'Commercial', href: tab('commercial'), icon: IndianRupee, roles: ['Distributor'] },
      ],
    },
  ];
};

// Marketing Context Navigation
const marketingNavigationGroups = [
  {
    title: 'Marketing',
    items: [
      { name: 'Design Requests', href: '/marketing-requests', icon: Sparkles, moduleKey: 'marketing_requests', roles: ['CEO', 'Director', 'Admin', 'System Admin', 'Marketing Manager', 'Marketing Executive', 'Content Creator', 'Production Manager', 'Production Supervisor', 'Production Staff'] },
      { name: 'Print Requests', href: '/print-requests', icon: Printer, moduleKey: 'print_requests', roles: ['CEO', 'Director', 'Admin', 'System Admin', 'Marketing Manager', 'Marketing Executive', 'Content Creator', 'Production Manager', 'Production Supervisor', 'Production Staff'] },
      { name: 'Content Calendar', href: '/marketing-calendar', icon: CalendarRange, moduleKey: 'marketing_calendar', roles: ['CEO', 'Director', 'Admin', 'System Admin', 'Marketing Manager', 'Marketing Executive', 'Content Creator'] },
      { name: 'Masters', href: '/marketing-masters', icon: Layers, moduleKey: 'marketing_masters', roles: ['CEO', 'Director', 'Admin', 'System Admin', 'Marketing Manager'] },
    ]
  },
  {
    title: 'Organization',
    items: [
      { name: 'Company Profile', href: '/company-profile', icon: Building, moduleKey: 'company_profile', roles: ['CEO', 'Director', 'Admin', 'System Admin', 'Marketing Manager'] },
      { name: 'Team', href: '/team', icon: UserCog, moduleKey: 'team', roles: ['CEO', 'Director', 'Admin', 'System Admin', 'Marketing Manager'] },
      { name: 'Tasks & Requests', href: '/tasks', icon: ClipboardList, moduleKey: 'task_management', roles: ['CEO', 'Director', 'Admin', 'System Admin', 'Marketing Manager', 'Marketing Executive', 'Content Creator'] },
      { name: 'Mail', href: '/mail', icon: Mail },
    ]
  },
];

// Admin Context Navigation (Fleet, Masters, Settings, Integrations)
const ADMIN_ONLY_ROLES = ['CEO', 'Director', 'Admin', 'System Admin'];
const adminNavigationGroups = [
  {
    title: 'Fleet',
    items: [
      { name: 'Vehicles', href: '/admin/vehicles', icon: Truck, roles: ADMIN_ONLY_ROLES },
      { name: 'Drivers', href: '/admin/drivers', icon: UsersRound, roles: ADMIN_ONLY_ROLES },
    ],
  },
  {
    title: 'Product & SKU',
    items: [
      { name: 'SKU Management', href: '/sku-management', icon: Package, moduleKey: 'sku_management', roles: ADMIN_ONLY_ROLES },
      { name: 'Replace SKU', href: '/admin/sku-migrate', icon: ArrowLeftRight, moduleKey: 'sku_replace', roles: ADMIN_ONLY_ROLES },
      { name: 'Batch Genealogy', href: '/admin/batch-genealogy', icon: Layers, roles: ADMIN_ONLY_ROLES },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { name: 'Locations', href: '/master-locations', icon: MapPin, moduleKey: 'master_locations', roles: ADMIN_ONLY_ROLES },
      { name: 'Lead Statuses', href: '/master-lead-status', icon: Settings, moduleKey: 'lead_statuses', roles: ADMIN_ONLY_ROLES },
      { name: 'Design Request Types', href: '/admin/request-types', icon: Tag, moduleKey: 'marketing_request_types', roles: ADMIN_ONLY_ROLES },
      { name: 'Print Settings', href: '/admin/print-settings', icon: Printer, moduleKey: 'print_request_statuses', roles: ADMIN_ONLY_ROLES },
      { name: 'Business Categories', href: '/master-business-categories', icon: Building, moduleKey: 'business_categories', roles: ADMIN_ONLY_ROLES },
      { name: 'Contact Categories', href: '/master-contact-categories', icon: Users, moduleKey: 'contact_categories', roles: ADMIN_ONLY_ROLES },
      { name: 'Expense Categories', href: '/expense-category-master', icon: Receipt, moduleKey: 'expense_categories', roles: ADMIN_ONLY_ROLES },
      { name: 'COGS Components', href: '/master/cogs-components', icon: Receipt, moduleKey: 'cogs_components', roles: ['CEO', 'Director', 'System Admin'] },
      { name: 'Lead Scoring Model', href: '/lead-scoring-model', icon: Gauge, moduleKey: 'lead_scoring_model', roles: ADMIN_ONLY_ROLES },
    ],
  },
  {
    title: 'Finance & Audit',
    items: [
      { name: 'Reversals Log', href: '/admin/reversals', icon: RotateCcw, roles: ADMIN_ONLY_ROLES },
    ],
  },
  {
    title: 'Settings & Integrations',
    items: [
      { name: 'Tenant Settings', href: '/tenant-settings', icon: Settings, moduleKey: 'tenant_settings', roles: ADMIN_ONLY_ROLES },
      { name: 'API Keys', href: '/settings/api-keys', icon: KeyRound, moduleKey: 'api_keys', roles: ADMIN_ONLY_ROLES },
      { name: 'Zoho Books', href: '/settings/integrations/zoho', icon: Cable, moduleKey: 'zoho_integration', roles: ['CEO', 'Admin', 'System Admin'] },
      { name: 'Slack', href: '/admin/slack', icon: Cable, moduleKey: 'slack_integration', roles: ['CEO', 'Admin', 'System Admin'] },
      { name: 'Google Drive', href: '/admin/google-drive', icon: Cable, moduleKey: 'google_drive_integration', roles: ['CEO', 'Admin', 'System Admin'] },
      { name: 'State Machines', href: '/admin/state-machines', icon: Cable, moduleKey: 'state_machines', roles: ['CEO', 'Admin', 'System Admin'] },
      { name: 'Platform Admin', href: '/platform-admin', icon: Crown, isPlatformAdminOnly: true },
    ],
  },
];

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const { currentContext, switchContext, canAccessMultipleModules, getAccessibleModules, modules, isDistributorUser, getDistributorId } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const { navigateTo } = useNavigation();
  const { isModuleEnabled, hasRolePermission, rolePermissions, branding } = useTenantConfig();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get branding values with fallbacks
  const logoUrl = branding?.logo_url || null;
  const appName = branding?.app_name || 'Sales CRM';
  const tagline = branding?.tagline || (currentContext === 'production' ? 'Production' : currentContext === 'distribution' ? 'Distribution' : currentContext === 'marketing' ? 'Marketing' : currentContext === 'admin' ? 'Admin' : 'Sales CRM');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop / iPad: user can collapse the sidebar to gain horizontal room.
  // Persisted so the choice survives reloads.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === '1'; } catch { return false; }
  });
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebarCollapsed', next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };
  const [dashboardOpen, setDashboardOpen] = useState(
    location.pathname === '/dashboard' || location.pathname === '/sales-revenue' || 
    location.pathname === '/target-sku' || location.pathname === '/target-resource' ||
    location.pathname === '/sku-performance' || location.pathname === '/resource-performance' ||
    location.pathname === '/account-performance'
  );
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Redirect Distributor users to their welcome dashboard (or keep them inside their own scope)
  useEffect(() => {
    if (isDistributorUser && getDistributorId) {
      const ownProfilePrefix = `/distributors/${getDistributorId}`;
      const allowedPaths = ['/distributor-home', '/login', '/logout'];

      // Allow: welcome page, login/logout, the distributor's own detail page (with any ?tab=),
      // and the new Delivery Schedules module (list + detail).
      const isOnOwnDetail = location.pathname === ownProfilePrefix || location.pathname.startsWith(ownProfilePrefix + '/');
      const isOnAllowed = allowedPaths.includes(location.pathname);
      const isOnDeliverySchedules = location.pathname === '/distributor/delivery-schedules' || location.pathname.startsWith('/distributor/delivery-schedules/');

      if (!isOnOwnDetail && !isOnAllowed && !isOnDeliverySchedules) {
        navigate('/distributor-home');
      } else if (location.pathname === '/distributors') {
        // Distributors should never see the global list page
        navigate('/distributor-home');
      }
    }
  }, [isDistributorUser, getDistributorId, location.pathname, navigate]);

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
    const module = modules[newContext];
    if (module) {
      navigateTo(module.defaultRoute, { fromSidebar: true });
    }
  };

  // Select navigation groups based on current context and user role
  const getNavigationGroups = () => {
    // Distributor users get a dedicated portal nav with their own distributor's tabs as menu items
    if (isDistributorUser) {
      return buildDistributorUserNavigationGroups(getDistributorId);
    }
    
    switch (currentContext) {
      case 'production':
        return productionNavigationGroups;
      case 'distribution':
        return distributionNavigationGroups;
      case 'marketing':
        return marketingNavigationGroups;
      case 'admin':
        return adminNavigationGroups;
      default:
        return salesNavigationGroups;
    }
  };
  
  const navigationGroups = getNavigationGroups();

  /**
   * Decide whether a nav item is visible to the current user.
   * Precedence (top wins):
   *  1. Tenant has disabled the module entirely → hidden.
   *  2. The Permissions UI has an explicit entry for this moduleKey →
   *     respect `view` strictly (true ⇒ allow, false ⇒ deny). The hardcoded
   *     role list on the item is intentionally ignored in this case, so a
   *     custom role configured via the UI can be granted access to items it
   *     was not originally listed for, and an explicit deny cannot be
   *     bypassed by the hardcoded list.
   *  3. No explicit permission entry → fall back to the hardcoded role list.
   */
  const canSeeItem = (item) => {
    if (!item.moduleKey) {
      // No moduleKey ⇒ availability is purely role-based.
      return !item.roles || item.roles.includes(user?.role);
    }
    if (!isModuleEnabled(item.moduleKey)) return false;
    const modulePerms = rolePermissions ? rolePermissions[item.moduleKey] : undefined;
    if (modulePerms !== undefined) {
      // Permissions UI has spoken about this module — respect strictly.
      return modulePerms?.view === true;
    }
    // No explicit entry — fall back to hardcoded role list (or allow if not set).
    return !item.roles || item.roles.includes(user?.role);
  };

  // Filter dashboard submenu
  const filteredDashboardSubmenu = dashboardSubmenu.filter(canSeeItem);
  
  const isDashboardActive = location.pathname === '/dashboard' || location.pathname === '/sales-revenue' || 
    location.pathname === '/target-sku' || location.pathname === '/target-resource' ||
    location.pathname === '/sku-performance' || location.pathname === '/resource-performance' ||
    location.pathname === '/account-performance';

  // Check if user is platform admin
  const isPlatformAdmin = user && PLATFORM_ADMIN_EMAILS.includes(user.email?.toLowerCase());

  // Filter navigation groups using the same canSeeItem precedence
  // (module enabled → explicit permission entry → hardcoded role fallback).
  // Platform-admin-only items are layered on top.
  const filteredGroups = navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.isPlatformAdminOnly) return isPlatformAdmin;
      return canSeeItem(item);
    })
  })).filter(group => group.items.length > 0);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[hsl(200,35%,12%)] dark:bg-[hsl(200,40%,8%)] transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0'}`} data-testid="dashboard-sidebar">
        {/* Desktop collapse handle — sits at the right edge of the sidebar */}
        <button
          type="button"
          onClick={toggleSidebarCollapsed}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="hidden lg:flex absolute -right-3 top-6 z-[60] h-7 w-7 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-200 hover:bg-slate-50 transition-colors"
          data-testid="sidebar-collapse-btn"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt={appName} className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-lg">{appName.charAt(0)}</span>
                </div>
              )}
              <div>
                <h1 className="text-white font-bold text-lg tracking-tight">{appName}</h1>
                <p className="text-white/60 text-xs">{tagline}</p>
              </div>
            </div>
          </div>
          
          {/* Module Selector - Scalable for multiple modules */}
          {canAccessMultipleModules && (
            <div className="px-4 py-3 border-b border-white/10">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2 block">
                Module
              </label>
              <Select value={currentContext} onValueChange={handleContextSwitch}>
                <SelectTrigger
                  className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 focus:ring-primary/50 transition-all [&>svg]:text-white/50"
                  data-testid="module-selector"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {getAccessibleModules().map((module) => (
                    <SelectItem
                      key={module.id}
                      value={module.id}
                      className="text-white focus:bg-white/10 focus:text-white"
                    >
                      {module.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Active Module Indicator */}
              <div className="mt-2 flex items-center gap-2">
                {currentContext === 'sales' && <Store className="w-4 h-4 text-primary" />}
                {currentContext === 'production' && <Factory className="w-4 h-4 text-primary" />}
                {currentContext === 'distribution' && <Truck className="w-4 h-4 text-primary" />}
                {currentContext === 'marketing' && <Megaphone className="w-4 h-4 text-primary" />}
                {currentContext === 'admin' && <ShieldCheck className="w-4 h-4 text-primary" />}
                <span className="text-xs text-primary font-medium">
                  {modules[currentContext]?.label || 'Sales'} Module Active
                </span>
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
                      
                      const itemPath = (item.href || '').split('?')[0];
                      const itemTab = (() => {
                        const m = (item.href || '').match(/[?&]tab=([^&]+)/);
                        return m ? decodeURIComponent(m[1]) : null;
                      })();
                      const currentTab = new URLSearchParams(location.search).get('tab');
                      const isActive = itemTab
                        ? (location.pathname === itemPath && currentTab === itemTab)
                        : (location.pathname === item.href || location.pathname.startsWith(item.href + '/'));
                      return (
                        <button
                          key={item.name}
                          onClick={() => handleSidebarNav(item.href)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                              : item.highlight
                                ? 'text-white hover:bg-white/10 ring-1 ring-amber-400/40'
                                : 'text-white/80 hover:bg-white/10 hover:text-white'
                          }`}
                          data-testid={`sidebar-${(item.name || '').toLowerCase().replace(/\s+/g, '-')}`}
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
              <NotificationBell />
            </div>

            {isDistributorUser && <FacilitySwitcher />}

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
      <div className={`flex-1 flex flex-col min-w-0 transition-[margin-left] duration-200 ${sidebarCollapsed ? 'lg:ml-0' : 'lg:ml-64'}`}>
        {/* Desktop floating "expand sidebar" handle — only when collapsed */}
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="hidden lg:flex fixed left-2 top-4 z-40 h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-700 shadow-md ring-1 ring-slate-200 hover:bg-slate-50 transition-colors"
            data-testid="sidebar-expand-btn"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        )}
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
              {logoUrl ? (
                <img src={logoUrl} alt={appName} className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold">{appName.charAt(0)}</span>
                </div>
              )}
              <span className="font-bold text-foreground">{appName}</span>
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
      
      {/* Ask Nyla - Knowledge Base floating chat assistant */}
      <AskNyla />
      {/* Distributor ↔ Supplier chat — auto-hides for non-distributor / non-supplier roles */}
      <DistributorChatButton />
    </div>
  );
}
