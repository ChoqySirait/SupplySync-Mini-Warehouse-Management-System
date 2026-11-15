export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF';

export interface User {
  user_id: number;
  username: string;
  full_name?: string;
  email: string;
  role: UserRole;
  facility_id: number;
  facility_name?: string;
  is_active: number | boolean;
  created_at?: string;
  last_login?: string;
}

export interface Facility {
  facility_id: number;
  facility_code: string;
  facility_name: string;
  address?: string;
  city?: string;
  contact_number?: string;
  is_active: number | boolean;
}

export interface Category {
  category_id: number;
  category_name: string;
  description?: string;
  product_count?: number;
  created_at?: string;
}

export interface Supplier {
  supplier_id: number;
  supplier_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  lead_time_days: number;
  is_active: number | boolean;
  created_at?: string;
}

export interface Location {
  location_id: number;
  facility_id: number;
  facility_name?: string;
  zone: string;
  rack: string;
  tier: string;
  bin: string;
  barcode: string;
  capacity?: number;
  is_active: number | boolean;
}

export interface InventoryBatch {
  batch_id: number;
  batch_code: string;
  product_id: string;
  product_name?: string;
  facility_id: number;
  facility_name?: string;
  location_id?: number;
  location_code?: string;
  initial_quantity: number;
  quantity: number;
  received_date: string;
  expired_date: string;
  notes?: string;
  status?: string;
  days_to_expiry?: number;
}

export interface Product {
  product_id: string;
  product_name: string;
  category_id?: number;
  category_name?: string;
  unit: string;
  min_stock: number;
  cost_price: number;
  sale_price: number;
  is_active: number | boolean;
  total_stock: number;
  facility_stock?: number;
  batches?: InventoryBatch[];
}

export interface StockTransaction {
  transaction_id: number;
  reference_no: string;
  product_id: string;
  product_name?: string;
  facility_id: number;
  facility_name?: string;
  user_id: number;
  username?: string;
  transaction_type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'DISPOSAL';
  quantity: number;
  notes?: string;
  created_at: string;
  items?: Array<{
    batch_id: number;
    batch_code: string;
    quantity: number;
  }>;
}

export interface StockTransfer {
  transfer_id: number;
  transfer_number: string;
  source_facility_id: number;
  source_facility_name?: string;
  dest_facility_id: number;
  dest_facility_name?: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  created_by?: number;
  sender_name?: string;
  received_by?: number;
  receiver_name?: string;
  created_at: string;
  received_at?: string;
  items?: Array<{
    item_id: number;
    product_id: string;
    product_name?: string;
    batch_id?: number;
    batch_code?: string;
    quantity_sent: number;
    quantity_received: number;
    expired_date?: string;
  }>;
}

export interface PurchaseOrder {
  po_id: number;
  po_number: string;
  supplier_id: number;
  supplier_name?: string;
  facility_id: number;
  facility_name?: string;
  status: 'DRAFT' | 'APPROVED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  order_date: string;
  expected_delivery?: string;
  total_amount: number;
  notes?: string;
  items?: Array<{
    po_item_id: number;
    product_id: string;
    product_name?: string;
    quantity: number;
    quantity_received: number;
    unit_price: number;
    subtotal: number;
  }>;
}

export interface SalesOrder {
  so_id: number;
  so_number: string;
  customer_name: string;
  facility_id: number;
  facility_name?: string;
  status: 'DRAFT' | 'CONFIRMED' | 'ALLOCATED' | 'SHIPPED' | 'CANCELLED';
  order_date: string;
  total_amount: number;
  notes?: string;
  items?: Array<{
    so_item_id: number;
    product_id: string;
    product_name?: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

export interface StockOpname {
  opname_id: number;
  opname_number: string;
  product_id: string;
  product_name?: string;
  facility_id: number;
  facility_name?: string;
  system_stock: number;
  physical_stock: number;
  difference: number;
  reason: string;
  status: string;
  performed_by: number;
  performer_name?: string;
  created_at: string;
}

export interface DashboardMetrics {
  total_skus: number;
  total_units: number;
  total_inventory_valuation: number;
  freshness_score: number;
  low_stock_count: number;
  expired_batches_count: number;
  near_expiry_count: number;
  pending_transfers: number;
  pending_pos: number;
  pending_sos: number;
  fast_moving_products: Array<{
    product_id: string;
    product_name: string;
    total_out: number;
  }>;
  recent_transactions: StockTransaction[];
  aging_breakdown?: {
    healthy: number;
    warning: number;
    critical: number;
    expired: number;
  };
}

export interface StockCardEntry {
  transaction_id: number;
  reference_no: string;
  transaction_type: string;
  facility_id: number;
  facility_name?: string;
  username?: string;
  date: string;
  in_qty: number;
  out_qty: number;
  running_balance: number;
  notes?: string;
}

export interface DatabaseBackup {
  filename: string;
  size_kb: number;
  created_at: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}
