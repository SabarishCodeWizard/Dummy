/**
 * Data access layer — port of the web app's `js/db.js` (class Database).
 *
 * Method names, collection names, document ids and write semantics are intentionally IDENTICAL to the
 * web app because both apps share one Firestore project. Differences from the web version:
 *  - modular Firebase v12 SDK instead of the compat SDK
 *  - offline reads come from Firestore's own IndexedDB cache (persistentLocalCache, see ./firebase) like the web app
 *  - the handful of places where web pages talked to `db.firestore.collection(...)` directly are now methods here
 *  - `updateSubsequentInvoices` (a `Utils` method on web) lives here to avoid a db <-> utils import cycle
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDb } from './firebase';
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
export class Database {
  initialized = false;
  firestore;
  // In-memory cache to improve loading performance
  _cache = {};
  // Promise cache to prevent duplicate simultaneous network requests
  _promises = {};
  // ------------------------------------------------------------------ init / helpers
  async init() {
    if (this.initialized) return this.firestore;
    this.firestore = getDb();
    this.initialized = true;
    return this.firestore;
  }
  async ensureInitialized() {
    if (!this.initialized) await this.init();
  }
  _checkInit() {
    if (!this.initialized) {
      // The web app threw here; pages can mount before the root init finishes, so self-heal.
      this.firestore = getDb();
      this.initialized = true;
    }
  }
  /** Drop in-memory caches (e.g. refresh button, logout). */
  invalidateAll() {
    this._cache = {};
    this._promises = {};
  }
  invalidate(...keys) {
    keys.forEach((k) => {
      this._cache[k] = null;
    });
  }
  col(name) {
    this._checkInit();
    return collection(this.firestore, name);
  }
  ref(name, id) {
    this._checkInit();
    return doc(this.firestore, name, id);
  }
  /**
   * Memory cache -> in-flight request -> Firestore (which serves its IndexedDB cache when the device is offline).
   */
  async _load(key, fetcher, opts = {}) {
    const { memory = true, onError = 'throw' } = opts;
    this._checkInit();
    if (memory && this._cache[key]) return this._cache[key];
    if (memory && this._promises[key]) return this._promises[key];
    const run = (async () => {
      try {
        const result = await fetcher();
        if (memory) this._cache[key] = result;
        return result;
      } catch (error) {
        if (onError === 'empty') {
          console.error(`[db] ${key}: read failed`, error);
          return [];
        }
        throw error;
      } finally {
        this._promises[key] = null;
      }
    })();
    if (memory) this._promises[key] = run;
    return run;
  }
  async _all(name) {
    const snap = await getDocs(this.col(name));
    return snap.docs.map((d) => d.data());
  }
  async _where(name, field, value) {
    const snap = await getDocs(query(this.col(name), where(field, '==', value)));
    return snap.docs.map((d) => d.data());
  }
  async _deleteWhere(name, field, value) {
    const snap = await getDocs(query(this.col(name), where(field, '==', value)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    return snap.size;
  }
  // ------------------------------------------------------------------ Sales invoices
  async saveInvoice(invoiceData) {
    await setDoc(this.ref('invoices', invoiceData.invoiceNo), {
      ...invoiceData,
      updatedAt: serverTimestamp(),
    });
    this._cache.invoices = null;
    return invoiceData.invoiceNo;
  }
  async getAllInvoices() {
    return this._load('invoices', async () => {
      const invoices = await this._all('invoices');
      // Sort by invoice date descending (newest first)
      return invoices.sort((a, b) => {
        const dateA = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
        const dateB = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
        return dateB - dateA;
      });
    });
  }
  async getInvoice(invoiceNo) {
    const cached = this._cache.invoices?.find((i) => i.invoiceNo === invoiceNo);
    if (cached) return cached;
    const snap = await getDoc(this.ref('invoices', invoiceNo));
    return snap.exists() ? snap.data() : null;
  }
  /** Delete = move to recycle bin (the web app's later `deleteInvoice` definition overrides the permanent one). */
  async deleteInvoice(invoiceNo) {
    await this.moveInvoiceToRecycleBin(invoiceNo);
  }
  // ------------------------------------------------------------------ Sales payments
  async savePayment(paymentData) {
    const paymentId = paymentData.id || uid('payment');
    await setDoc(this.ref('payments', paymentId), {
      ...paymentData,
      id: paymentId,
      createdAt: serverTimestamp(),
    });
    this._cache.payments = null;
    return paymentId;
  }
  async getPaymentsByInvoice(invoiceNo) {
    try {
      return await this._where('payments', 'invoiceNo', invoiceNo);
    } catch (error) {
      console.error('Error getting payments from Firebase:', error);
      return [];
    }
  }
  async getAllPayments() {
    return this._load('payments', () => this._all('payments'), {
      memory: false,
      onError: 'empty',
    });
  }
  /** Raw delete of one payment document (no invoice recalculation). */
  async deletePaymentDoc(paymentId) {
    await deleteDoc(this.ref('payments', paymentId));
    this._cache.payments = null;
  }
  async deletePayment(paymentId) {
    let snap = await getDoc(this.ref('payments', paymentId));
    let usedId = paymentId;
    if (!snap.exists()) {
      // Try alternative ID formats (the web app stored ids in several shapes over time)
      const alternativeIds = [paymentId.toString(), `payment_${paymentId}`, paymentId];
      let found = false;
      for (const altId of alternativeIds) {
        const altSnap = await getDoc(this.ref('payments', altId));
        if (altSnap.exists()) {
          snap = altSnap;
          usedId = altId;
          found = true;
          break;
        }
      }
      if (!found) throw new Error(`Payment not found with any ID format: ${paymentId}`);
    }
    const paymentData = snap.data();
    await deleteDoc(this.ref('payments', usedId));
    this._cache.payments = null;
    if (paymentData.invoiceNo) {
      await this.updateInvoiceAfterPaymentDeletion(paymentData.invoiceNo, paymentData.amount);
    }
  }
  /** Update an invoice after one of its payments was deleted. */
  async updateInvoiceAfterPaymentDeletion(invoiceNo, paymentAmount) {
    const invoiceData = await this.getInvoice(invoiceNo);
    if (!invoiceData) return;
    const invoice = { ...invoiceData };
    if (invoice.paymentBreakdown) {
      const method = invoice.paymentMethod || 'cash';
      invoice.paymentBreakdown = {
        ...invoice.paymentBreakdown,
        [method]: Math.max(0, (invoice.paymentBreakdown[method] || 0) - paymentAmount),
      };
    }
    invoice.amountPaid = Math.max(0, invoice.amountPaid - paymentAmount);
    invoice.balanceDue = invoice.grandTotal - invoice.amountPaid;
    await this.saveInvoice(invoice);
    await this.updateSubsequentInvoices(invoice.customerName, invoiceNo);
  }
  async deletePaymentsByInvoice(invoiceNo) {
    await this._deleteWhere('payments', 'invoiceNo', invoiceNo);
    this._cache.payments = null;
  }
  // ------------------------------------------------------------------ Sales returns
  async saveReturn(returnData) {
    const returnId = returnData.id || uid('return');
    await setDoc(this.ref('returns', returnId), {
      ...returnData,
      id: returnId,
      createdAt: serverTimestamp(),
    });
    this._cache.returns = null;
    return returnId;
  }
  async getReturnsByInvoice(invoiceNo) {
    try {
      return await this._where('returns', 'invoiceNo', invoiceNo);
    } catch (error) {
      console.error('Error getting returns from Firebase:', error);
      return [];
    }
  }
  async getAllReturns() {
    return this._load('returns', () => this._all('returns'), { onError: 'empty' });
  }
  async deleteReturn(returnId) {
    await deleteDoc(this.ref('returns', returnId.toString()));
    this._cache.returns = null;
  }
  async deleteReturnsByInvoice(invoiceNo) {
    await this._deleteWhere('returns', 'invoiceNo', invoiceNo);
    this._cache.returns = null;
  }
  // ------------------------------------------------------------------ Customers
  async saveCustomer(customerData) {
    await setDoc(this.ref('customers', customerData.phone), {
      ...customerData,
      updatedAt: serverTimestamp(),
    });
    this._cache.customers = null;
    return customerData.phone;
  }
  async getCustomer(phone) {
    const snap = await getDoc(this.ref('customers', phone));
    return snap.exists() ? snap.data() : null;
  }
  async getAllCustomers() {
    return this._load('customers', () => this._all('customers'));
  }
  /** Raw delete of the customer document only (used when a customer's phone number — the doc id — changes). */
  async deleteCustomerDoc(phone) {
    await deleteDoc(this.ref('customers', phone));
    this._cache.customers = null;
  }
  /** Deletes the customer AND moves all of their invoices to the recycle bin. */
  async deleteCustomer(phone) {
    const invoices = await this._where('invoices', 'customerPhone', phone);
    await Promise.all(invoices.map((inv) => this.deleteInvoice(inv.invoiceNo)));
    await deleteDoc(this.ref('customers', phone));
    this._cache.customers = null;
  }
  /** Rewrites name/phone/address on all of a customer's invoices (matched by old name) and the customer doc. */
  async updateCustomerDetails(oldName, newName, newPhone, newAddress) {
    const snap = await getDocs(query(this.col('invoices'), where('customerName', '==', oldName)));
    await Promise.all(
      snap.docs.map((d) =>
        updateDoc(d.ref, {
          customerName: newName,
          customerPhone: newPhone,
          customerAddress: newAddress,
          updatedAt: serverTimestamp(),
        }),
      ),
    );
    this._cache.invoices = null;
    if (newPhone) {
      await this.saveCustomer({ name: newName, phone: newPhone, address: newAddress });
    }
  }
  // ------------------------------------------------------------------ Suppliers
  async saveSupplier(supplierData) {
    await setDoc(this.ref('suppliers', supplierData.phone), {
      ...supplierData,
      updatedAt: serverTimestamp(),
    });
    this._cache.suppliers = null;
    return supplierData.phone;
  }
  async getSupplier(phone) {
    const snap = await getDoc(this.ref('suppliers', phone));
    return snap.exists() ? snap.data() : null;
  }
  async getAllSuppliers() {
    return this._load('suppliers', () => this._all('suppliers'));
  }
  async deleteSupplier(phone) {
    await deleteDoc(this.ref('suppliers', phone));
    this._cache.suppliers = null;
  }
  // ------------------------------------------------------------------ Purchase bills
  async savePurchaseBill(invoiceData) {
    await setDoc(this.ref('purchase_invoices', invoiceData.invoiceNo), {
      ...invoiceData,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
    });
    this._cache.purchaseInvoices = null;
    return true;
  }
  /** Partial update of a purchase bill (web: `.update(invoiceData)`), used when applying payments/returns. */
  async updatePurchaseBillFields(invoiceNo, data) {
    await updateDoc(this.ref('purchase_invoices', invoiceNo), data);
    this._cache.purchaseInvoices = null;
  }
  async getAllPurchaseBills() {
    return this._load(
      'purchaseInvoices',
      async () => {
        const snap = await getDocs(query(this.col('purchase_invoices'), orderBy('timestamp', 'desc')));
        return snap.docs.map((d) => d.data());
      },
      { onError: 'empty' },
    );
  }
  async getPurchaseBill(invoiceNo) {
    const cached = this._cache.purchaseInvoices?.find((i) => i.invoiceNo === invoiceNo);
    if (cached) return cached;
    const snap = await getDoc(this.ref('purchase_invoices', invoiceNo));
    return snap.exists() ? snap.data() : null;
  }
  async deletePurchaseBill(invoiceNo) {
    await this.movePurchaseInvoiceToRecycleBin(invoiceNo);
  }
  // ------------------------------------------------------------------ Purchase payments
  async savePurchasePayment(paymentData) {
    const paymentId = paymentData.id || uid('purchase_payment');
    await setDoc(this.ref('purchase_payments', paymentId), {
      ...paymentData,
      id: paymentId,
      createdAt: serverTimestamp(),
    });
    this._cache.purchasePayments = null;
    return paymentId;
  }
  async getAllPurchasePayments() {
    return this._load('purchasePayments', () => this._all('purchase_payments'), {
      memory: false,
      onError: 'empty',
    });
  }
  async getPurchasePaymentsByInvoice(invoiceNo) {
    try {
      return await this._where('purchase_payments', 'invoiceNo', invoiceNo);
    } catch (error) {
      console.error('Error getting purchase payments by invoice:', error);
      return [];
    }
  }
  /** Raw delete of one purchase-payment document (no bill recalculation). */
  async deletePurchasePaymentDoc(paymentId) {
    await deleteDoc(this.ref('purchase_payments', paymentId));
    this._cache.purchasePayments = null;
  }
  async deletePurchasePayment(paymentId) {
    const snap = await getDoc(this.ref('purchase_payments', paymentId));
    if (!snap.exists()) return;
    const paymentData = snap.data();
    await deleteDoc(this.ref('purchase_payments', paymentId));
    this._cache.purchasePayments = null;
    if (paymentData.invoiceNo && paymentData.amount) {
      await this.updatePurchaseInvoiceAfterPaymentDeletion(paymentData.invoiceNo, paymentData.amount);
    }
    return true;
  }
  async updatePurchaseInvoiceAfterPaymentDeletion(invoiceNo, paymentAmount) {
    try {
      const found = await this.getPurchaseBill(invoiceNo);
      if (!found) return;
      const bill = { ...found, ...(found.payment ? { payment: { ...found.payment } } : {}) };
      if (bill.paymentBreakdown) {
        const method = bill.paymentMethod || 'cash';
        bill.paymentBreakdown = {
          ...bill.paymentBreakdown,
          [method]: Math.max(0, (bill.paymentBreakdown[method] || 0) - paymentAmount),
        };
      }
      bill.amountPaid = Math.max(0, (bill.amountPaid || bill.payment?.totalPaid || 0) - paymentAmount);
      bill.balanceDue = bill.grandTotal - bill.amountPaid;
      // Keep the nested payment object in sync if it exists
      if (bill.payment) {
        bill.payment.totalPaid = bill.amountPaid;
        bill.payment.balanceDue = bill.balanceDue;
      }
      await this.savePurchaseBill(bill);
      // NOTE: the web app also called Utils.updateSubsequentInvoices(supplierName, ...) here. That function works on
      // *sales* invoices keyed by customerName, so for a supplier it was a no-op at best and could touch a sales
      // customer with the same name at worst. It is deliberately not ported.
    } catch (error) {
      console.error('Error updating purchase invoice after payment deletion:', error);
    }
  }
  async deletePurchasePaymentsByInvoice(invoiceNo) {
    await this._deleteWhere('purchase_payments', 'invoiceNo', invoiceNo);
    this._cache.purchasePayments = null;
  }
  // ------------------------------------------------------------------ Purchase returns
  async savePurchaseReturn(returnData) {
    const returnId = returnData.id || uid('purchasereturn');
    await setDoc(this.ref('purchaseReturns', returnId), {
      ...returnData,
      id: returnId,
      createdAt: serverTimestamp(),
    });
    this._cache.purchaseReturns = null;
    return returnId;
  }
  async getPurchaseReturnsByInvoice(invoiceNo) {
    return this._where('purchaseReturns', 'invoiceNo', invoiceNo);
  }
  async getAllPurchaseReturns() {
    return this._load('purchaseReturns', () => this._all('purchaseReturns'));
  }
  async deletePurchaseReturn(returnId) {
    await deleteDoc(this.ref('purchaseReturns', returnId.toString()));
    this._cache.purchaseReturns = null;
  }
  async deletePurchaseReturnsByInvoice(invoiceNo) {
    await this._deleteWhere('purchaseReturns', 'invoiceNo', invoiceNo);
    this._cache.purchaseReturns = null;
  }
  // ------------------------------------------------------------------ Shortcuts (shared by sales + purchase bills)
  async getAllShortcuts() {
    return this._load(
      'shortcuts',
      async () => {
        const shortcuts = await this._all('shortcuts');
        return shortcuts.sort((a, b) => a.shortcutKey.localeCompare(b.shortcutKey));
      },
      { onError: 'empty' },
    );
  }
  async getShortcut(shortcutKey) {
    const snap = await getDoc(this.ref('shortcuts', shortcutKey));
    return snap.exists() ? snap.data() : null;
  }
  /** Uses the shortcut key as the document id for easy lookup/overwrite. */
  async saveShortcut(shortcut) {
    await setDoc(this.ref('shortcuts', shortcut.shortcutKey), { ...shortcut, createdAt: serverTimestamp() });
    this._cache.shortcuts = null;
    return shortcut.shortcutKey;
  }
  async deleteShortcut(shortcutKey) {
    await deleteDoc(this.ref('shortcuts', shortcutKey));
    this._cache.shortcuts = null;
  }
  // Legacy purchase_shortcuts collection (present in db.js, unused by any page)
  async savePurchaseShortcut(shortcutData) {
    await setDoc(this.ref('purchase_shortcuts', shortcutData.id), {
      ...shortcutData,
      updatedAt: serverTimestamp(),
    });
    this._cache.purchaseShortcuts = null;
    return shortcutData.id;
  }
  async getAllPurchaseShortcuts() {
    return this._load('purchaseShortcuts', () => this._all('purchase_shortcuts'), { onError: 'empty' });
  }
  async deletePurchaseShortcut(id) {
    await deleteDoc(this.ref('purchase_shortcuts', id));
    this._cache.purchaseShortcuts = null;
  }
  // ------------------------------------------------------------------ Opening stock
  async saveOpeningStock(description, qty) {
    await setDoc(this.ref('openingStocks', description), { description, qty, updatedAt: serverTimestamp() });
    this._cache.openingStocks = null;
    return description;
  }
  async deleteOpeningStock(description) {
    await deleteDoc(this.ref('openingStocks', description));
    this._cache.openingStocks = null;
    return description;
  }
  async getAllOpeningStocks() {
    return this._load('openingStocks', () => this._all('openingStocks'), {
      onError: 'empty',
    });
  }
  // ------------------------------------------------------------------ Product Metadata
  async saveProductMetadata(description, metadata) {
    await setDoc(this.ref('productMetadata', description), { ...metadata, description, updatedAt: serverTimestamp() }, { merge: true });
    this._cache.productMetadata = null;
    return description;
  }
  async getAllProductMetadata() {
    return this._load('productMetadata', () => this._all('productMetadata'), {
      onError: 'empty',
    });
  }
  // ------------------------------------------------------------------ Expenses
  async saveExpense(expenseData) {
    await setDoc(this.ref('expenses', expenseData.id), expenseData);
    this._cache.expenses = null;
    return expenseData;
  }
  async getAllExpenses() {
    return this._load('expenses', async () => {
      const expenses = await this._all('expenses');
      // Sort by date descending
      return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
  }
  async deleteExpense(id) {
    await deleteDoc(this.ref('expenses', id));
    this._cache.expenses = null;
  }
  // ------------------------------------------------------------------ Sales recycle bin
  async moveInvoiceToRecycleBin(invoiceNo) {
    const invoiceData = await this.getInvoice(invoiceNo);
    if (!invoiceData) return;
    const payments = await this.getPaymentsByInvoice(invoiceNo);
    const returns = await this.getReturnsByInvoice(invoiceNo);
    const entry = {
      id: `invoice_${invoiceNo}_${Date.now()}`,
      type: 'invoice',
      originalId: invoiceNo,
      data: invoiceData,
      payments,
      returns,
      deletedAt: serverTimestamp(),
      customerName: invoiceData.customerName,
      customerPhone: invoiceData.customerPhone,
      invoiceDate: invoiceData.invoiceDate,
      grandTotal: invoiceData.grandTotal,
    };
    await setDoc(this.ref('recycleBin', entry.id), entry);
    await deleteDoc(this.ref('invoices', invoiceNo));
    this._cache.recycleBin = null;
    this._cache.invoices = null;
    await this.deletePaymentsByInvoice(invoiceNo);
    await this.deleteReturnsByInvoice(invoiceNo);
    await this.updateSubsequentInvoices(invoiceData.customerName, invoiceNo);
    await this.cleanupOrphanedData();
  }
  async getRecycleBinItems() {
    return this._load(
      'recycleBin',
      async () => {
        const snap = await getDocs(query(this.col('recycleBin'), orderBy('deletedAt', 'desc')));
        return snap.docs.map((d) => d.data());
      },
      { onError: 'empty' },
    );
  }
  async restoreFromRecycleBin(itemId) {
    const docRef = this.ref('recycleBin', itemId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Recycle bin item not found');
    const item = snap.data();
    if (item.type === 'invoice') {
      await setDoc(this.ref('invoices', item.originalId), item.data);
      for (const payment of item.payments || []) await this.savePayment(payment);
      for (const returnItem of item.returns || []) await this.saveReturn(returnItem);
      await this.updateSubsequentInvoices(item.data.customerName, item.originalId);
    }
    await deleteDoc(docRef);
    this.invalidate('recycleBin', 'invoices', 'payments', 'returns');
    return item.originalId;
  }
  async permanentDeleteFromRecycleBin(itemId) {
    await deleteDoc(this.ref('recycleBin', itemId));
    this._cache.recycleBin = null;
  }
  async emptyRecycleBin() {
    const snap = await getDocs(this.col('recycleBin'));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    this._cache.recycleBin = null;
    return snap.size;
  }
  // ------------------------------------------------------------------ Purchase recycle bin
  async movePurchaseInvoiceToRecycleBin(invoiceNo) {
    const all = await this.getAllPurchaseBills();
    const invoiceData = all.find((inv) => String(inv.invoiceNo) === String(invoiceNo));
    if (!invoiceData) return;
    const payments = await this.getPurchasePaymentsByInvoice(invoiceNo);
    const entry = {
      id: `pinvoice_${invoiceNo}_${Date.now()}`,
      type: 'purchase_invoice',
      originalId: invoiceNo,
      data: invoiceData,
      payments,
      deletedAt: serverTimestamp(),
      supplierName: invoiceData.supplierName,
      supplierPhone: invoiceData.supplierPhone || '',
      invoiceDate: invoiceData.invoiceDate,
      grandTotal: invoiceData.grandTotal,
    };
    await setDoc(this.ref('purchaseRecycleBin', entry.id), entry);
    await deleteDoc(this.ref('purchase_invoices', invoiceNo));
    await this.deletePurchasePaymentsByInvoice(invoiceNo);
    this._cache.purchaseRecycleBin = null;
    this._cache.purchaseInvoices = null;
    await this.cleanupOrphanedData();
  }
  async getPurchaseRecycleBinItems() {
    return this._load(
      'purchaseRecycleBin',
      async () => {
        const snap = await getDocs(query(this.col('purchaseRecycleBin'), orderBy('deletedAt', 'desc')));
        return snap.docs.map((d) => d.data());
      },
      { onError: 'empty' },
    );
  }
  async restorePurchaseFromRecycleBin(itemId) {
    const docRef = this.ref('purchaseRecycleBin', itemId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Recycle bin item not found');
    const item = snap.data();
    if (item.type === 'purchase_invoice') {
      await setDoc(this.ref('purchase_invoices', item.originalId), item.data);
      for (const payment of item.payments || []) await this.savePurchasePayment(payment);
    }
    await deleteDoc(docRef);
    this.invalidate('purchaseRecycleBin', 'purchaseInvoices');
    return item.originalId;
  }
  async permanentDeletePurchaseFromRecycleBin(itemId) {
    await deleteDoc(this.ref('purchaseRecycleBin', itemId));
    this._cache.purchaseRecycleBin = null;
  }
  async emptyPurchaseRecycleBin() {
    const snap = await getDocs(this.col('purchaseRecycleBin'));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    this._cache.purchaseRecycleBin = null;
    return snap.size;
  }
  /** Disabled in the web app by user request: customers/suppliers are NOT deleted when their bills are deleted. */
  async cleanupOrphanedData() {
    return;
  }
  // ------------------------------------------------------------------ Sales ledger maintenance
  /**
   * Re-computes the invoices that come AFTER `updatedInvoiceNo` for the same customer after a payment/return/
   * deletion changed it. Ported 1:1 from `Utils.updateSubsequentInvoices` so the React app produces the same
   * numbers as the web app on the shared data.
   *
   * PARITY NOTE: this reproduces the web app's arithmetic exactly, including two quirks worth reviewing —
   * (1) `runningBalance` adds each invoice's `grandTotal` (which already contains the previous balance) so balances
   * can be double counted when more than one invoice precedes/follows the changed one, and (2) discount and the
   * manual opening balance are not part of the recomputed `grandTotal`. See __tests__/ledger.test.ts.
   */
  async updateSubsequentInvoices(customerName, updatedInvoiceNo) {
    try {
      const invoices = await this.getAllInvoices();
      const customerInvoices = invoices
        .filter((invoice) => invoice.customerName === customerName)
        .map((i) => ({ ...i }))
        .sort((a, b) => (parseInt(a.invoiceNo) || 0) - (parseInt(b.invoiceNo) || 0));
      const updatedIndex = customerInvoices.findIndex((inv) => inv.invoiceNo === updatedInvoiceNo);
      if (updatedIndex === -1 || updatedIndex === customerInvoices.length - 1) return;
      const allReturns = await this.getAllReturns();
      const returnsByInvoice = {};
      allReturns.forEach((r) => {
        (returnsByInvoice[r.invoiceNo] ||= []).push(r);
      });
      const returnsTotal = (invoiceNo) =>
        (returnsByInvoice[invoiceNo] || []).reduce(
          (sum, r) => sum + (parseFloat(String(r.returnAmount)) || 0),
          0,
        );
      let runningBalance = 0;
      for (let i = 0; i <= updatedIndex; i++) {
        const invoice = customerInvoices[i];
        runningBalance += invoice.grandTotal;
        runningBalance -= invoice.amountPaid;
        runningBalance -= returnsTotal(invoice.invoiceNo);
      }
      for (let i = updatedIndex + 1; i < customerInvoices.length; i++) {
        const invoice = customerInvoices[i];
        const previousBalance = runningBalance;
        const subtotal = invoice.products.reduce((sum, product) => sum + product.amount, 0);
        const totalAmount = subtotal + previousBalance;
        const totalReturns = returnsTotal(invoice.invoiceNo);
        const balanceDue = totalAmount - invoice.amountPaid - totalReturns;
        invoice.subtotal = subtotal;
        invoice.grandTotal = totalAmount;
        invoice.balanceDue = balanceDue;
        invoice.totalReturns = totalReturns;
        invoice.adjustedBalanceDue = balanceDue;
        await this.saveInvoice(invoice);
        runningBalance += invoice.grandTotal;
        runningBalance -= invoice.amountPaid;
        runningBalance -= totalReturns;
      }
    } catch (error) {
      console.error('Error updating subsequent invoices:', error);
    }
  }
}
export const db = new Database();
