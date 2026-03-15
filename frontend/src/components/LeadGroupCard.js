import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
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
  Loader2, GitBranch, Users, Search, ExternalLink, Maximize2
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
  const [selectedLeadsToLink, setSelectedLeadsToLink] = useState([]);
  
  // Pop-out modal state
  const [showModal, setShowModal] = useState(false);

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
        params: { search: searchQuery, page_size: 15 }
      });
      // Filter out current lead and already linked leads
      const linkedIds = [
        leadId,
        groupData.parent_lead?.id,
        ...groupData.child_leads.map(l => l.id),
        ...groupData.peer_leads.map(l => l.id)
      ].filter(Boolean);
      
      const filtered = (res.data.data || res.data).filter(l => !linkedIds.includes(l.id));
      setSearchResults(filtered.slice(0, 10));
    } catch (err) {
      toast.error('Failed to search leads');
    } finally {
      setSearching(false);
    }
  };

  const toggleLeadSelection = (leadToToggle) => {
    setSelectedLeadsToLink(prev => {
      const isSelected = prev.some(l => l.id === leadToToggle.id);
      if (isSelected) {
        return prev.filter(l => l.id !== leadToToggle.id);
      } else {
        // For "child" link type (select parent), only allow single selection
        if (linkType === 'child') {
          return [leadToToggle];
        }
        return [...prev, leadToToggle];
      }
    });
  };

  const handleLinkSelected = async () => {
    if (selectedLeadsToLink.length === 0) return;
    
    setLinking(true);
    let successCount = 0;
    
    try {
      for (const targetLead of selectedLeadsToLink) {
        try {
          await axios.post(`${API}/api/leads/${leadId}/link`, {
            target_lead_id: targetLead.id,
            link_type: linkType
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to link ${targetLead.company}:`, err);
        }
      }
      
      if (successCount > 0) {
        toast.success(`Linked ${successCount} lead${successCount > 1 ? 's' : ''} successfully`);
      }
      
      setShowLinkDialog(false);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedLeadsToLink([]);
      fetchGroupData();
    } catch (err) {
      toast.error('Failed to link leads');
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

  // Linked leads list component - used in both card and modal
  const LinkedLeadsList = ({ inModal = false }) => (
    <div className={`space-y-4 ${inModal ? '' : 'pt-3 border-t'}`}>
      {/* Parent Lead */}
      {groupData.parent_lead && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
            <GitBranch className="h-4 w-4" />
            Corporate / Parent
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
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
              className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => handleUnlink(groupData.parent_lead.id, groupData.parent_lead.company)}
            >
              <X className="h-4 w-4" />
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
          <div className="space-y-2">
            {groupData.child_leads.map(child => (
              <div key={child.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
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
                  className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleUnlink(child.id, child.company)}
                >
                  <X className="h-4 w-4" />
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
          <div className="space-y-2">
            {groupData.peer_leads.map(peer => (
              <div key={peer.id} className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
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
                  className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleUnlink(peer.id, peer.company)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No links when expanded */}
      {totalLinked === 0 && (
        <div className="text-center py-6">
          <Link2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground mb-3">No linked leads yet</p>
          <p className="text-xs text-muted-foreground mb-3">Link leads owned by the same person or franchise locations</p>
          <Button
            size="lg"
            className="h-11 w-full"
            onClick={() => setShowLinkDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> Link a Lead
          </Button>
        </div>
      )}

      {/* Add Link Button when there are existing links */}
      {totalLinked > 0 && (
        <Button
          size="lg"
          className="w-full h-11"
          variant="outline"
          onClick={() => setShowLinkDialog(true)}
        >
          <Plus className="h-4 w-4 mr-2" /> Link More Leads
        </Button>
      )}
    </div>
  );

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
                title="Link Leads"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowModal(true)}
                title="Expand"
              >
                <Maximize2 className="h-4 w-4" />
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
          {expanded && <LinkedLeadsList />}
        </div>
      </Card>

      {/* Pop-out Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-violet-500" />
              Lead Group - {leadCompany}
              {totalLinked > 0 && (
                <Badge variant="secondary">{totalLinked} linked</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <LinkedLeadsList inModal={true} />
        </DialogContent>
      </Dialog>

      {/* Link Dialog with Multi-Select */}
      <Dialog open={showLinkDialog} onOpenChange={(open) => {
        setShowLinkDialog(open);
        if (!open) {
          setSelectedLeadsToLink([]);
          setSearchResults([]);
          setSearchQuery('');
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-violet-500" />
              Link Leads to {leadCompany}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Link Type Selection */}
            <div className="space-y-2">
              <Label>Relationship Type</Label>
              <Select value={linkType} onValueChange={(value) => {
                setLinkType(value);
                // Clear selections when switching to single-select mode (child)
                if (value === 'child' && selectedLeadsToLink.length > 1) {
                  setSelectedLeadsToLink([]);
                }
              }}>
                <SelectTrigger data-testid="link-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peer">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-violet-500" />
                      <div>
                        <span className="font-medium">Select Peers</span>
                        <span className="text-xs text-muted-foreground ml-2">Same owner, different outlets</span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="parent">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-blue-500" />
                      <div>
                        <span className="font-medium">{leadCompany}</span>
                        <span className="text-xs text-muted-foreground ml-2">Select branches for this outlet</span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="child">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-green-500" />
                      <div>
                        <span className="font-medium">{leadCompany}</span>
                        <span className="text-xs text-muted-foreground ml-2">Select parent for this outlet</span>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {linkType === 'child' && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span className="inline-block w-1 h-1 rounded-full bg-amber-500"></span>
                  Only one parent can be selected
                </p>
              )}
            </div>

            {/* Search */}
            <div className="space-y-2">
              <Label>Search Leads</Label>
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

            {/* Selected Leads */}
            {selectedLeadsToLink.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-violet-600 font-semibold">
                  Selected ({selectedLeadsToLink.length})
                </Label>
                <div className="flex flex-wrap gap-2">
                  {selectedLeadsToLink.map(lead => (
                    <Badge 
                      key={lead.id} 
                      className="bg-violet-100 text-violet-700 cursor-pointer hover:bg-violet-200"
                      onClick={() => toggleLeadSelection(lead)}
                    >
                      {lead.company}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Search Results with Multi-Select */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Select leads to link:</Label>
                <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {searchResults.map(result => {
                    const isSelected = selectedLeadsToLink.some(l => l.id === result.id);
                    return (
                      <div
                        key={result.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-violet-100 border border-violet-300' 
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                        onClick={() => toggleLeadSelection(result)}
                      >
                        <Checkbox 
                          checked={isSelected}
                          className="pointer-events-none"
                        />
                        <div className="flex-1">
                          <span className="font-medium">{result.company}</span>
                          {result.city && (
                            <span className="text-xs text-muted-foreground ml-2">({result.city})</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No matching leads found
              </p>
            )}
          </div>

          <DialogFooter className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleLinkSelected} 
              disabled={linking || selectedLeadsToLink.length === 0}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {linking ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Linking...</>
              ) : (
                <><Link2 className="h-4 w-4 mr-2" /> Link {selectedLeadsToLink.length > 0 ? `(${selectedLeadsToLink.length})` : ''}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
