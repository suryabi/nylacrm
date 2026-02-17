import React from 'react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { FileText } from 'lucide-react';

function formatCurrency(value) {
  if (!value) return '₹0';
  const num = Math.round(value);
  if (num >= 100000) {
    return '₹' + (num / 100000).toFixed(2) + 'L';
  }
  return '₹' + num.toLocaleString('en-IN');
}

export default function InvoiceSummaryCard({ invoiceData }) {
  if (!invoiceData || !invoiceData.invoice_count) {
    return null;
  }

  return (
    <Card className="p-6" data-testid="invoice-summary-card">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Invoice Summary
        </h2>
        <Badge variant="outline">{invoiceData.invoice_count} Invoices</Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-green-50 rounded-lg p-4 border border-green-100">
          <p className="text-xs text-green-600 font-medium mb-1">GROSS VALUE</p>
          <p className="text-lg font-bold text-green-700">
            {formatCurrency(invoiceData.total_gross_invoice_value)}
          </p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
          <p className="text-xs text-blue-600 font-medium mb-1">NET VALUE</p>
          <p className="text-lg font-bold text-blue-700">
            {formatCurrency(invoiceData.total_net_invoice_value)}
          </p>
        </div>
        <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
          <p className="text-xs text-amber-600 font-medium mb-1">CREDIT NOTES</p>
          <p className="text-lg font-bold text-amber-700">
            {formatCurrency(invoiceData.total_credit_note_value)}
          </p>
        </div>
      </div>
      
      {invoiceData.invoices && invoiceData.invoices.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left py-2.5 px-3 font-medium">Invoice #</th>
                <th className="text-left py-2.5 px-3 font-medium">Date</th>
                <th className="text-right py-2.5 px-3 font-medium">Gross</th>
                <th className="text-right py-2.5 px-3 font-medium">Net</th>
                <th className="text-right py-2.5 px-3 font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.invoices.map((inv, idx) => (
                <tr key={idx} className="border-t hover:bg-muted/30">
                  <td className="py-2.5 px-3 font-medium text-primary">{inv.invoice_no}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{inv.invoice_date}</td>
                  <td className="py-2.5 px-3 text-right text-green-600">{formatCurrency(inv.gross_invoice_value)}</td>
                  <td className="py-2.5 px-3 text-right text-blue-600">{formatCurrency(inv.net_invoice_value)}</td>
                  <td className="py-2.5 px-3 text-right text-amber-600">{formatCurrency(inv.credit_note_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
