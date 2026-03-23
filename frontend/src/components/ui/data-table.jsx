import React, { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Sortable Table Header Component
 */
export function SortableHeader({ label, sortKey, currentSort, onSort, className = '' }) {
  const isActive = currentSort.key === sortKey;
  const direction = isActive ? currentSort.direction : null;
  
  return (
    <th 
      className={`text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs cursor-pointer select-none hover:bg-emerald-50/30 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
      style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
    >
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        <span className="flex flex-col">
          {direction === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5 text-emerald-700" />
          ) : direction === 'desc' ? (
            <ChevronDown className="h-3.5 w-3.5 text-emerald-700" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
          )}
        </span>
      </div>
    </th>
  );
}

/**
 * Non-sortable Table Header Component
 */
export function TableHeader({ label, className = '' }) {
  return (
    <th 
      className={`text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs ${className}`}
      style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
    >
      {label}
    </th>
  );
}

/**
 * Table Row Component with alternate colors and click handler
 */
export function TableRow({ children, onClick, index, className = '', testId }) {
  return (
    <tr 
      className={`border-b border-emerald-50 transition-colors duration-200
        ${index % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'}
        ${onClick ? 'cursor-pointer hover:bg-emerald-50/60 active:scale-[0.995]' : 'hover:bg-emerald-50/30'}
        ${className}`}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </tr>
  );
}

/**
 * Table Cell Component
 */
export function TableCell({ children, className = '', align = 'left' }) {
  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
  return (
    <td className={`p-4 ${alignClass} ${className}`}>
      {children}
    </td>
  );
}

/**
 * Pagination Component
 */
export function Pagination({ 
  currentPage, 
  totalPages, 
  totalItems, 
  pageSize, 
  onPageChange, 
  onPageSizeChange,
  showPageSizeSelector = true,
  itemName = 'items'
}) {
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between p-4 border-t border-emerald-50 bg-slate-50/50">
      <div className="text-sm text-slate-600">
        Showing <span className="font-medium">{startIndex}</span> to <span className="font-medium">{endIndex}</span> of <span className="font-medium">{totalItems}</span> {itemName}
      </div>
      <div className="flex items-center gap-4">
        {showPageSizeSelector && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Rows:</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="w-[70px] h-8 rounded-lg text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(size => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="rounded-lg h-8 px-3 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  className={`w-8 h-8 p-0 rounded-lg text-sm ${
                    currentPage === pageNum 
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white' 
                      : 'hover:bg-emerald-50 text-slate-600'
                  }`}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || totalPages === 0}
            className="rounded-lg h-8 px-3 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Data Table Container Component
 */
export function DataTableContainer({ 
  title, 
  count, 
  children,
  pageSize,
  onPageSizeChange,
  actions
}) {
  return (
    <div className="bg-white rounded-xl border border-emerald-100/60 shadow-[0_2px_8px_rgba(6,95,70,0.04)] overflow-hidden">
      <div className="p-5 border-b border-emerald-50 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
          {title}
          {count !== undefined && (
            <span className="ml-2 text-sm font-normal text-slate-500">({count})</span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          {onPageSizeChange && (
            <>
              <span className="text-sm text-slate-500">Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger className="w-[80px] h-8 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {actions}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Hook for client-side sorting
 */
export function useSorting(initialKey = '', initialDirection = 'asc') {
  const [sort, setSort] = useState({ key: initialKey, direction: initialDirection });
  
  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  const sortData = (data, sortKey, getValue) => {
    if (!sort.key) return data;
    
    return [...data].sort((a, b) => {
      let aVal = getValue ? getValue(a, sort.key) : a[sort.key];
      let bVal = getValue ? getValue(b, sort.key) : b[sort.key];
      
      // Handle strings
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }
      
      // Handle nulls/undefined
      if (aVal == null) return sort.direction === 'asc' ? 1 : -1;
      if (bVal == null) return sort.direction === 'asc' ? -1 : 1;
      
      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };
  
  return { sort, handleSort, sortData };
}

/**
 * Hook for pagination
 */
export function usePagination(initialPageSize = 50) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  
  const paginateData = (data) => {
    const startIndex = (page - 1) * pageSize;
    return data.slice(startIndex, startIndex + pageSize);
  };
  
  const totalPages = (totalItems) => Math.ceil(totalItems / pageSize);
  
  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
  };
  
  return {
    page,
    setPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    paginateData,
    totalPages
  };
}
