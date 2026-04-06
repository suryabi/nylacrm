import React, { useState, useEffect, useCallback } from 'react';
import { marketingAPI } from '../utils/api';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Palette, Globe, Sparkles, X, Edit2 } from 'lucide-react';

const TABS = [
  { id: 'categories', label: 'Categories', icon: Palette },
  { id: 'platforms', label: 'Platforms', icon: Globe },
  { id: 'events', label: 'Custom Events', icon: Sparkles },
];

export default function MarketingMasters() {
  const [tab, setTab] = useState('categories');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [events, setEvents] = useState([]);
  const [newCat, setNewCat] = useState({ name: '', color: '#3B82F6' });
  const [newEvent, setNewEvent] = useState({ date: '', name: '' });
  const [editingCat, setEditingCat] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, platRes, evRes] = await Promise.all([
        marketingAPI.getCategories(), marketingAPI.getPlatforms(), marketingAPI.getEvents(),
      ]);
      setCategories(catRes.data || []);
      setPlatforms(platRes.data || []);
      setEvents(evRes.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addCategory = async () => {
    if (!newCat.name.trim()) { toast.error('Name required'); return; }
    try { await marketingAPI.createCategory(newCat); toast.success('Added'); setNewCat({ name: '', color: '#3B82F6' }); load(); }
    catch { toast.error('Failed'); }
  };
  const updateCat = async (id) => {
    if (!editingCat) return;
    try { await marketingAPI.updateCategory(id, editingCat); toast.success('Updated'); setEditingCat(null); load(); }
    catch { toast.error('Failed'); }
  };
  const deleteCat = async (id) => {
    try { await marketingAPI.deleteCategory(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
  };
  const togglePlatform = async (plat) => {
    try { await marketingAPI.updatePlatform(plat.id, { enabled: !plat.enabled }); toast.success(`${plat.name} ${plat.enabled ? 'disabled' : 'enabled'}`); load(); }
    catch { toast.error('Failed'); }
  };
  const addEvent = async () => {
    if (!newEvent.date || !newEvent.name.trim()) { toast.error('Date and name required'); return; }
    try { await marketingAPI.createEvent(newEvent); toast.success('Added'); setNewEvent({ date: '', name: '' }); load(); }
    catch { toast.error('Failed'); }
  };
  const deleteEvent = async (id) => {
    try { await marketingAPI.deleteEvent(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="marketing-masters">
      <div className="border-b border-slate-200 sticky top-0 z-40 bg-white">
        <div className="px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Marketing Masters</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage categories, platforms & events</p>
          <div className="flex gap-1 mt-4">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                  data-testid={`masters-tab-${t.id}`}><Icon size={14} /> {t.label}</button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-2xl">
        {loading ? (
          <div className="text-center py-16 text-sm text-slate-400">Loading...</div>
        ) : (
          <>
            {/* CATEGORIES */}
            {tab === 'categories' && (
              <div className="space-y-3">
                <div className="border border-slate-200 rounded-lg p-4">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2 block">Add Category</label>
                  <div className="flex gap-2 items-center">
                    <input type="text" value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))}
                      placeholder="Category name..." onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid="new-category-name" />
                    <input type="color" value={newCat.color} onChange={e => setNewCat(p => ({ ...p, color: e.target.value }))}
                      className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer" data-testid="new-category-color" />
                    <button onClick={addCategory}
                      className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg p-2 transition-colors"
                      data-testid="add-category-btn"><Plus size={18} /></button>
                  </div>
                </div>
                {categories.map(cat => (
                  <div key={cat.id} className="border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between group hover:border-slate-300 transition-all"
                    data-testid={`category-${cat.id}`}>
                    {editingCat?.id === cat.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input type="text" value={editingCat.name} onChange={e => setEditingCat(p => ({ ...p, name: e.target.value }))}
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                        <input type="color" value={editingCat.color} onChange={e => setEditingCat(p => ({ ...p, color: e.target.value }))}
                          className="w-7 h-7 rounded border border-slate-200 cursor-pointer" />
                        <button onClick={() => updateCat(cat.id)} className="text-emerald-600 hover:text-emerald-700 p-1"><Save size={15} /></button>
                        <button onClick={() => setEditingCat(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={15} /></button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: cat.color }} />
                          <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingCat({ id: cat.id, name: cat.name, color: cat.color })}
                            className="text-slate-400 hover:text-slate-600 p-1.5 rounded hover:bg-slate-50"><Edit2 size={13} /></button>
                          <button onClick={() => deleteCat(cat.id)} className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-slate-50"><Trash2 size={13} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* PLATFORMS */}
            {tab === 'platforms' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400 mb-3">Toggle platforms for post planning.</p>
                {platforms.map(plat => (
                  <div key={plat.id} className={`border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between transition-all ${!plat.enabled ? 'opacity-50' : ''}`}
                    data-testid={`platform-master-${plat.key}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: plat.color || '#888' }}>{plat.name?.[0]}</div>
                      <span className="text-sm font-medium text-slate-700">{plat.name}</span>
                    </div>
                    <button onClick={() => togglePlatform(plat)}
                      className={`w-10 h-5.5 rounded-full relative transition-all ${plat.enabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                      style={{ height: '22px' }}
                      data-testid={`toggle-${plat.key}`}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-[3px] transition-all shadow-sm ${plat.enabled ? 'left-[22px]' : 'left-[3px]'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* EVENTS */}
            {tab === 'events' && (
              <div className="space-y-4">
                <div className="border border-slate-200 rounded-lg p-4">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2 block">Add Custom Event</label>
                  <div className="flex gap-2 items-center">
                    <input type="text" value={newEvent.date} onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                      placeholder="MM-DD" maxLength={5}
                      className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid="new-event-date" />
                    <input type="text" value={newEvent.name} onChange={e => setNewEvent(p => ({ ...p, name: e.target.value }))}
                      placeholder="Event name..." onKeyDown={e => { if (e.key === 'Enter') addEvent(); }}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid="new-event-name" />
                    <button onClick={addEvent} className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg p-2 transition-colors" data-testid="add-event-btn"><Plus size={18} /></button>
                  </div>
                </div>

                {events.filter(e => e.type === 'custom').map(ev => (
                  <div key={ev.id} className="border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between group hover:border-slate-300 transition-all"
                    data-testid={`event-${ev.id}`}>
                    <div className="flex items-center gap-3">
                      <span className="bg-violet-50 text-violet-600 rounded px-2 py-0.5 text-xs font-medium">{ev.date}</span>
                      <span className="text-sm font-medium text-slate-700">{ev.name}</span>
                    </div>
                    <button onClick={() => deleteEvent(ev.id)} className="text-slate-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={13} /></button>
                  </div>
                ))}
                {events.filter(e => e.type === 'custom').length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-8">No custom events yet</p>
                )}

                <div className="mt-6">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-3">Built-in Events</h3>
                  <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                    {events.filter(e => e.type !== 'custom').map((ev, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2">
                        <Sparkles size={10} className={ev.type === 'indian' ? 'text-orange-400' : 'text-sky-400'} />
                        <span className="text-xs text-slate-400 font-medium w-12">{ev.date}</span>
                        <span className="text-sm text-slate-600">{ev.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
