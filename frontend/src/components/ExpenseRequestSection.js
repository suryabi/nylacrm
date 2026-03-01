import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { 
  Plus, 
  Loader2, 
  Trash2, 
  Receipt, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  Send,
  Package,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { skusAPI } from '../utils/api';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const EXPENSE_TYPES = [
  { id: 'gifting', label: 'Gifting Expense', requires_sku: false },
  { id: 'onboarding', label: 'On-boarding Expense', requires_sku: false },
  { id: 'staff_gifting', label: 'Staff Gifting Expense', requires_sku: false },
  { id: 'sponsorship', label: 'Sponsorship Expense', requires_sku: false },
  { id: 'free_trial', label: 'Free Trial Expense', requires_sku: true },
];

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: Clock },
  pending_approval: { label: 'Pending Approval', color: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500', icon: AlertCircle },
};

export default function ExpenseRequestSection({ entityType, entityId, entityName, entityCity }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [masterSkus, setMasterSkus] = useState([]);
  
  // Form state
  const [expenseType, setExpenseType] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [freeTrialDays, setFreeTrialDays] = useState('');
  const [skuItems, setSkuItems] = useState([]);
  
  useEffect(() => {
    fetchExpenses();
    fetchMasterSkus();
  }, [entityType, entityId]);
  
  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/expense-requests?entity_type=${entityType}&entity_id=${entityId}`,
        { withCredentials: true }
      );
      setExpenses(response.data || []);
    } catch (error) {
      console.log('Could not load expenses');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchMasterSkus = async () => {
    try {
      const res = await skusAPI.getMasterList();
      setMasterSkus(res.data.skus || []);
    } catch (error) {
      console.log('Could not load SKUs');
    }
  };
  
  const handleAddSkuItem = () => {
    setSkuItems([...skuItems, { sku_id: '', sku_name: '', quantity: 1 }]);
  };
  
  const handleRemoveSkuItem = (index) => {
    setSkuItems(skuItems.filter((_, i) => i !== index));
  };
  
  const handleSkuItemChange = (index, field, value) => {
    const updated = [...skuItems];
    if (field === 'sku_name') {
      const sku = masterSkus.find(s => s.sku_name === value || s.sku === value);
      updated[index] = {
        ...updated[index],
        sku_id: sku?.id || '',
        sku_name: value,
      };
    } else {
      updated[index] = { ...updated[index], [field]: field === 'quantity' ? parseInt(value) || 0 : value };
    }
    setSkuItems(updated);
  };
  
  const calculateSkuPrice = async (skuName) => {
    try {
      const response = await axios.get(
        `${API_URL}/cogs/sku-price/${encodeURIComponent(entityCity)}/${encodeURIComponent(skuName)}`,
        { withCredentials: true }
      );
      return response.data.minimum_landing_price || 0;
    } catch (error) {
      return 0;
    }
  };
  
  const handleSubmit = async (submitForApproval = false) => {
    if (!expenseType) {
      toast.error('Please select an expense type');
      return;
    }
    
    const expenseTypeInfo = EXPENSE_TYPES.find(t => t.id === expenseType);
    
    if (expenseType === 'free_trial') {
      if (!freeTrialDays || parseInt(freeTrialDays) < 1) {
        toast.error('Please enter the number of free trial days');
        return;
      }
      if (skuItems.length === 0) {
        toast.error('Please add at least one SKU for free trial');
        return;
      }
      if (skuItems.some(item => !item.sku_name || item.quantity < 1)) {
        toast.error('Please fill in all SKU details');
        return;
      }
    } else {
      if (!amount || parseFloat(amount) <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }
    }
    
    setSubmitting(true);
    try {
      const payload = {
        entity_type: entityType,
        entity_id: entityId,
        expense_type: expenseType,
        description,
        amount: expenseType !== 'free_trial' ? parseFloat(amount) : 0,
        free_trial_days: expenseType === 'free_trial' ? parseInt(freeTrialDays) : null,
        sku_items: expenseType === 'free_trial' ? skuItems : [],
        submit_for_approval: submitForApproval,
      };
      
      await axios.post(`${API_URL}/expense-requests`, payload, { withCredentials: true });
      
      toast.success(submitForApproval ? 'Expense request submitted for approval' : 'Expense request saved as draft');
      resetForm();
      setShowForm(false);
      fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create expense request');
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleDelete = async (expenseId) => {
    if (!window.confirm('Are you sure you want to cancel this expense request?')) return;
    
    try {
      await axios.delete(`${API_URL}/expense-requests/${expenseId}`, { withCredentials: true });
      toast.success('Expense request cancelled');
      fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel expense request');
    }
  };
  
  const resetForm = () => {
    setExpenseType('');
    setDescription('');
    setAmount('');
    setFreeTrialDays('');
    setSkuItems([]);
  };
  
  const selectedExpenseType = EXPENSE_TYPES.find(t => t.id === expenseType);
  
  return (
    <Card className="p-6" data-testid="expense-request-section">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Expense Requests
        </h2>
        <Button
          size="sm"
          onClick={() => setShowForm(true)}
          data-testid="new-expense-btn"
        >
          <Plus className="h-4 w-4 mr-1" /> New Request
        </Button>
      </div>
      
      {/* Expense History Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No expense requests yet</p>
          <p className="text-sm mt-1">Submit expense requests for approval</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="expense-history-table">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Amount</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((expense) => {
                const status = statusConfig[expense.status] || statusConfig.draft;
                const StatusIcon = status.icon;
                return (
                  <tr key={expense.id} className="hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <div>
                        <span className="font-medium">{expense.expense_type_label}</span>
                        {expense.expense_type === 'free_trial' && expense.free_trial_days && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({expense.free_trial_days} days)
                          </span>
                        )}
                      </div>
                      {expense.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {expense.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium">
                      ₹{(expense.amount || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={`${status.color} text-xs`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {format(new Date(expense.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-3 py-3">
                      {['draft', 'pending_approval'].includes(expense.status) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(expense.id)}
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          data-testid={`delete-expense-${expense.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      
      {/* New Expense Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              New Expense Request
            </DialogTitle>
            <DialogDescription>
              Submit an expense request for {entityName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {/* Expense Type */}
            <div className="space-y-2">
              <Label className="font-medium">Expense Type *</Label>
              <Select value={expenseType} onValueChange={setExpenseType}>
                <SelectTrigger data-testid="expense-type-select">
                  <SelectValue placeholder="Select expense type" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Description */}
            <div className="space-y-2">
              <Label className="font-medium">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide details about this expense request..."
                rows={3}
                data-testid="expense-description"
              />
            </div>
            
            {/* Amount (for non-free-trial expenses) */}
            {expenseType && expenseType !== 'free_trial' && (
              <div className="space-y-2">
                <Label className="font-medium">Amount (₹) *</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  min="0"
                  step="0.01"
                  data-testid="expense-amount"
                />
              </div>
            )}
            
            {/* Free Trial Specific Fields */}
            {expenseType === 'free_trial' && (
              <>
                {/* Free Trial Days */}
                <div className="space-y-2">
                  <Label className="font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Number of Free Trial Days *
                  </Label>
                  <Input
                    type="number"
                    value={freeTrialDays}
                    onChange={(e) => setFreeTrialDays(e.target.value)}
                    placeholder="e.g., 7"
                    min="1"
                    data-testid="free-trial-days"
                  />
                </div>
                
                {/* SKU Grid */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      SKUs for Free Trial *
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAddSkuItem}
                      data-testid="add-sku-item-btn"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add SKU
                    </Button>
                  </div>
                  
                  {skuItems.length === 0 ? (
                    <div className="text-center py-6 bg-muted/30 rounded-lg border-2 border-dashed">
                      <Package className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">Add SKUs for the free trial</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddSkuItem}
                        className="mt-2"
                      >
                        <Plus className="h-4 w-4 mr-1" /> Add First SKU
                      </Button>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">SKU</th>
                            <th className="text-left px-3 py-2 font-medium w-28">Tentative Qty</th>
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {skuItems.map((item, index) => (
                            <tr key={index}>
                              <td className="px-3 py-2">
                                <Select
                                  value={item.sku_name}
                                  onValueChange={(val) => handleSkuItemChange(index, 'sku_name', val)}
                                >
                                  <SelectTrigger className="w-full" data-testid={`sku-select-${index}`}>
                                    <SelectValue placeholder="Select SKU" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {masterSkus.map((sku) => (
                                      <SelectItem key={sku.id || sku.sku} value={sku.sku_name || sku.sku}>
                                        {sku.sku_name || sku.sku}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => handleSkuItemChange(index, 'quantity', e.target.value)}
                                  min="1"
                                  className="w-full"
                                  data-testid={`sku-quantity-${index}`}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleRemoveSkuItem(index)}
                                  className="h-8 w-8 text-red-500 hover:text-red-700"
                                  data-testid={`remove-sku-${index}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="px-3 py-2 bg-blue-50 text-xs text-blue-700">
                        Note: Budget will be auto-calculated based on SKU's Minimum Landing Price for {entityCity}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSubmit(false)}
              disabled={submitting || !expenseType}
              data-testid="save-draft-btn"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save as Draft
            </Button>
            <Button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={submitting || !expenseType}
              className="bg-primary"
              data-testid="submit-expense-btn"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
