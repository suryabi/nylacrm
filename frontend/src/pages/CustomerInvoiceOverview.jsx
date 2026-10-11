import React from 'react';
import { Receipt } from 'lucide-react';
import { CustomerMonthlyOverview } from '../components/reports/CustomerMonthlyOverview';

export default function CustomerInvoiceOverview() {
  return <CustomerMonthlyOverview config={{
    prefix: 'cio',
    pageTestId: 'customer-invoice-overview-page',
    endpoint: '/api/reports/customer-invoice-overview',
    exportEndpoint: '/api/reports/customer-invoice-overview/export',
    exportFilename: 'customer-invoice-overview.xlsx',
    title: 'Customer Invoice Overview',
    subtitle: 'Gross invoice value per customer, month-wise',
    Icon: Receipt,
    hideZeroLabel: 'Hide customers with no invoices',
    emptyLabel: 'No customers match the current filters.',
    rowNoun: 'customers',
    mode: 'invoice',
    customerHeader: 'Customer',
    searchPlaceholder: 'Search customer, code, city',
    supportsPayments: true,
  }} />;
}