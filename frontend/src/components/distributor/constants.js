// Shared constants for Distributor components

export const API_URL = process.env.REACT_APP_BACKEND_URL;

export const PAYMENT_TERMS = [
  { value: 'advance', label: 'Advance' },
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'net_7', label: 'Net 7 Days' },
  { value: 'net_15', label: 'Net 15 Days' },
  { value: 'net_30', label: 'Net 30 Days' },
  { value: 'net_45', label: 'Net 45 Days' },
  { value: 'net_60', label: 'Net 60 Days' },
];

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
  { value: 'suspended', label: 'Suspended', color: 'bg-red-100 text-red-800' },
  { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
];

export const MARGIN_TYPES = [
  { value: 'percentage', label: 'Percentage (%)', description: 'Percentage on account invoice value' },
  { value: 'fixed_per_bottle', label: 'Fixed per Bottle (₹)', description: 'Fixed amount per bottle' },
  { value: 'fixed_per_case', label: 'Fixed per Case (₹)', description: 'Fixed amount per case/crate' },
];

// Helper functions
export function getMarginTypeLabel(type) {
  const found = MARGIN_TYPES.find(m => m.value === type);
  return found ? found.label : type;
}

export function formatMarginValue(type, value) {
  if (type === 'percentage') {
    return `${value}%`;
  }
  return `₹${value}`;
}

export function getStatusColor(status) {
  const statusConfig = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[1];
  return statusConfig.color;
}

export function getPaymentTermLabel(term) {
  const found = PAYMENT_TERMS.find(t => t.value === term);
  return found ? found.label : term;
}
