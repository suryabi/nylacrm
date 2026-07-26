import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Search, Lock } from 'lucide-react';
import { MODULE_REGISTRY } from '../../config/moduleRegistry';

// Shared enable/disable matrix used by Platform Admin (platform_modules) and
// Tenant Settings (modules). A module is ON unless explicitly set to false.
// lockedKeys: keys disabled at the platform layer (shown locked in tenant view).
export const ModuleMatrix = ({ values = {}, onToggle, lockedKeys, readOnly = false, testPrefix = 'module' }) => {
  const [search, setSearch] = useState('');
  const locked = lockedKeys || new Set();

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return MODULE_REGISTRY;
    return MODULE_REGISTRY
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) => i.label.toLowerCase().includes(q) || i.key.includes(q) || (i.description || '').toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [search]);

  const isOn = (key) => values[key] !== false;

  const setGroup = (group, enabled) => {
    if (readOnly || !onToggle) return;
    group.items.forEach((i) => {
      if (!locked.has(i.key)) onToggle(i.key, enabled);
    });
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search modules & menu items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid={`${testPrefix}-search-input`}
        />
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">No modules match "{search}"</p>
      )}

      {groups.map((group) => {
        const enabledCount = group.items.filter((i) => isOn(i.key) && !locked.has(i.key)).length;
        return (
          <Card key={group.key} data-testid={`${testPrefix}-group-${group.key}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {group.title}
                    <Badge variant="secondary" className="font-normal">
                      {enabledCount}/{group.items.length} on
                    </Badge>
                  </CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </div>
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setGroup(group, true)} data-testid={`${testPrefix}-enable-all-${group.key}`}>
                      Enable all
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setGroup(group, false)} data-testid={`${testPrefix}-disable-all-${group.key}`}>
                      Disable all
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2">
                {group.items.map((item) => {
                  const isLocked = locked.has(item.key);
                  const enabled = isOn(item.key);
                  return (
                    <div
                      key={item.key}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                        isLocked ? 'opacity-60 bg-muted/40' : 'hover:bg-muted/50'
                      }`}
                      data-testid={`${testPrefix}-row-${item.key}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          {isLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {isLocked ? 'Disabled at platform level' : item.description}
                        </p>
                      </div>
                      <Switch
                        checked={enabled && !isLocked}
                        disabled={readOnly || isLocked}
                        onCheckedChange={(checked) => onToggle && onToggle(item.key, checked)}
                        data-testid={`${testPrefix}-toggle-${item.key}`}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default ModuleMatrix;
