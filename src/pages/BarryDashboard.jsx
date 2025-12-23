import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { supabase } from "../supabase";
import { FiTrash2, FiFilter, FiSearch, FiCalendar, FiUser, FiTag, FiAlertCircle, FiCheck, FiX, FiArrowLeft } from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { useSystemSettings } from "../hooks/useSystemSettings";

// Toast Component
const Toast = ({ message, type = "info", onClose, duration = 5000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const getToastStyles = () => {
    const baseStyles = "fixed top-4 right-4 z-50 max-w-sm w-full bg-white rounded-lg shadow-2xl border-l-4 p-4 transform transition-all duration-300";
    
    switch (type) {
      case "success":
        return `${baseStyles} border-green-500`;
      case "error":
        return `${baseStyles} border-red-500`;
      case "warning":
        return `${baseStyles} border-yellow-500`;
      case "info":
        return `${baseStyles} border-blue-500`;
      default:
        return `${baseStyles} border-gray-500`;
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return <FiCheck className="text-green-500 text-xl" />;
      case "error":
        return <FiAlertCircle className="text-red-500 text-xl" />;
      case "warning":
        return <FiAlertCircle className="text-yellow-500 text-xl" />;
      case "info":
        return <FiInfo className="text-blue-500 text-xl" />;
      default:
        return <FiInfo className="text-gray-500 text-xl" />;
    }
  };

  return (
    <div className={getToastStyles()}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <FiX size={16} />
        </button>
      </div>
    </div>
  );
};

// Confirmation Modal Component
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel", type = "danger" }) => {
  if (!isOpen) return null;

  const getButtonStyles = () => {
    switch (type) {
      case "danger":
        return "bg-red-600 hover:bg-red-700 focus:ring-red-500";
      case "warning":
        return "bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500";
      case "success":
        return "bg-green-600 hover:bg-green-700 focus:ring-green-500";
      default:
        return "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className={`p-2 rounded-lg ${
              type === "danger" ? "bg-red-100 text-red-600" :
              type === "warning" ? "bg-yellow-100 text-yellow-600" :
              type === "success" ? "bg-green-100 text-green-600" :
              "bg-blue-100 text-blue-600"
            }`}>
              <FiAlertCircle size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          </div>
          
          <p className="text-gray-600 mb-6">{message}</p>
          
          <div className="flex space-x-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-white rounded-lg transition-colors font-medium focus:ring-2 focus:ring-offset-2 ${getButtonStyles()}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Add missing FiInfo icon
const FiInfo = (props) => (
  <svg
    stroke="currentColor"
    fill="none"
    strokeWidth="2"
    viewBox="0 0 24 24"
    strokeLinecap="round"
    strokeLinejoin="round"
    height="1em"
    width="1em"
    {...props}
  >
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
);

export default function BarryDashboard({ onBack }) {
  const { isAdmin } = useAuth();
  const { settings } = useSystemSettings();
  const isMounted = useRef(true);
  
  const [originalOrders, setOriginalOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [filters, setFilters] = useState({
    account: "",
    customerName: "",
    dateFrom: "",
    dateTo: "",
    status: "",
  });
  const [mergedGroups, setMergedGroups] = useState([]);
  const [showFilters, setShowFilters] = useState(true);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [placementError, setPlacementError] = useState("");

  // Toast state
  const [toasts, setToasts] = useState([]);
  const [toastCounter, setToastCounter] = useState(0);
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
    type: "danger"
  });

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Set initial date filters to today
  useEffect(() => {
    const today = getTodayDate();
    setFilters(prev => ({
      ...prev,
      dateFrom: today,
      dateTo: today
    }));
  }, []);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Dynamic statuses from system settings
  const statuses = settings?.orderStatuses || [
    "Requested",
    "Order Placed",
    "Shipped to Egypt",
    "Delivered to Egypt",
    "In Distribution",
    "Shipped to clients",
  ];

  // Improved order sorting function
  const sortOrdersByNumericId = (orderList) => {
    return orderList.sort((a, b) => {
      const getNumericId = (orderId) => {
        if (!orderId) return 0;
        const match = orderId.match(/(?:B|G)-?(\d+)/);
        return match ? parseInt(match[1]) : 0;
      };
      
      const numA = getNumericId(a.orderId);
      const numB = getNumericId(b.orderId);
      return numA - numB;
    });
  };

  // Load data (only once)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const orderSnap = await getDocs(collection(db, "orders"));
        const orderList = orderSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            deliveredAt: data.deliveredAt ? data.deliveredAt.toDate() : null
          };
        });
        
        // Filter for Barry orders only
        const barryOrders = orderList.filter(order => 
          order.orderType === "B" || order.orderId?.startsWith("B")
        );
        
        const sortedOrders = sortOrdersByNumericId(barryOrders);
        setOriginalOrders(sortedOrders);
        setFilteredOrders(sortedOrders); // Initially show all

        const accSnap = await getDocs(collection(db, "accounts"));
        const accountNames = accSnap.docs.map((doc) => doc.data().name);
        setAccounts(accountNames);

        const mergedGroupsSnap = await getDocs(collection(db, "mergedGroups"));
        const mergedGroupsList = mergedGroupsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMergedGroups(mergedGroupsList);

        showToast("Barry orders loaded successfully!", "success");
      } catch (error) {
        showToast(`❌ Failed to load data: ${error.message}`, "error");
      }
    };
    fetchData();
  }, []); // Empty dependency array - runs once

  // Apply filters when filters change
  useEffect(() => {
    let result = originalOrders.filter(order => 
      order.orderType === "B" || order.orderId?.startsWith("B")
    );
    
    if (filters.customerName.trim() !== "") {
      const search = filters.customerName.trim().toLowerCase();
      result = result.filter((o) =>
        o.customerName?.toLowerCase().includes(search)
      );
    }
    if (filters.account !== "") {
      result = result.filter((o) => o.accountName === filters.account);
    }
    if (filters.status !== "") {
      result = result.filter((o) => o.status === filters.status);
    }
    if (filters.dateFrom !== "") {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      result = result.filter((o) => {
        if (!o.createdAt) return false;
        const orderDate = o.createdAt.toDate();
        orderDate.setHours(0, 0, 0, 0);
        return orderDate >= fromDate;
      });
    }
    if (filters.dateTo !== "") {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter((o) => {
        if (!o.createdAt) return false;
        const orderDate = o.createdAt.toDate();
        return orderDate <= toDate;
      });
    }

    setFilteredOrders(sortOrdersByNumericId(result));
  }, [filters, originalOrders]); // Only depends on filters and originalOrders

  // Clear selections when filtered orders change
  useEffect(() => {
    setSelectedOrders([]);
    setSelectAll(false);
  }, [filteredOrders]);

  // Update order function
  const handleUpdate = async (orderId, field, value) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, { [field]: value });
      
      // Update local state
      setOriginalOrders(prev => prev.map(order => 
        order.id === orderId ? { ...order, [field]: value } : order
      ));
      
      // Recalculate outstanding if financial fields are updated
      if (['totalEGP', 'depositEGP', 'paidToWebsite', 'discountSR', 'couponSR', 'discount2SR', 'discount3SR'].includes(field)) {
        const order = originalOrders.find(o => o.id === orderId);
        if (order) {
          const updatedOrder = { ...order, [field]: value };
          const outstanding = calculateOutstanding(updatedOrder);
          await updateDoc(orderRef, { outstanding });
          setOriginalOrders(prev => prev.map(order => 
            order.id === orderId ? { ...updatedOrder, outstanding } : order
          ));
        }
      }
      
      showToast("Order updated successfully!", "success");
    } catch (error) {
      showToast(`Failed to update order: ${error.message}`, "error");
    }
  };

   // Recalculate outstanding amount when financial fields change - USING DYNAMIC CONVERSION RATE
  const calculateOutstanding = (order) => {
    const totalSR = Number(order.totalSR || 0);
    const extraEGP = Number(order.extraEGP || 0);
    const depositEGP = Number(order.depositEGP || 0);
    const paidToWebsite = Number(order.paidToWebsite || 0);
    const discountSR = Number(order.discountSR || 0);
    const couponSR = Number(order.couponSR || 0);
    const discount2SR = Number(order.discount2SR || 0);
    const discount3SR = Number(order.discount3SR || 0);
    
    // Calculate net SR after all deductions
    const netSR = totalSR - (discountSR + couponSR + discount2SR + discount3SR + paidToWebsite);
    
    // Get conversion rate based on order type and client type
    let conversionRate = 1;
    const threshold = settings?.wholesaleThreshold || 1500;
    
    if (order.clientType === "Wholesale") {
      if (order.orderType === "B") {
        conversionRate = netSR > threshold 
          ? (settings?.barryWholesaleAbove1500 || 12.25)
          : (settings?.barryWholesaleBelow1500 || 12.5);
      } else if (order.orderType === "G") {
        conversionRate = netSR > threshold
          ? (settings?.gawyWholesaleAbove1500 || 13.5)
          : (settings?.gawyWholesaleBelow1500 || 14);
      }
    } else {
      // Retail pricing
      conversionRate = order.orderType === "B" 
        ? (settings?.barryRetail || 14.5)
        : (settings?.gawyRetail || 15.5);
    }
    
    // Calculate total EGP and outstanding
    const totalEGP = (netSR * conversionRate) + extraEGP;
    const outstanding = totalEGP - depositEGP;
    
    return Math.max(0, outstanding); // Ensure outstanding is not negative
  };


  // Delete single order
  const handleDelete = async (orderId) => {
    setConfirmationModal({
      isOpen: true,
      title: "Delete Order",
      message: "Are you sure you want to delete this order? This action cannot be undone.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "orders", orderId));
          setOriginalOrders(prev => prev.filter(order => order.id !== orderId));
          showToast("Order deleted successfully!", "success");
        } catch (error) {
          showToast(`Failed to delete order: ${error.message}`, "error");
        }
        setConfirmationModal({ ...confirmationModal, isOpen: false });
      },
      type: "danger"
    });
  };

  // Delete selected orders
  const handleDeleteSelected = () => {
    if (selectedOrders.length === 0) {
      showToast("No orders selected", "warning");
      return;
    }

    setConfirmationModal({
      isOpen: true,
      title: "Delete Selected Orders",
      message: `Are you sure you want to delete ${selectedOrders.length} selected order(s)? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const deletePromises = selectedOrders.map(orderId => 
            deleteDoc(doc(db, "orders", orderId))
          );
          await Promise.all(deletePromises);
          
          setOriginalOrders(prev => prev.filter(order => !selectedOrders.includes(order.id)));
          setSelectedOrders([]);
          setSelectAll(false);
          showToast(`${selectedOrders.length} order(s) deleted successfully!`, "success");
        } catch (error) {
          showToast(`Failed to delete orders: ${error.message}`, "error");
        }
        setConfirmationModal({ ...confirmationModal, isOpen: false });
      },
      type: "danger"
    });
  };

  // Calculate totals
  const calculateTotals = (orderList) => {
    const totals = {
      totalEGP: 0,
      depositEGP: 0,
      paidToWebsite: 0,
      outstanding: 0,
      totalPieces: 0,
      discountSR: 0,
      couponSR: 0,
      discount2SR: 0,
      discount3SR: 0,
    };

    orderList.forEach((order) => {
      totals.totalEGP += Number(order.totalEGP || 0);
      totals.depositEGP += Number(order.depositEGP || 0);
      totals.paidToWebsite += Number(order.paidToWebsite || 0);
      totals.outstanding += Number(order.outstanding || 0);
      totals.discountSR += Number(order.discountSR || 0);
      totals.couponSR += Number(order.couponSR || 0);
      totals.discount2SR += Number(order.discount2SR || 0);
      totals.discount3SR += Number(order.discount3SR || 0);
      
      const pieces = order.pieces || 0;
      totals.totalPieces += Number(pieces);
    });

    return totals;
  };
  const totals = calculateTotals(filteredOrders);

  // Toast functions
  const showToast = (message, type = "info") => {
    if (!isMounted.current) return;
    const id = `toast-${Date.now()}-${toastCounter}`;
    setToastCounter(prev => prev + 1);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const clearFilters = () => {
    const today = getTodayDate();
    setFilters({
      account: "",
      customerName: "",
      dateFrom: today,
      dateTo: today,
      status: "",
    });
    showToast("Filters reset to today", "info");
  };

  const toggleSelectOrder = (id) => {
    setSelectedOrders((prev) =>
      prev.includes(id) ? prev.filter((oid) => oid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(order => order.id));
    }
    setSelectAll(!selectAll);
  };

  return (
    <>
      {/* Toast Container */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        type={confirmationModal.type}
      />

      {/* MAIN CONTAINER */}
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="p-6">
          {/* Header*/}
          <div className="flex items-center justify-between mb-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-800 mb-2">Barry Orders</h1>
              <p className="text-gray-600">Manage and track all Barry orders</p>
            </div>
            <div className="w-32">
              {selectedOrders.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
                >
                  <FiTrash2 />
                  <span>Delete Selected ({selectedOrders.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Filters Section */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 mb-8 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <FiFilter className="text-2xl text-blue-600" />
                  <h2 className="text-xl font-bold text-gray-800">Filters & Search</h2>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center space-x-2"
                  >
                    <span>Reset to Today</span>
                  </button>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="px-4 py-2 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                  </button>
                </div>
              </div>

              {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                  {/* Customer Search */}
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                      <FiSearch size={16} />
                      <span>Customer Name</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Search customers..."
                      name="customerName"
                      value={filters.customerName}
                      onChange={handleFilterChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  {/* Date From */}
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                      <FiCalendar size={16} />
                      <span>Date From</span>
                    </label>
                    <input
                      type="date"
                      name="dateFrom"
                      value={filters.dateFrom}
                      onChange={handleFilterChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  {/* Date To */}
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                      <FiCalendar size={16} />
                      <span>Date To</span>
                    </label>
                    <input
                      type="date"
                      name="dateTo"
                      value={filters.dateTo}
                      onChange={handleFilterChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  {/* Account */}
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                      <FiUser size={16} />
                      <span>Account</span>
                    </label>
                    <select
                      name="account"
                      value={filters.account}
                      onChange={handleFilterChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    >
                      <option value="">All Accounts</option>
                      {accounts.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Status */}
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                      <FiTag size={16} />
                      <span>Status</span>
                    </label>
                    <select
                      name="status"
                      value={filters.status}
                      onChange={handleFilterChange}
                      className="w-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    >
                      <option value="">All Statuses</option>
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
{/* Table */}
<div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
  {/* Table Header */}
  <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="bg-white/20 p-2 rounded-lg">
          <span className="text-lg font-bold">B</span>
        </div>
        <div>
          <h2 className="text-xl font-bold">Barry Orders</h2>
          <p className="text-white/80 text-sm">{filteredOrders.length} orders • {totals.totalPieces} pieces</p>
        </div>
      </div>
      {isAdmin && (
        <div className="text-center">
          <div className="text-2xl font-bold">${totals.totalEGP.toFixed(2)}</div>
          <div className="text-white/80 text-sm">Total EGP</div>
        </div>
      )}
    </div>
  </div>

  {/* Table Content */}
  <div className="overflow-x-auto">
    <table className="w-full border-collapse text-sm" style={{ minWidth: isAdmin ? '2400px' : '1200px' }}>
      <thead>
        <tr className="bg-blue-100 text-center">
          <th className="p-3 border-b w-12">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </th>
          <th className="p-3 border-b font-semibold w-24">Order ID</th>
          <th className="p-3 border-b font-semibold w-24">Customer</th>
          <th className="p-3 border-b font-semibold w-24">Phone</th>
          <th className="p-3 border-b font-semibold w-32">Account</th>
          <th className="p-3 border-b font-semibold w-24">Tracking Numbers</th>
          <th className="p-3 border-b font-semibold w-32">Status</th>
          <th className="p-3 border-b font-semibold w-24">Pieces</th>
          <th className="p-3 border-b font-semibold w-24 bg-blue-200">Merged Pieces</th>
          
          {/* Money fields - only show for admin */}
          {isAdmin && (
            <>
              <th className="p-3 border-b font-semibold w-24">Total (EGP)</th>
              <th className="p-3 border-b font-semibold w-24">Deposit (EGP)</th>
              <th className="p-3 border-b font-semibold w-24">Paid to website (SR)</th>
              <th className="p-3 border-b font-semibold w-24">Discount (SR)</th>
              <th className="p-3 border-b font-semibold w-24">Coupon (SR)</th>
              <th className="p-3 border-b font-semibold w-24">Discount 2 (SR)</th>
              <th className="p-3 border-b font-semibold w-24">Discount 3 (SR)</th>
              <th className="p-3 border-b font-semibold w-24">Outstanding (EGP)</th>
            </>
          )}
          
          <th className="p-3 border-b font-semibold w-24 text-center">Actions</th>
        </tr>
      </thead>
      <tbody>
        {filteredOrders.map((order) => (
          <tr key={order.id} className="border-b hover:bg-gray-50 transition-colors">
            <td className="p-3 text-center">
              <input
                type="checkbox"
                checked={selectedOrders.includes(order.id)}
                onChange={() => toggleSelectOrder(order.id)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </td>
            <td className="p-3 font-mono text-sm font-medium">{order.orderId}</td>
            <td className="p-3">
              <div className="break-words min-w-0">
                <div className="font-medium text-gray-900">{order.customerName}</div>
                <div className="text-xs text-gray-500">({order.customerCode})</div>
              </div>
            </td>
            <td className="p-3 font-mono text-sm text-gray-600">{order.phone}</td>
            <td className="p-3">
              <select
                value={order.accountName || ""}
                onChange={(e) => handleUpdate(order.id, "accountName", e.target.value)}
                className="w-32 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">Select Account</option>
                {accounts.map((account) => (
                  <option key={account} value={account}>
                    {account}
                  </option>
                ))}
              </select>
            </td>
            <td className="p-3">
              <div className="space-y-1">
                {(order.trackingNumbers?.length
                  ? order.trackingNumbers
                  : [""]
                ).map((num, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={num}
                    onChange={(e) => {
                      const newTrackingNumbers = [...(order.trackingNumbers || [])];
                      if (newTrackingNumbers.length <= idx) {
                        newTrackingNumbers.push(e.target.value);
                      } else {
                        newTrackingNumbers[idx] = e.target.value;
                      }
                      handleUpdate(order.id, "trackingNumbers", newTrackingNumbers);
                    }}
                    className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                    placeholder="Tracking number"
                  />
                ))}
              </div>
            </td>
            <td className="p-3">
              <select
                value={order.status}
                onChange={(e) => handleUpdate(order.id, "status", e.target.value)}
                className="w-32 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </td>
            <td className="p-3 text-center font-mono text-sm font-semibold">
              {order.pieces || 0}
            </td>
            <td className="p-3 text-center text-gray-400 bg-gray-50">
              <div className="text-xs">Not merged</div>
            </td>
            
            {/* Money fields - only show for admin */}
            {isAdmin && (
              <>
                <td className="p-3 text-center font-mono text-sm font-semibold text-gray-900">
                  {Number(order.totalEGP || 0).toFixed(2)}
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={order.depositEGP || 0}
                    onChange={(e) => handleUpdate(order.id, "depositEGP", parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={order.paidToWebsite || 0}
                    onChange={(e) => handleUpdate(order.id, "paidToWebsite", parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={order.discountSR || 0}
                    onChange={(e) => handleUpdate(order.id, "discountSR", parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={order.couponSR || 0}
                    onChange={(e) => handleUpdate(order.id, "couponSR", parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={order.discount2SR || 0}
                    onChange={(e) => handleUpdate(order.id, "discount2SR", parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="0"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={order.discount3SR || 0}
                    onChange={(e) => handleUpdate(order.id, "discount3SR", parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="0"
                  />
                </td>
                <td className="p-3 text-center font-mono text-sm font-semibold text-gray-900">
                  {Number(order.outstanding || 0).toFixed(2)}
                </td>
              </>
            )}
            
            <td className="p-3 text-center">
              <button
                className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 transition-colors duration-200"
                onClick={() => handleDelete(order.id)}
                title="Delete order"
              >
                <FiTrash2 size={16} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>

      {/* Totals Footer - Now with proper column alignment */}
     {filteredOrders.length > 0 && ( <tfoot>
        <tr className="bg-gray-50 border-t border-gray-200 font-bold">
          {/* Checkbox column */}
          <td className="p-3"></td>

           {/* Status column */}
          <td className="p-3 text-left text-gray-700" colSpan="4">
            TOTAL Summary ({filteredOrders.length} orders)
          </td>
          
          {/* Account column */}
          <td className="p-3"></td>
          
          {/* Tracking Numbers column */}
          <td className="p-3"></td>
          
          {/* Pieces total */}
          <td className="p-3 text-center text-blue-700 font-mono bg-blue-100">
            {totals.totalPieces}
          </td>
          
          {/* Merged Pieces column (empty) */}
          <td className="p-3"></td>
          
          {/* Money fields totals - only show for admin */}
          {isAdmin ? (
            <>
              {/* Total EGP */}
              <td className="p-3 text-center text-green-700 font-mono">
                {totals.totalEGP.toFixed(2)}
              </td>
              
              {/* Deposit EGP */}
              <td className="p-3 text-center text-blue-700 font-mono">
                {totals.depositEGP.toFixed(2)}
              </td>
              
              {/* Paid to website (SR) */}
              <td className="p-3 text-center text-purple-700 font-mono">
                {totals.paidToWebsite.toFixed(2)}
              </td>
              
              {/* Discount (SR) */}
              <td className="p-3 text-center text-orange-700 font-mono">
                {totals.discountSR.toFixed(2)}
              </td>
              
              {/* Coupon (SR) */}
              <td className="p-3 text-center text-orange-600 font-mono">
                {totals.couponSR.toFixed(2)}
              </td>
              
              {/* Discount 2 (SR) */}
              <td className="p-3 text-center text-orange-500 font-mono">
                {totals.discount2SR.toFixed(2)}
              </td>
              
              {/* Discount 3 (SR) */}
              <td className="p-3 text-center text-orange-400 font-mono">
                {totals.discount3SR.toFixed(2)}
              </td>
              
              {/* Outstanding (EGP) */}
              <td className="p-3 text-center text-red-700 font-mono">
                {totals.outstanding.toFixed(2)}
              </td>
            </>
          ) : (
            // If not admin, fill with empty cells for proper alignment
            <>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="p-3"></td>
            </>
          )}
          
          {/* Actions column */}
          <td className="p-3"></td>
        </tr>
      </tfoot>)}
    </table>

    {filteredOrders.length === 0 && (
      <div className="text-center py-12 text-gray-500">
        <FiAlertCircle className="mx-auto text-4xl mb-4 text-gray-300" />
        <p className="text-lg font-medium">No Barry orders found</p>
        <p className="text-sm">Try adjusting your filters</p>
      </div>
    )}
  </div>
</div>
        
        </div>
      </div>
    </>
  );
}