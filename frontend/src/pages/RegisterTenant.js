import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Building2, User, Mail, Lock, Globe, CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function RegisterTenant() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState(null);
  const [subdomainError, setSubdomainError] = useState('');
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registrationData, setRegistrationData] = useState(null);
  
  const [formData, setFormData] = useState({
    company_name: '',
    subdomain: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    confirm_password: ''
  });
  
  const [errors, setErrors] = useState({});

  // Debounced subdomain check
  useEffect(() => {
    const checkSubdomain = async () => {
      const subdomain = formData.subdomain.toLowerCase().trim();
      
      if (subdomain.length < 3) {
        setSubdomainAvailable(null);
        setSubdomainError(subdomain.length > 0 ? 'At least 3 characters required' : '');
        return;
      }
      
      setCheckingSubdomain(true);
      try {
        const response = await axios.get(`${API_URL}/api/tenants/check-subdomain/${subdomain}`);
        setSubdomainAvailable(response.data.available);
        setSubdomainError(response.data.available ? '' : response.data.reason);
      } catch (error) {
        setSubdomainAvailable(false);
        setSubdomainError('Unable to check availability');
      } finally {
        setCheckingSubdomain(false);
      }
    };

    const timeoutId = setTimeout(checkSubdomain, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.subdomain]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.company_name.trim()) {
      newErrors.company_name = 'Company name is required';
    }
    
    if (!formData.subdomain.trim()) {
      newErrors.subdomain = 'Subdomain is required';
    } else if (!subdomainAvailable) {
      newErrors.subdomain = subdomainError || 'Subdomain not available';
    }
    
    if (!formData.admin_name.trim()) {
      newErrors.admin_name = 'Your name is required';
    }
    
    if (!formData.admin_email.trim()) {
      newErrors.admin_email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) {
      newErrors.admin_email = 'Invalid email format';
    }
    
    if (!formData.admin_password) {
      newErrors.admin_password = 'Password is required';
    } else if (formData.admin_password.length < 8) {
      newErrors.admin_password = 'Password must be at least 8 characters';
    }
    
    if (formData.admin_password !== formData.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/tenants/register`, {
        company_name: formData.company_name.trim(),
        subdomain: formData.subdomain.toLowerCase().trim(),
        admin_name: formData.admin_name.trim(),
        admin_email: formData.admin_email.toLowerCase().trim(),
        admin_password: formData.admin_password
      });
      
      setRegistrationData(response.data);
      setRegistrationComplete(true);
      toast.success('Workspace created successfully!');
    } catch (error) {
      const message = error.response?.data?.detail || 'Registration failed. Please try again.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Auto-generate subdomain from company name
  const generateSubdomain = () => {
    if (formData.company_name && !formData.subdomain) {
      const subdomain = formData.company_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 30);
      handleChange('subdomain', subdomain);
    }
  };

  if (registrationComplete && registrationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Workspace Created!</CardTitle>
            <CardDescription>
              Your workspace <strong>{registrationData.tenant_id}</strong> is ready
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm">Next Steps:</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {registrationData.next_steps?.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-2">Your workspace URL:</p>
              <code className="text-primary font-mono text-sm">
                {window.location.origin}?tenant={registrationData.tenant_id}
              </code>
            </div>
            
            <div className="text-center text-sm text-muted-foreground">
              <p>Trial ends: {new Date(registrationData.trial_ends_at).toLocaleDateString()}</p>
            </div>
            
            <Button 
              onClick={() => navigate(`/login?tenant=${registrationData.tenant_id}`)}
              className="w-full"
              data-testid="go-to-login-btn"
            >
              Go to Login
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create Your Workspace</CardTitle>
          <CardDescription>
            Set up your Sales CRM in minutes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company Info Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Company Information
              </h3>
              
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  placeholder="Acme Corporation"
                  value={formData.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  onBlur={generateSubdomain}
                  className={errors.company_name ? 'border-destructive' : ''}
                  data-testid="company-name-input"
                />
                {errors.company_name && (
                  <p className="text-xs text-destructive">{errors.company_name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subdomain">Workspace URL</Label>
                <div className="flex items-center">
                  <Input
                    id="subdomain"
                    placeholder="acme"
                    value={formData.subdomain}
                    onChange={(e) => handleChange('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className={`rounded-r-none ${errors.subdomain ? 'border-destructive' : ''}`}
                    data-testid="subdomain-input"
                  />
                  <div className="px-3 py-2 bg-muted border border-l-0 rounded-r-md text-sm text-muted-foreground whitespace-nowrap">
                    .yourapp.com
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {checkingSubdomain && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Checking...
                    </span>
                  )}
                  {!checkingSubdomain && subdomainAvailable === true && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      Available
                    </span>
                  )}
                  {!checkingSubdomain && subdomainAvailable === false && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle className="w-3 h-3" />
                      {subdomainError}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Admin Account Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <User className="w-4 h-4" />
                Admin Account
              </h3>
              
              <div className="space-y-2">
                <Label htmlFor="admin_name">Your Name</Label>
                <Input
                  id="admin_name"
                  placeholder="John Smith"
                  value={formData.admin_name}
                  onChange={(e) => handleChange('admin_name', e.target.value)}
                  className={errors.admin_name ? 'border-destructive' : ''}
                  data-testid="admin-name-input"
                />
                {errors.admin_name && (
                  <p className="text-xs text-destructive">{errors.admin_name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="admin_email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="admin_email"
                    type="email"
                    placeholder="john@acme.com"
                    value={formData.admin_email}
                    onChange={(e) => handleChange('admin_email', e.target.value)}
                    className={`pl-10 ${errors.admin_email ? 'border-destructive' : ''}`}
                    data-testid="admin-email-input"
                  />
                </div>
                {errors.admin_email && (
                  <p className="text-xs text-destructive">{errors.admin_email}</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="admin_password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="admin_password"
                      type="password"
                      placeholder="Min 8 characters"
                      value={formData.admin_password}
                      onChange={(e) => handleChange('admin_password', e.target.value)}
                      className={`pl-10 ${errors.admin_password ? 'border-destructive' : ''}`}
                      data-testid="admin-password-input"
                    />
                  </div>
                  {errors.admin_password && (
                    <p className="text-xs text-destructive">{errors.admin_password}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    placeholder="Confirm password"
                    value={formData.confirm_password}
                    onChange={(e) => handleChange('confirm_password', e.target.value)}
                    className={errors.confirm_password ? 'border-destructive' : ''}
                    data-testid="confirm-password-input"
                  />
                  {errors.confirm_password && (
                    <p className="text-xs text-destructive">{errors.confirm_password}</p>
                  )}
                </div>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || checkingSubdomain || !subdomainAvailable}
              data-testid="register-tenant-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Workspace...
                </>
              ) : (
                <>
                  Create Workspace
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
            
            <p className="text-center text-sm text-muted-foreground">
              Already have a workspace?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
