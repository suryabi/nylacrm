import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  Link2, Building2, ChevronDown, ChevronUp, Plus, X, 
  Loader2, GitBranch, Users, Search, ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

export default function LeadGroupCard({ leadId, leadCompany }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [groupData, setGroupData] = useState({ parent_lead: null, child_leads: [], peer_leads: [] });
  
  // Link dialog state
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkType, setLinkType] = useState('peer');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  const fetchGroupData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/api/leads/${leadId}/group`);
      setGroupData(res.data);
    } catch (err) {
      console.error('Error fetching lead group:', err);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (leadId) {
      fetchGroupData();
    }
  }, [leadId, fetchGroupData]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || searchQuery.length < 2) return;
    
    setSearching(true);
    try {
      const res = await axios.get(`${API}/api/leads`, {
        params: { search: searchQuery, page_size: 10 }
      });
      // Filter out current lead and already linked leads
      const linkedIds = [
        leadId,
        groupData.parent_lead?.id,
        ...groupData.child_leads.map(l => l.id),
        ...groupData.peer_leads.map(l => l.id)
      ].filter(Boolean);
      
      const filtered = (res.data.data || res.data).filter(l => !linkedIds.includes(l.id));
      setSearchResults(filtered.slice(0, 5));
    } catch (err) {
      toast.error('Failed to search leads');
    } finally {
      setSearching(false);
    }
  };

  const handleLink = async (targetLeadId, targetCompany) => {
    setLinking(true);
    try {
      await axios.post(`${API}/api/leads/${leadId}/link`, {
        target_lead_id: targetLeadId,
        link_type: linkType
      });
      toast.success(`Linked with ${targetCompany}`);
      setShowLinkDialog(false);
      setSearchQuery('');
      setSearchResults([]);
      fetchGroupData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to link leads');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (targetLeadId, targetCompany) => {
    if (!window.confirm(`Remove link with ${targetCompany}?`)) return;
    
    try {
      await axios.delete(`${API}/api/leads/${leadId}/unlink/${targetLeadId}`);
      toast.success('Link removed');
      fetchGroupData();
    } catch (err) {
      toast.error('Failed to remove link');
    }
  };

  const totalLinked = (groupData.parent_lead ? 1 : 0) + groupData.child_leads.length + groupData.peer_leads.length;

  if (loading) {
    return (
      <Card className="p-4" data-testid="lead-group-card">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4" data-testid="lead-group-card">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-violet-500" />
              <span className="font-semibold">Lead Group</span>
              {totalLinked > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {totalLinked} linked
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowLinkDialog(true)}
                title="Link Lead"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Summary when collapsed */}
          {!expanded && totalLinked > 0 && (
            <div className="flex flex-wrap gap-2">
              {groupData.parent_lead && (
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer" onClick={() => navigate(`/leads/${groupData.parent_lead.id}`)}>
                  <GitBranch className="h-3 w-3 mr-1" />
                  Parent: {groupData.parent_lead.company}
                </Badge>
              )}
              {groupData.child_leads.length > 0 && (
                <Badge className="bg-green-100 text-green-700">
                  <Building2 className="h-3 w-3 mr-1" />
                  {groupData.child_leads.length} branch{groupData.child_leads.length > 1 ? 'es' : ''}
                </Badge>
              )}
              {groupData.peer_leads.length > 0 && (
                <Badge className="bg-violet-100 text-violet-700">
                  <Users className="h-3 w-3 mr-1" />
                  {groupData.peer_leads.length} peer{groupData.peer_leads.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}

          {/* No links state */}
          {totalLinked === 0 && !expanded && (
            <p className="text-sm text-muted-foreground">No linked leads</p>
          )}

          {/* Expanded Content */}
          {expanded && (
            <div className="pt-3 border-t space-y-4">
              {/* Parent Lead */}
              {groupData.parent_lead && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                    <GitBranch className="h-4 w-4" />
                    Corporate / Parent
                  </div>
                  <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div 
                      className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/leads/${groupData.parent_lead.id}`)}
                    >
                      <Building2 className="h-4 w-4" />
                      <span className="font-medium">{groupData.parent_lead.company}</span>
                      {groupData.parent_lead.city && (
                        <span className="text-xs text-muted-foreground">({groupData.parent_lead.city})</span>
                      )}
                      <ExternalLink className="h-3 w-3" />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-500 hover:text-red-700"
                      onClick={() => handleUnlink(groupData.parent_lead.id, groupData.parent_lead.company)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Child Leads (Branches) */}
              {groupData.child_leads.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                    <Building2 className="h-4 w-4" />
                    Branches / Locations ({groupData.child_leads.length})
                  </div>
                  <div className="space-y-1">
                    {groupData.child_leads.map(child => (
                      <div key={child.id} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div 
                          className="flex items-center gap-2 cursor-pointer hover:text-green-600"
                          onClick={() => navigate(`/leads/${child.id}`)}
                        >
                          <span className="font-medium">{child.company}</span>
                          {child.city && (
                            <span className="text-xs text-muted-foreground">({child.city})</span>
                          )}
                          <ExternalLink className="h-3 w-3" />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 hover:text-red-700"
                          onClick={() => handleUnlink(child.id, child.company)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Peer Leads */}
              {groupData.peer_leads.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-violet-600">
                    <Users className="h-4 w-4" />
                    Linked Peers ({groupData.peer_leads.length})
                  </div>
                  <div className="space-y-1">
                    {groupData.peer_leads.map(peer => (
                      <div key={peer.id} className="flex items-center justify-between p-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
                        <div 
                          className="flex items-center gap-2 cursor-pointer hover:text-violet-600"
                          onClick={() => navigate(`/leads/${peer.id}`)}
                        >
                          <span className="font-medium">{peer.company}</span>
                          {peer.city && (
                            <span className="text-xs text-muted-foreground">({peer.city})</span>
                          )}
                          <ExternalLink className="h-3 w-3" />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 hover:text-red-700"
                          onClick={() => handleUnlink(peer.id, peer.company)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No links when expanded */}
              {totalLinked === 0 && (
                <div className="text-center py-4">
                  <Link2 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No linked leads yet</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setShowLinkDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Link a Lead
                  </Button>
                </div>
              )}

              {/* Add Link Button when there are existing links */}
              {totalLinked > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowLinkDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Link Another Lead
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-violet-500" />
              Link Lead to {leadCompany}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Link Type Selection */}
            <div className="space-y-2">
              <Label>Relationship Type</Label>
              <Select value={linkType} onValueChange={setLinkType}>
                <SelectTrigger data-testid="link-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peer">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-violet-500" />
                      <div>
                        <span className="font-medium">Peer Link</span>
                        <span className="text-xs text-muted-foreground ml-2">Same owner, different outlets</span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="parent">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-blue-500" />
                      <div>
                        <span className="font-medium">Set as Parent</span>
                        <span className="text-xs text-muted-foreground ml-2">Selected lead becomes a branch of this</span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="child">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-green-500" />
                      <div>
                        <span className="font-medium">Set as Branch</span>
                        <span className="text-xs text-muted-foreground ml-2">This lead becomes a branch of selected</span>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-2">
              <Label>Search Lead</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by company name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  data-testid="lead-search-input"
                />
                <Button onClick={handleSearch} disabled={searching || searchQuery.length < 2}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Select a lead to link:</Label>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {searchResults.map(result => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleLink(result.id, result.company)}
                    >
                      <div>
                        <span className="font-medium">{result.company}</span>
                        {result.city && (
                          <span className="text-xs text-muted-foreground ml-2">({result.city})</span>
                        )}
                      </div>
                      <Button size="sm" disabled={linking}>
                        {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Link'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No matching leads found
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
