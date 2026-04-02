import React, { useState, useEffect, useCallback } from 'react';
import { marketingAPI } from '../utils/api';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Palette, Globe, Sparkles, X, Edit2 } from 'lucide-react';

const SECTION_TABS = [
  { id: 'categories', label: 'Post Categories', icon: Palette },
  { id: 'platforms', label: 'Platforms', icon: Globe },
  { id: 'events', label: 'Custom Events', icon: Sparkles },
];

export default function MarketingMasters() {
  const [tab, setTab] = useState('categories');
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [events, setEvents] = useState([]);

  // New item forms
  const [newCat, setNewCat] = useState({ name: '', color: '#FF6B6B' });
  const [newEvent, setNewEvent] = useState({ date: '', name: '' });
  const [editingCat, setEditingCat] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, platRes, evRes] = await Promise.all([
        marketingAPI.getCategories(),
        marketingAPI.getPlatforms(),
        marketingAPI.getEvents(),
      ]);
      setCategories(catRes.data || []);
      setPlatforms(platRes.data || []);
      setEvents(evRes.data || []);
    } catch {
      toast.error('Failed to load master data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Categories
  const addCategory = async () => {
    if (!newCat.name.trim()) { toast.error('Name required'); return; }
    try {
      await marketingAPI.createCategory(newCat);
      toast.success('Category added');
      setNewCat({ name: '', color: '#FF6B6B' });
      load();
    } catch { toast.error('Failed to add category'); }
  };

  const updateCat = async (id) => {
    if (!editingCat) return;
    try {
      await marketingAPI.updateCategory(id, editingCat);
      toast.success('Category updated');
      setEditingCat(null);
      load();
    } catch { toast.error('Failed to update'); }
  };

  const deleteCat = async (id) => {
    try {
      await marketingAPI.deleteCategory(id);
      toast.success('Category deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  // Platforms
  const togglePlatform = async (plat) => {
    try {
      await marketingAPI.updatePlatform(plat.id, { enabled: !plat.enabled });
      toast.success(`${plat.name} ${plat.enabled ? 'disabled' : 'enabled'}`);
      load();
    } catch { toast.error('Failed to update platform'); }
  };

  // Events
  const addEvent = async () => {
    if (!newEvent.date || !newEvent.name.trim()) { toast.error('Date and name required'); return; }
    try {
      await marketingAPI.createEvent(newEvent);
      toast.success('Event added');
      setNewEvent({ date: '', name: '' });
      load();
    } catch { toast.error('Failed to add event'); }
  };

  const deleteEvent = async (id) => {
    try {
      await marketingAPI.deleteEvent(id);
      toast.success('Event deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F6', fontFamily: "'Manrope', sans-serif" }} data-testid="marketing-masters">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#1C1C1C] sticky top-0 z-40">
        <div className="px-6 lg:px-10 py-5">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1C1C1C]" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Marketing Masters
          </h1>
          <p className="text-sm font-medium text-[#4B5563] mt-1">Manage categories, platforms & custom events</p>

          {/* Tabs */}
          <div className="flex gap-2 mt-5">
            {SECTION_TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 border-2 border-[#1C1C1C] rounded-lg text-sm font-bold transition-all ${tab === t.id ? 'bg-[#1C1C1C] text-white shadow-[2px_2px_0px_#1C1C1C]' : 'bg-white text-[#1C1C1C] hover:bg-[#FAF9F6] shadow-[2px_2px_0px_#1C1C1C]'}`}
                  data-testid={`masters-tab-${t.id}`}>
                  <Icon size={16} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-10 py-6 max-w-3xl">
        {loading ? (
          <div className="text-center py-20 text-[#4B5563] font-medium">Loading...</div>
        ) : (
          <>
            {/* === CATEGORIES === */}
            {tab === 'categories' && (
              <div className="space-y-4">
                {/* Add new */}
                <div className="bg-white border-2 border-[#1C1C1C] rounded-xl shadow-[4px_4px_0px_#1C1C1C] p-5">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#4B5563] mb-3">Add Category</h3>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <input type="text" value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))}
                        placeholder="Category name..."
                        className="w-full bg-white border-2 border-[#1C1C1C] rounded-lg px-4 py-2.5 font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:outline-none"
                        data-testid="new-category-name"
                        onKeyDown={e => { if (e.key === 'Enter') addCategory(); }} />
                    </div>
                    <input type="color" value={newCat.color} onChange={e => setNewCat(p => ({ ...p, color: e.target.value }))}
                      className="w-12 h-11 rounded-lg border-2 border-[#1C1C1C] cursor-pointer" data-testid="new-category-color" />
                    <button onClick={addCategory}
                      className="bg-[#FF6B6B] text-white border-2 border-[#1C1C1C] shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all font-bold px-5 py-2.5 rounded-lg"
                      data-testid="add-category-btn">
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {/* List */}
                <div className="space-y-2">
                  {categories.map(cat => (
                    <div key={cat.id} className="bg-white border-2 border-[#1C1C1C] rounded-xl shadow-[2px_2px_0px_#1C1C1C] p-4 flex items-center justify-between group hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all"
                      data-testid={`category-${cat.id}`}>
                      {editingCat?.id === cat.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input type="text" value={editingCat.name} onChange={e => setEditingCat(p => ({ ...p, name: e.target.value }))}
                            className="flex-1 bg-white border-2 border-[#1C1C1C] rounded-lg px-3 py-1.5 font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:outline-none text-sm" />
                          <input type="color" value={editingCat.color} onChange={e => setEditingCat(p => ({ ...p, color: e.target.value }))}
                            className="w-8 h-8 rounded border-2 border-[#1C1C1C] cursor-pointer" />
                          <button onClick={() => updateCat(cat.id)} className="text-green-600 hover:text-green-800 p-1"><Save size={16} /></button>
                          <button onClick={() => setEditingCat(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} /></button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full border-2 border-[#1C1C1C]" style={{ backgroundColor: cat.color }} />
                            <span className="font-bold text-[#1C1C1C]">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditingCat({ id: cat.id, name: cat.name, color: cat.color })}
                              className="text-slate-400 hover:text-[#1C1C1C] p-1"><Edit2 size={14} /></button>
                            <button onClick={() => deleteCat(cat.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* === PLATFORMS === */}
            {tab === 'platforms' && (
              <div className="space-y-2">
                <p className="text-sm text-[#4B5563] mb-4 font-medium">Toggle platforms on/off for your marketing posts.</p>
                {platforms.map(plat => (
                  <div key={plat.id}
                    className={`bg-white border-2 border-[#1C1C1C] rounded-xl shadow-[2px_2px_0px_#1C1C1C] p-4 flex items-center justify-between hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all ${!plat.enabled ? 'opacity-50' : ''}`}
                    data-testid={`platform-master-${plat.key}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: plat.color || '#888' }}>
                        {plat.name?.[0]}
                      </div>
                      <span className="font-bold text-[#1C1C1C]">{plat.name}</span>
                    </div>
                    <button onClick={() => togglePlatform(plat)}
                      className={`w-12 h-7 rounded-full border-2 border-[#1C1C1C] relative transition-all ${plat.enabled ? 'bg-[#A8E6CF]' : 'bg-[#E2E8F0]'}`}
                      data-testid={`toggle-${plat.key}`}>
                      <div className={`w-5 h-5 bg-white border-2 border-[#1C1C1C] rounded-full absolute top-0.5 transition-all ${plat.enabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* === CUSTOM EVENTS === */}
            {tab === 'events' && (
              <div className="space-y-4">
                <div className="bg-white border-2 border-[#1C1C1C] rounded-xl shadow-[4px_4px_0px_#1C1C1C] p-5">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#4B5563] mb-3">Add Custom Event</h3>
                  <div className="flex gap-3 items-end">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] mb-1 block">Date (MM-DD)</label>
                      <input type="text" value={newEvent.date} onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                        placeholder="03-22" maxLength={5}
                        className="w-28 bg-white border-2 border-[#1C1C1C] rounded-lg px-3 py-2.5 font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:outline-none"
                        data-testid="new-event-date" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] mb-1 block">Event Name</label>
                      <input type="text" value={newEvent.name} onChange={e => setNewEvent(p => ({ ...p, name: e.target.value }))}
                        placeholder="Company Anniversary..."
                        className="w-full bg-white border-2 border-[#1C1C1C] rounded-lg px-4 py-2.5 font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:outline-none"
                        data-testid="new-event-name"
                        onKeyDown={e => { if (e.key === 'Enter') addEvent(); }} />
                    </div>
                    <button onClick={addEvent}
                      className="bg-[#FDE74C] text-[#1C1C1C] border-2 border-[#1C1C1C] shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all font-bold px-5 py-2.5 rounded-lg"
                      data-testid="add-event-btn">
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {/* Custom events list */}
                <div className="space-y-2">
                  {events.filter(e => e.type === 'custom').map(ev => (
                    <div key={ev.id}
                      className="bg-white border-2 border-[#1C1C1C] rounded-xl shadow-[2px_2px_0px_#1C1C1C] p-4 flex items-center justify-between group hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all"
                      data-testid={`event-${ev.id}`}>
                      <div className="flex items-center gap-3">
                        <span className="bg-purple-100 text-purple-700 border-2 border-[#1C1C1C] rounded-lg px-2 py-1 text-xs font-bold">{ev.date}</span>
                        <span className="font-bold text-[#1C1C1C]">{ev.name}</span>
                      </div>
                      <button onClick={() => deleteEvent(ev.id)}
                        className="text-slate-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {events.filter(e => e.type === 'custom').length === 0 && (
                    <p className="text-center text-[#4B5563] py-8 font-medium">No custom events yet. Add one above.</p>
                  )}
                </div>

                {/* Auto events reference */}
                <div className="mt-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#4B5563] mb-3">Auto Events (Built-in)</h3>
                  <div className="bg-white border-2 border-[#1C1C1C] rounded-xl shadow-[2px_2px_0px_#1C1C1C] overflow-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#1C1C1C]/20">
                      {events.filter(e => e.type !== 'custom').map((ev, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1C1C1C]/10 last:border-b-0">
                          <Sparkles size={12} className={ev.type === 'indian' ? 'text-orange-500' : 'text-sky-500'} />
                          <span className="text-xs font-bold text-[#4B5563] w-12">{ev.date}</span>
                          <span className="text-sm font-medium text-[#1C1C1C]">{ev.name}</span>
                        </div>
                      ))}
                    </div>
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
