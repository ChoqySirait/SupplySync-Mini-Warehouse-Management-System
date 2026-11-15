import {
  ApiResponse,
  Category,
  DashboardMetrics,
  DatabaseBackup,
  Facility,
  InventoryBatch,
  Location,
  Product,
  PurchaseOrder,
  SalesOrder,
  StockCardEntry,
  StockOpname,
  StockTransaction,
  StockTransfer,
  Supplier,
  User,
} from '../types';

const BASE_URL = '/api';

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('ss_token');
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Terjadi kesalahan sistem');
    }

    return data;
  }

  // --- AUTH ---
  async login(credentials: { username?: string; email?: string; password: string }) {
    const res = await this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    const token = (res as any).token || res.data?.token;
    const user = (res as any).user || res.data?.user;
    if (token && user) {
      localStorage.setItem('ss_token', token);
      localStorage.setItem('ss_user', JSON.stringify(user));
      return { token, user };
    }
    return res.data;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
    }
  }

  async getMe() {
    return this.request<User>('/auth/me');
  }

  async changePassword(passwords: { currentPassword: string; newPassword: string }) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(passwords),
    });
  }

  // --- FACILITIES ---
  async getFacilities() {
    return this.request<Facility[]>('/facilities');
  }

  // --- ANALYTICS ---
  async getDashboard(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<DashboardMetrics>(`/analytics/dashboard${query}`);
  }

  async getAgingAnalytics(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<any>(`/analytics/aging${query}`);
  }

  // --- PRODUCTS ---
  async getProducts(params?: { category_id?: number; search?: string; facility_id?: number }) {
    const query = new URLSearchParams();
    if (params?.category_id) query.append('category_id', params.category_id.toString());
    if (params?.search) query.append('search', params.search);
    if (params?.facility_id) query.append('facility_id', params.facility_id.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<Product[]>(`/products${qs}`);
  }

  async getProductById(productId: string) {
    return this.request<Product>(`/products/${productId}`);
  }

  async createProduct(product: Partial<Product>) {
    return this.request<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  }

  async updateProduct(productId: string, product: Partial<Product>) {
    return this.request<Product>(`/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(product),
    });
  }

  async getBatches(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<InventoryBatch[]>(`/products/batches${query}`);
  }

  async importProductsCsv(csvText: string) {
    return this.request('/products/import-csv', {
      method: 'POST',
      body: JSON.stringify({ csv_data: csvText }),
    });
  }

  // --- CATEGORIES ---
  async getCategories() {
    return this.request<Category[]>('/categories');
  }

  async createCategory(category: { category_name: string; description?: string }) {
    return this.request<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
  }

  async updateCategory(id: number, category: { category_name: string; description?: string }) {
    return this.request<Category>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(category),
    });
  }

  async deleteCategory(id: number) {
    return this.request(`/categories/${id}`, { method: 'DELETE' });
  }

  // --- SUPPLIERS ---
  async getSuppliers() {
    return this.request<Supplier[]>('/suppliers');
  }

  async createSupplier(supplier: Partial<Supplier>) {
    return this.request<Supplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(supplier),
    });
  }

  async updateSupplier(id: number, supplier: Partial<Supplier>) {
    return this.request<Supplier>(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(supplier),
    });
  }

  async deleteSupplier(id: number) {
    return this.request(`/suppliers/${id}`, { method: 'DELETE' });
  }

  // --- LOCATIONS ---
  async getLocations(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<Location[]>(`/locations${query}`);
  }

  async createLocation(location: Partial<Location>) {
    return this.request<Location>('/locations', {
      method: 'POST',
      body: JSON.stringify(location),
    });
  }

  async updateLocation(id: number, location: Partial<Location>) {
    return this.request<Location>(`/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(location),
    });
  }

  async deleteLocation(id: number) {
    return this.request(`/locations/${id}`, { method: 'DELETE' });
  }

  // --- USERS ---
  async getUsers(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<User[]>(`/users${query}`);
  }

  async createUser(user: Partial<User> & { password?: string }) {
    return this.request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  }

  async updateUser(id: number, user: Partial<User>) {
    return this.request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    });
  }

  async toggleUserStatus(id: number) {
    return this.request(`/users/${id}/status`, { method: 'PATCH' });
  }

  async resetUserPassword(id: number, newPassword?: string) {
    return this.request(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  }

  // --- STOCK TRANSACTIONS ---
  async stockIn(data: {
    product_id: string;
    facility_id: number;
    location_id?: number;
    quantity: number;
    expired_date: string;
    batch_code?: string;
    notes?: string;
  }) {
    return this.request('/stock/in', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async stockOutFefo(data: {
    product_id: string;
    facility_id: number;
    quantity: number;
    notes?: string;
  }) {
    return this.request<{ allocations: any[]; transaction_id: number; reference_no: string }>(
      '/stock/out',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  async stockDisposal(data: {
    product_id: string;
    batch_id: number;
    quantity: number;
    reason: string;
  }) {
    return this.request('/stock/disposal', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async stockOpname(data: {
    product_id: string;
    physical_stock: number;
    facility_id: number;
    reason: string;
  }) {
    return this.request<StockOpname>('/stock/opname', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getStockHistory(params?: { product_id?: string; facility_id?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.product_id) query.append('product_id', params.product_id);
    if (params?.facility_id) query.append('facility_id', params.facility_id.toString());
    if (params?.limit) query.append('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<StockTransaction[]>(`/stock/history${qs}`);
  }

  async getStockCard(productId: string, facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<{
      product: Product;
      beginning_balance: number;
      entries: StockCardEntry[];
      current_balance: number;
    }>(`/reports/stock-card/${productId}${query}`);
  }

  // --- TRANSFERS ---
  async getTransfers(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<StockTransfer[]>(`/transfers${query}`);
  }

  async getTransferById(id: number) {
    return this.request<StockTransfer>(`/transfers/${id}`);
  }

  async createTransfer(data: {
    source_facility_id: number;
    dest_facility_id: number;
    notes?: string;
    items: Array<{ product_id: string; quantity: number }>;
  }) {
    return this.request<StockTransfer>('/transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async receiveTransfer(
    id: number,
    data: {
      received_items: Array<{ item_id: number; quantity_received: number; location_id?: number }>;
    }
  ) {
    return this.request(`/transfers/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async cancelTransfer(id: number, reason?: string) {
    return this.request(`/transfers/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // --- ORDERS ---
  async getPurchaseOrders(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<PurchaseOrder[]>(`/orders/purchase${query}`);
  }

  async createPurchaseOrder(data: {
    supplier_id: number;
    facility_id: number;
    expected_delivery?: string;
    notes?: string;
    items: Array<{ product_id: string; quantity: number; unit_price: number }>;
  }) {
    return this.request<PurchaseOrder>('/orders/purchase', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async approvePurchaseOrder(id: number) {
    return this.request(`/orders/purchase/${id}/approve`, { method: 'POST' });
  }

  async receivePurchaseOrder(
    id: number,
    data: {
      items: Array<{
        po_item_id: number;
        quantity_received: number;
        expired_date: string;
        batch_code?: string;
        location_id?: number;
      }>;
    }
  ) {
    return this.request(`/orders/purchase/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSalesOrders(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<SalesOrder[]>(`/orders/sales${query}`);
  }

  async createSalesOrder(data: {
    customer_name: string;
    facility_id: number;
    notes?: string;
    items: Array<{ product_id: string; quantity: number; unit_price: number }>;
  }) {
    return this.request<SalesOrder>('/orders/sales', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async confirmSalesOrder(id: number) {
    return this.request(`/orders/sales/${id}/confirm`, { method: 'POST' });
  }

  async shipSalesOrder(id: number) {
    return this.request(`/orders/sales/${id}/ship`, { method: 'POST' });
  }

  // --- REPLENISHMENT ---
  async getReplenishmentAlerts(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<any[]>(`/replenishment/alerts${query}`);
  }

  async triggerReorderPo(productId: string, facilityId?: number) {
    return this.request(`/replenishment/reorder/${productId}`, {
      method: 'POST',
      body: JSON.stringify({ facility_id: facilityId }),
    });
  }

  // --- REPORTS ---
  async getInventoryValuation(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<any>(`/reports/valuation${query}`);
  }

  async getMutationsReport(params?: {
    startDate?: string;
    endDate?: string;
    facility_id?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    if (params?.facility_id) query.append('facility_id', params.facility_id.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<any>(`/reports/mutations${qs}`);
  }

  async getExpiryReport(facilityId?: number) {
    const query = facilityId ? `?facility_id=${facilityId}` : '';
    return this.request<any>(`/reports/expiry${query}`);
  }

  // --- SYSTEM & BACKUPS ---
  async getBackups() {
    return this.request<DatabaseBackup[]>('/system/backups');
  }

  async createBackup() {
    return this.request<{ filename: string }>('/system/backup', { method: 'POST' });
  }

  async restoreBackup(filename: string) {
    return this.request('/system/restore', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    });
  }

  async getIntegrity() {
    return this.request<any>('/system/integrity');
  }
}

export const api = new ApiClient();
export default api;
