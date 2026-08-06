// Industry-specific terminology presets for the 5 core concepts.
// Keys must match the ALLOWED_TERM_KEYS on the backend and DEFAULT_TERMINOLOGY.
export const TERMINOLOGY_PRESETS = {
  'Food & Beverage': {
    unit: { singular: 'Bottle', plural: 'Bottles' },
    package: { singular: 'Crate', plural: 'Crates' },
    distributor: { singular: 'Distributor', plural: 'Distributors' },
    factory: { singular: 'Factory', plural: 'Factories' },
    sku: { singular: 'SKU', plural: 'SKUs' },
  },
  'FMCG / Consumer Goods': {
    unit: { singular: 'Unit', plural: 'Units' },
    package: { singular: 'Case', plural: 'Cases' },
    distributor: { singular: 'Distributor', plural: 'Distributors' },
    factory: { singular: 'Plant', plural: 'Plants' },
    sku: { singular: 'SKU', plural: 'SKUs' },
  },
  'Pharmaceuticals': {
    unit: { singular: 'Strip', plural: 'Strips' },
    package: { singular: 'Carton', plural: 'Cartons' },
    distributor: { singular: 'Stockist', plural: 'Stockists' },
    factory: { singular: 'Plant', plural: 'Plants' },
    sku: { singular: 'Product', plural: 'Products' },
  },
  'Apparel': {
    unit: { singular: 'Piece', plural: 'Pieces' },
    package: { singular: 'Carton', plural: 'Cartons' },
    distributor: { singular: 'Dealer', plural: 'Dealers' },
    factory: { singular: 'Workshop', plural: 'Workshops' },
    sku: { singular: 'Style', plural: 'Styles' },
  },
  'Manufacturing': {
    unit: { singular: 'Unit', plural: 'Units' },
    package: { singular: 'Pallet', plural: 'Pallets' },
    distributor: { singular: 'Dealer', plural: 'Dealers' },
    factory: { singular: 'Plant', plural: 'Plants' },
    sku: { singular: 'Part', plural: 'Parts' },
  },
  'Wholesale & Distribution': {
    unit: { singular: 'Unit', plural: 'Units' },
    package: { singular: 'Case', plural: 'Cases' },
    distributor: { singular: 'Retailer', plural: 'Retailers' },
    factory: { singular: 'Warehouse', plural: 'Warehouses' },
    sku: { singular: 'Item', plural: 'Items' },
  },
  'Retail': {
    unit: { singular: 'Item', plural: 'Items' },
    package: { singular: 'Carton', plural: 'Cartons' },
    distributor: { singular: 'Supplier', plural: 'Suppliers' },
    factory: { singular: 'Warehouse', plural: 'Warehouses' },
    sku: { singular: 'SKU', plural: 'SKUs' },
  },
  'Agriculture': {
    unit: { singular: 'Unit', plural: 'Units' },
    package: { singular: 'Crate', plural: 'Crates' },
    distributor: { singular: 'Distributor', plural: 'Distributors' },
    factory: { singular: 'Farm', plural: 'Farms' },
    sku: { singular: 'Produce', plural: 'Produce' },
  },
  'Services': {
    unit: { singular: 'Unit', plural: 'Units' },
    package: { singular: 'Package', plural: 'Packages' },
    distributor: { singular: 'Partner', plural: 'Partners' },
    factory: { singular: 'Office', plural: 'Offices' },
    sku: { singular: 'Service', plural: 'Services' },
  },
};
