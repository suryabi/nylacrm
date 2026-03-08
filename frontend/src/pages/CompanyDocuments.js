import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import { 
  FileText, Plane, CalendarOff, Gift, Receipt, Wallet,
  Loader2, CheckCircle, XCircle, AlertTriangle, Info,
  Hotel, Utensils, Phone, Briefcase, GraduationCap, MoreHorizontal,
  IndianRupee, Shield, Building, Users, FileCheck, Download
} from 'lucide-react';
import { cn } from '../lib/utils';
import AppBreadcrumb from '../components/AppBreadcrumb';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Icon mapping for categories
const CATEGORY_ICONS = {
  'plane': Plane,
  'hotel': Hotel,
  'utensils': Utensils,
  'phone': Phone,
  'briefcase': Briefcase,
  'graduation-cap': GraduationCap,
  'gift': Gift,
  'more-horizontal': MoreHorizontal,
};

// Format currency
const formatCurrency = (value) => {
  if (!value && value !== 0) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

// Document item component
const DocumentItem = ({ title, description, icon: Icon, status, onClick, comingSoon }) => (
  <Card 
    className={cn(
      "cursor-pointer transition-all hover:shadow-md hover:border-primary/30",
      comingSoon && "opacity-60"
    )}
    onClick={onClick}
  >
    <CardContent className="p-4">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            {comingSoon && (
              <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
            )}
            {status === 'available' && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                <CheckCircle className="h-3 w-3 mr-1" /> Available
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Travel Policy Component - Shows role-based expense limits
const TravelPolicyContent = ({ userRole }) => {
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState([]);

  useEffect(() => {
    const fetchPolicy = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/api/expense-master/policy?role=${encodeURIComponent(userRole)}`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data = await response.json();
          setPolicy(data);
        }
      } catch (error) {
        console.error('Error fetching policy:', error);
        toast.error('Failed to load travel policy');
      } finally {
        setLoading(false);
      }
    };
    fetchPolicy();
  }, [userRole]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Filter to show travel-related categories
  const travelCategories = policy.filter(cat => 
    ['Travel', 'Accommodation', 'Meals & Entertainment'].includes(cat.name)
  );

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Your Travel Policy Limits</p>
              <p className="text-sm text-blue-700 mt-1">
                The limits shown below are specific to your role: <strong>{userRole}</strong>. 
                All travel must be pre-approved by your manager. Expenses exceeding your limits require additional approval.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Travel Categories */}
      <Accordion type="multiple" defaultValue={['Travel', 'Accommodation', 'Meals & Entertainment']} className="w-full">
        {travelCategories.map((category) => {
          const IconComponent = CATEGORY_ICONS[category.icon] || Plane;
          return (
            <AccordionItem key={category.id} value={category.name}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${category.color}20` }}
                  >
                    <IconComponent className="h-5 w-5" style={{ color: category.color }} />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold">{category.name}</span>
                    <p className="text-sm text-muted-foreground font-normal">{category.description}</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="pl-12 pr-4 pb-4 space-y-4">
                  {/* Policy Guidelines */}
                  {category.policy_guidelines && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                      <div className="flex items-center gap-2 text-amber-700 mb-1">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs font-semibold uppercase">Policy Guidelines</span>
                      </div>
                      <p className="text-sm text-amber-800">{category.policy_guidelines}</p>
                    </div>
                  )}

                  {/* Expense Types Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Expense Type</TableHead>
                          <TableHead className="text-right">Your Limit</TableHead>
                          <TableHead className="text-center">Receipt Required</TableHead>
                          <TableHead className="text-center">Justification</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {category.expense_types?.map((type) => {
                          const isAllowed = type.is_allowed_for_role !== false;
                          const limit = type.role_limit || type.default_limit || 0;
                          
                          return (
                            <TableRow key={type.id} className={!isAllowed ? 'opacity-50 bg-red-50/30' : ''}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{type.name}</p>
                                  {type.policy_guidelines && (
                                    <p className="text-xs text-muted-foreground mt-1">{type.policy_guidelines}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {isAllowed ? (
                                  <Badge variant="outline" className="font-mono text-green-700 border-green-300">
                                    {formatCurrency(limit)}
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs">
                                    Not Allowed
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {type.requires_receipt ? (
                                  <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {type.requires_justification ? (
                                  <CheckCircle className="h-4 w-4 text-amber-500 mx-auto" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={isAllowed ? "default" : "secondary"}>
                                  {isAllowed ? 'Allowed' : 'Restricted'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Other Categories (collapsed by default) */}
      {policy.filter(cat => !['Travel', 'Accommodation', 'Meals & Entertainment'].includes(cat.name)).length > 0 && (
        <>
          <h3 className="text-lg font-semibold mt-8 mb-4">Other Expense Categories</h3>
          <Accordion type="single" collapsible className="w-full">
            {policy.filter(cat => !['Travel', 'Accommodation', 'Meals & Entertainment'].includes(cat.name)).map((category) => {
              const IconComponent = CATEGORY_ICONS[category.icon] || Briefcase;
              return (
                <AccordionItem key={category.id} value={category.name}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${category.color}20` }}
                      >
                        <IconComponent className="h-4 w-4" style={{ color: category.color }} />
                      </div>
                      <span className="font-medium">{category.name}</span>
                      <Badge variant="outline" className="text-xs ml-2">
                        {category.expense_types?.length || 0} types
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-10 pr-4 pb-2">
                      {category.policy_guidelines && (
                        <p className="text-sm text-muted-foreground mb-3 italic">{category.policy_guidelines}</p>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {category.expense_types?.map((type) => {
                          const isAllowed = type.is_allowed_for_role !== false;
                          const limit = type.role_limit || type.default_limit || 0;
                          return (
                            <div 
                              key={type.id} 
                              className={cn(
                                "p-2 border rounded-lg",
                                !isAllowed && "opacity-50 bg-red-50/30"
                              )}
                            >
                              <p className="text-sm font-medium">{type.name}</p>
                              <p className="text-xs text-green-600 font-mono">
                                {isAllowed ? formatCurrency(limit) : 'Not Allowed'}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </>
      )}

      {/* Footer Note */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> These limits are per transaction/day unless otherwise specified. 
            For expenses exceeding your limits, please submit a request through the Travel Request module 
            for pre-approval. All claims must be submitted within 30 days of the expense date.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

// Leave Policy Component
const LeavePolicyContent = () => (
  <div className="space-y-6">
    <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <CalendarOff className="h-5 w-5 text-green-600 mt-0.5" />
          <div>
            <p className="font-medium text-green-900">Leave Policy Overview</p>
            <p className="text-sm text-green-700 mt-1">
              Our leave policy is designed to help you maintain a healthy work-life balance.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Casual Leave</CardTitle>
          <CardDescription>12 days per year</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>Can be taken for personal matters</li>
            <li>Maximum 3 consecutive days at a time</li>
            <li>Cannot be carried forward to next year</li>
            <li>Advance intimation of at least 1 day required</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sick Leave</CardTitle>
          <CardDescription>12 days per year</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>For medical emergencies and illness</li>
            <li>Medical certificate required for 3+ days</li>
            <li>Unused leaves can be carried forward (max 30 days)</li>
            <li>Inform manager as soon as possible</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Earned Leave</CardTitle>
          <CardDescription>18 days per year (accrued monthly)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>1.5 days accrued per month of service</li>
            <li>Can be carried forward (max 45 days)</li>
            <li>Advance application required (7 days)</li>
            <li>Encashment available at year end</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Public Holidays</CardTitle>
          <CardDescription>12 days per year</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>As per company holiday calendar</li>
            <li>Compensatory off for work on holidays</li>
            <li>Double pay option available</li>
            <li>Calendar shared at start of year</li>
          </ul>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">Special Leaves</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Leave Type</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Eligibility</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Maternity Leave</TableCell>
              <TableCell>26 weeks</TableCell>
              <TableCell>Female employees with 80+ days of service</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Paternity Leave</TableCell>
              <TableCell>5 days</TableCell>
              <TableCell>Male employees</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Bereavement Leave</TableCell>
              <TableCell>5 days</TableCell>
              <TableCell>Death of immediate family member</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Marriage Leave</TableCell>
              <TableCell>5 days</TableCell>
              <TableCell>Own marriage (once during employment)</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
);

// Incentive Policy Component
const IncentivePolicyContent = () => (
  <div className="space-y-6">
    <Card className="bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Gift className="h-5 w-5 text-purple-600 mt-0.5" />
          <div>
            <p className="font-medium text-purple-900">Sales Incentive Program</p>
            <p className="text-sm text-purple-700 mt-1">
              Our incentive structure rewards high performance and consistent target achievement.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monthly Target Incentives</CardTitle>
        <CardDescription>Based on monthly revenue achievement</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Achievement %</TableHead>
              <TableHead>Incentive</TableHead>
              <TableHead>Additional Benefits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">100% - 110%</TableCell>
              <TableCell>1% of revenue</TableCell>
              <TableCell>-</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">111% - 125%</TableCell>
              <TableCell>1.5% of revenue</TableCell>
              <TableCell>Recognition certificate</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">126% - 150%</TableCell>
              <TableCell>2% of revenue</TableCell>
              <TableCell>Bonus vacation day</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">&gt;150%</TableCell>
              <TableCell>2.5% of revenue</TableCell>
              <TableCell>Star Performer Award</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quarterly Bonuses</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>Consistent achievers bonus: ₹10,000 for 3 consecutive months at 100%+</li>
            <li>Top performer of quarter: ₹25,000 bonus</li>
            <li>Team achievement bonus: ₹5,000 per member if team hits target</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Annual Awards</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>Best Sales Person: ₹1,00,000 + foreign trip</li>
            <li>Rising Star (under 1 year): ₹50,000</li>
            <li>Best Team: Team outing + ₹15,000 per member</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  </div>
);

// Payslips Component
const PayslipsContent = () => (
  <div className="space-y-6">
    <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Receipt className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900">Payslip Information</p>
            <p className="text-sm text-amber-700 mt-1">
              Your payslips are generated on the last working day of each month.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent className="py-12 text-center">
        <Receipt className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Payslip Portal Coming Soon</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          We're integrating with our payroll system to bring your payslips directly into this portal. 
          In the meantime, please contact HR for your payslip requests.
        </p>
        <Button variant="outline" className="mt-4" disabled>
          <Download className="h-4 w-4 mr-2" />
          Download Payslips
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">Salary Structure</CardTitle>
        <CardDescription>Components of your monthly compensation</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2 text-green-700">Earnings</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Basic Salary (40% of CTC)</li>
              <li>• House Rent Allowance (50% of Basic)</li>
              <li>• Special Allowance</li>
              <li>• Conveyance Allowance</li>
              <li>• Medical Allowance</li>
              <li>• Performance Incentives</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2 text-red-700">Deductions</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Provident Fund (12% of Basic)</li>
              <li>• Professional Tax</li>
              <li>• Income Tax (TDS)</li>
              <li>• Employee State Insurance (if applicable)</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);

// Main Component
export default function CompanyDocuments() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  const documentCategories = [
    {
      id: 'travel-policy',
      title: 'Travel & Expense Policy',
      description: 'Spending limits, guidelines, and reimbursement rules for travel and expenses',
      icon: Plane,
      status: 'available',
      tab: 'travel'
    },
    {
      id: 'leave-policy',
      title: 'Leave Policy',
      description: 'Types of leaves, eligibility, and application procedures',
      icon: CalendarOff,
      status: 'available',
      tab: 'leave'
    },
    {
      id: 'incentive-policy',
      title: 'Incentive Policy',
      description: 'Sales incentives, bonuses, and reward programs',
      icon: Gift,
      status: 'available',
      tab: 'incentive'
    },
    {
      id: 'payslips',
      title: 'Payslips',
      description: 'Monthly salary statements and tax documents',
      icon: Receipt,
      status: 'available',
      tab: 'payslips'
    },
    {
      id: 'hr-policies',
      title: 'HR Policies',
      description: 'Code of conduct, dress code, and workplace guidelines',
      icon: Users,
      comingSoon: true
    },
    {
      id: 'compliance',
      title: 'Compliance Documents',
      description: 'POSH policy, anti-bribery, and regulatory compliance',
      icon: Shield,
      comingSoon: true
    },
    {
      id: 'company-handbook',
      title: 'Employee Handbook',
      description: 'Complete guide to company policies and procedures',
      icon: FileText,
      comingSoon: true
    },
    {
      id: 'org-chart',
      title: 'Organization Structure',
      description: 'Company hierarchy and reporting structure',
      icon: Building,
      comingSoon: true
    },
  ];

  return (
    <div className="space-y-6" data-testid="company-documents">
      <AppBreadcrumb />
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Company Documents</h1>
        <p className="text-muted-foreground mt-1">
          Access company policies, guidelines, and important documents
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto flex-wrap">
          <TabsTrigger value="overview" className="data-[state=active]:bg-white">
            <FileText className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="travel" className="data-[state=active]:bg-white">
            <Plane className="h-4 w-4 mr-2" />
            Travel Policy
          </TabsTrigger>
          <TabsTrigger value="leave" className="data-[state=active]:bg-white">
            <CalendarOff className="h-4 w-4 mr-2" />
            Leave Policy
          </TabsTrigger>
          <TabsTrigger value="incentive" className="data-[state=active]:bg-white">
            <Gift className="h-4 w-4 mr-2" />
            Incentive Policy
          </TabsTrigger>
          <TabsTrigger value="payslips" className="data-[state=active]:bg-white">
            <Receipt className="h-4 w-4 mr-2" />
            Payslips
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid md:grid-cols-2 gap-4">
            {documentCategories.map((doc) => (
              <DocumentItem
                key={doc.id}
                title={doc.title}
                description={doc.description}
                icon={doc.icon}
                status={doc.status}
                comingSoon={doc.comingSoon}
                onClick={() => doc.tab && setActiveTab(doc.tab)}
              />
            ))}
          </div>
        </TabsContent>

        {/* Travel Policy Tab */}
        <TabsContent value="travel" className="mt-6">
          <TravelPolicyContent userRole={user?.role} />
        </TabsContent>

        {/* Leave Policy Tab */}
        <TabsContent value="leave" className="mt-6">
          <LeavePolicyContent />
        </TabsContent>

        {/* Incentive Policy Tab */}
        <TabsContent value="incentive" className="mt-6">
          <IncentivePolicyContent />
        </TabsContent>

        {/* Payslips Tab */}
        <TabsContent value="payslips" className="mt-6">
          <PayslipsContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}
