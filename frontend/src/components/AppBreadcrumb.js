import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb';

/**
 * AppBreadcrumb Component
 * 
 * Displays navigation breadcrumbs based on actual user navigation path.
 * Uses NavigationContext to track the trail.
 * 
 * @param {Object} props
 * @param {string} props.currentLabel - Override label for current page (e.g., lead name)
 */
const AppBreadcrumb = ({ currentLabel }) => {
  const location = useLocation();
  const { getBreadcrumbs, navigateTo, updateCurrentLabel } = useNavigation();
  
  // Update current label if provided - must be before any conditional returns
  useEffect(() => {
    if (currentLabel) {
      updateCurrentLabel(currentLabel);
    }
  }, [currentLabel, updateCurrentLabel]);

  // Don't show breadcrumbs on home, login, or splash pages
  const isExcludedPage = ['/', '/login', '/home', '/auth/callback'].includes(location.pathname);
  
  const breadcrumbs = getBreadcrumbs();
  const shouldHide = isExcludedPage || breadcrumbs.length <= 1;

  const handleClick = (e, item) => {
    e.preventDefault();
    if (!item.isCurrent) {
      const url = item.search ? `${item.path}${item.search}` : item.path;
      navigateTo(url, { fromSidebar: item.isHome });
    }
  };

  if (shouldHide) {
    return null;
  }

  return (
    <Breadcrumb className="mb-4" data-testid="app-breadcrumb">
      <BreadcrumbList>
        {breadcrumbs.map((item, index) => (
          <React.Fragment key={`${item.path}-${index}`}>
            {index > 0 && (
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </BreadcrumbSeparator>
            )}
            <BreadcrumbItem>
              {item.isCurrent ? (
                <BreadcrumbPage className="font-medium max-w-[200px] truncate">
                  {item.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link 
                    to={item.search ? `${item.path}${item.search}` : item.path}
                    onClick={(e) => handleClick(e, item)}
                    className="hover:text-primary transition-colors flex items-center gap-1"
                  >
                    {item.isHome && <Home className="h-4 w-4" />}
                    {!item.isHome && <span className="max-w-[150px] truncate">{item.label}</span>}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default AppBreadcrumb;
