import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountsAPI } from '../utils/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Search, Building2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const accountTypeColors = {
  'Tier 1': 'bg-emerald-100 text-emerald-800',
  'Tier 2': 'bg-blue-100 text-blue-800',
  'Tier 3': 'bg-gray-100 text-gray-800',
};

export default function AccountsList() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        pageSize,
        search: searchTerm || undefined,
        account_type: accountTypeFilter !== 'all' ? accountTypeFilter : undefined,
      };
      
      const response = await accountsAPI.getAll(params);
      setAccounts(response.data.data || []);
      setTotalCount(response.data.total || 0);
      setTotalPages(response.data.total_pages || 1);
    } catch (error) {
      toast.error('Failed to load accounts');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, accountTypeFilter]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchAccounts();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [fetchAccounts]);

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleFilterChange = (value) => {
    setAccountTypeFilter(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6" data-testid="accounts-list-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Accounts</h1>
          <p className="text-muted-foreground mt-1">
            {totalCount} account{totalCount !== 1 ? 's' : ''} total
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
              data-testid="search-accounts-input"
            />
          </div>
          <Select value={accountTypeFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="account-type-filter">
              <SelectValue placeholder="Account Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Tier 1">Tier 1</SelectItem>
              <SelectItem value="Tier 2">Tier 2</SelectItem>
              <SelectItem value="Tier 3">Tier 3</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Accounts Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No accounts found</p>
            <p className="text-muted-foreground mt-1">
              Convert won leads to create accounts
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="accounts-table">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium">Account ID</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Account Name</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Contact</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Location</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Outstanding</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accounts.map((account) => (
                    <tr
                      key={account.id}
                      onClick={() => navigate(`/accounts/${account.account_id}`)}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      data-testid={`account-row-${account.account_id}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-primary">{account.account_id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{account.account_name}</p>
                        {account.contact_name && (
                          <p className="text-sm text-muted-foreground">{account.contact_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {account.account_type ? (
                          <Badge className={accountTypeColors[account.account_type] || 'bg-gray-100'}>
                            {account.account_type}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {account.contact_number || <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm">{account.city}</p>
                        <p className="text-xs text-muted-foreground">{account.state}</p>
                      </td>
                      <td className="px-4 py-3">
                        {account.outstanding_balance > 0 ? (
                          <span className="text-red-600 font-medium">
                            ₹{account.outstanding_balance.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-green-600">₹0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {account.created_at && format(new Date(account.created_at), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    data-testid="prev-page-btn"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    data-testid="next-page-btn"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
