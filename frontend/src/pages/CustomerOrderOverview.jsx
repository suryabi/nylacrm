import React from 'react';
import { PackageCheck } from 'lucide-react';
import { CustomerMonthlyOverview } from '../components/reports/CustomerMonthlyOverview';

export default function CustomerOrderOverview() {
  return <CustomerMonthlyOverview config={{
    prefix: 'coo',
    pageTestId: 'customer-order-overview-page',
    endpoint: '/api/reports/customer-order-overview',
    exportEndpoint: '/api/reports/customer-order-overview/export',
    exportFilename: 'customer-order-overview.xlsx',
    title: 'Customer Order Overview',
    subtitle: 'Bottles delivered through completed Stock-Outs, month-wise',
    Icon: PackageCheck,
    hideZeroLabel: 'Hide rows with no completed orders',
    emptyLabel: 'No customers or shared-SKU groups match the current filters.',
    rowNoun: 'customers / groups',
    mode: 'orders',
    customerHeader: 'Customer / group',
    searchPlaceholder: 'Search customer, shared SKU, city',
  }} />;
}