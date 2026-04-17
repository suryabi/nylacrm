import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { DollarSign, Plus, Save, Trash2, RefreshCw, Filter, X, Check, Loader2 } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function CostCards() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [costCards, setCostCards] = useState([]);
  const [cities, setCities] = useState([]);
  const [skuOptions, setSkuOptions] = useState([]);
  const [allSkus, setAllSkus] = useState([]);
  const [cityFilter, setCityFilter] = useState('all');
  const [skuFilter, setSkuFilter] = useState('all');
  const [editedRows, setEditedRows] = useState({});
  const [newRows, setNewRows] = useState([]);
  const [allCities, setAllCities] = useState([]);

  const canEdit = user && ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head'].includes(user.role);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (cityFilter !== 'all') params.append('city', cityFilter);
      if (skuFilter !== 'all') params.append('sku_id', skuFilter);

      const [cardsRes, skuRes, locRes] = await Promise.all([
        axios.get(`${API_URL}/api/cost-cards?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/master-skus`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/master-locations/flat`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      setCostCards(cardsRes.data.cost_cards || []);

      // Master SKUs
      const skuData = skuRes.data || [];
      const skuList = Array.isArray(skuData) ? skuData : skuData.skus || [];
      const activeSkus = skuList.filter(s => s.is_active !== false);
      setAllSkus(activeSkus);
      setSkuOptions(activeSkus.map(s => ({ id: s.id, name: s.sku_name || s.sku || s.name || s.id })));

      // Master Cities
      const locData = locRes.data || {};
      const masterCities = (locData.cities || []).filter(c => c.is_active !== false).map(c => c.name).sort();
      setAllCities(masterCities);
      setCities(masterCities);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load cost cards');
    } finally {
      setLoading(false);
    }
  }, [token, cityFilter, skuFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCellEdit = (cardId, value) => {
    const numVal = parseFloat(value);
    if (value === '' || value === undefined) {
      setEditedRows(prev => ({ ...prev, [cardId]: value }));
      return;
    }
    setEditedRows(prev => ({ ...prev, [cardId]: isNaN(numVal) ? value : value }));
  };

  const addNewRow = () => {
    setNewRows(prev => [...prev, { _tempId: Date.now(), sku_id: '', city: '', cost_per_unit: '' }]);
  };

  const updateNewRow = (tempId, field, value) => {
    setNewRows(prev => prev.map(r => r._tempId === tempId ? { ...r, [field]: value } : r));
  };

  const removeNewRow = (tempId) => {
    setNewRows(prev => prev.filter(r => r._tempId !== tempId));
  };

  const handleSaveAll = async () => {
    const items = [];

    // Edited existing rows
    for (const [cardId, value] of Object.entries(editedRows)) {
      const numVal = parseFloat(value);
      if (isNaN(numVal) || numVal < 0) {
        toast.error('All cost values must be valid positive numbers');
        return;
      }
      const card = costCards.find(c => c.id === cardId);
      if (card) {
        items.push({ id: cardId, sku_id: card.sku_id, sku_name: card.sku_name, city: card.city, cost_per_unit: numVal });
      }
    }

    // New rows
    for (const row of newRows) {
      if (!row.sku_id || !row.city || !row.cost_per_unit) {
        toast.error('All new rows must have SKU, City, and Cost filled');
        return;
      }
      const numVal = parseFloat(row.cost_per_unit);
      if (isNaN(numVal) || numVal < 0) {
        toast.error('All cost values must be valid positive numbers');
        return;
      }
      const sku = allSkus.find(s => s.id === row.sku_id);
      items.push({ sku_id: row.sku_id, sku_name: sku?.sku_name || sku?.sku || row.sku_id, city: row.city, cost_per_unit: numVal });
    }

    if (items.length === 0) {
      toast.info('No changes to save');
      return;
    }

    try {
      setSaving(true);
      const res = await axios.put(`${API_URL}/api/cost-cards/bulk/save`, items, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(res.data.message || 'Saved');
      setEditedRows({});
      setNewRows([]);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cardId) => {
    try {
      await axios.delete(`${API_URL}/api/cost-cards/${cardId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Entry deleted');
      fetchData();
    } catch (err) {
      toast.error('Delete failed');
    }
  };

  const hasChanges = Object.keys(editedRows).length > 0 || newRows.length > 0;

  // Group cards by city
  const groupedByCity = {};
  costCards.forEach(c => {
    if (!groupedByCity[c.city]) groupedByCity[c.city] = [];
    groupedByCity[c.city].push(c);
  });

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6" data-testid="cost-cards-page">
      <Breadcrumbs items={[
        { label: 'Distribution' },
        { label: 'Cost Cards' },
      ]} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
              <DollarSign className="h-6 w-6 text-emerald-700" />
            </div>
            Cost Cards
          </h1>
          <p className="text-slate-500 mt-1 ml-14 text-sm">
            Master pricing per City &amp; SKU. Applied as default base price for all distributors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={addNewRow} data-testid="add-row-btn">
                <Plus className="h-4 w-4 mr-1.5" /> Add Row
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSaveAll}
                disabled={saving || !hasChanges}
                data-testid="save-all-btn"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                {saving ? 'Saving...' : 'Save Changes'}
                {hasChanges && (
                  <Badge className="ml-1.5 bg-white/20 text-white text-[10px] px-1.5">
                    {Object.keys(editedRows).length + newRows.length}
                  </Badge>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
        <Filter className="h-4 w-4 text-slate-400" />
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-[180px] h-9" data-testid="city-filter">
            <SelectValue placeholder="All Cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cities</SelectItem>
            {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={skuFilter} onValueChange={setSkuFilter}>
          <SelectTrigger className="w-[220px] h-9" data-testid="sku-filter">
            <SelectValue placeholder="All SKUs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All SKUs</SelectItem>
            {skuOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(cityFilter !== 'all' || skuFilter !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setCityFilter('all'); setSkuFilter('all'); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
        <div className="ml-auto text-xs text-slate-400">{costCards.length} entries</div>
      </div>

      {/* Grid Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cost-cards-table">
              <thead>
                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left p-3 pl-4 font-semibold w-[250px]">City</th>
                  <th className="text-left p-3 font-semibold">SKU</th>
                  <th className="text-right p-3 font-semibold w-[160px]">Cost / Unit (INR)</th>
                  <th className="text-right p-3 font-semibold w-[140px]">Last Updated</th>
                  {canEdit && <th className="text-center p-3 font-semibold w-[60px]"></th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedByCity).map(([city, cards], gi) => (
                  <React.Fragment key={city}>
                    {cards.map((card, ci) => {
                      const isEdited = editedRows[card.id] !== undefined;
                      const displayVal = isEdited ? editedRows[card.id] : card.cost_per_unit?.toFixed(2);
                      return (
                        <tr
                          key={card.id}
                          className={`border-b transition-colors ${isEdited ? 'bg-amber-50/40' : ci % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'} hover:bg-slate-50`}
                          data-testid={`cost-row-${card.id}`}
                        >
                          <td className="p-3 pl-4">
                            {ci === 0 ? (
                              <span className="font-medium text-slate-800">{city}</span>
                            ) : (
                              <span className="text-slate-300">&mdash;</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-700">{card.sku_name}</td>
                          <td className="p-3 text-right">
                            {canEdit ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={displayVal}
                                onChange={(e) => handleCellEdit(card.id, e.target.value)}
                                className={`w-28 text-right px-2 py-1.5 rounded-lg border text-sm font-mono ${isEdited ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200' : 'border-slate-200 bg-white'} focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400`}
                                data-testid={`cost-input-${card.id}`}
                              />
                            ) : (
                              <span className="font-mono font-medium text-slate-800">{Number(card.cost_per_unit).toFixed(2)}</span>
                            )}
                          </td>
                          <td className="p-3 text-right text-xs text-slate-400">
                            {card.updated_by_name && <span>{card.updated_by_name}, </span>}
                            {card.updated_at ? new Date(card.updated_at).toLocaleDateString() : '-'}
                          </td>
                          {canEdit && (
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleDelete(card.id)}
                                className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                data-testid={`delete-cost-${card.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}

                {/* New rows */}
                {newRows.map((row) => (
                  <tr key={row._tempId} className="border-b bg-emerald-50/30" data-testid={`new-row-${row._tempId}`}>
                    <td className="p-3 pl-4">
                      <Select value={row.city} onValueChange={(v) => updateNewRow(row._tempId, 'city', v)}>
                        <SelectTrigger className="h-9 w-[200px] bg-white" data-testid={`new-city-${row._tempId}`}>
                          <SelectValue placeholder="Select city" />
                        </SelectTrigger>
                        <SelectContent>
                          {allCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <Select value={row.sku_id} onValueChange={(v) => updateNewRow(row._tempId, 'sku_id', v)}>
                        <SelectTrigger className="h-9 w-full bg-white" data-testid={`new-sku-${row._tempId}`}>
                          <SelectValue placeholder="Select SKU" />
                        </SelectTrigger>
                        <SelectContent>
                          {allSkus.map(s => <SelectItem key={s.id} value={s.id}>{s.sku_name || s.sku}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.cost_per_unit}
                        onChange={(e) => updateNewRow(row._tempId, 'cost_per_unit', e.target.value)}
                        placeholder="0.00"
                        className="w-28 text-right px-2 py-1.5 rounded-lg border border-emerald-300 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        data-testid={`new-cost-${row._tempId}`}
                      />
                    </td>
                    <td className="p-3 text-right text-xs text-emerald-500">New</td>
                    {canEdit && (
                      <td className="p-3 text-center">
                        <button onClick={() => removeNewRow(row._tempId)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {costCards.length === 0 && newRows.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} className="text-center py-16 text-slate-400">
                      <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No cost cards defined</p>
                      <p className="text-xs mt-1">Click "Add Row" to create your first cost card entry</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
