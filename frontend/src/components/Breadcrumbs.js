import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export default function Breadcrumbs({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <nav className="flex items-center gap-1 text-xs text-slate-400 mb-3" data-testid="breadcrumbs">
      <Link to="/" className="hover:text-slate-600 transition-colors"><Home size={12} /></Link>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          <ChevronRight size={11} className="text-slate-300" />
          {item.href && i < items.length - 1 ? (
            <Link to={item.href} className="hover:text-slate-600 transition-colors">{item.label}</Link>
          ) : (
            <span className="text-slate-600 font-medium">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
