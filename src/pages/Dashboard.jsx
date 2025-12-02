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
import { supabase } from "../supabase"; // Add this import
import { FiTrash2, FiFilter, FiSearch, FiCalendar, FiUser, FiTag, FiAlertCircle, FiCheck, FiX } from "react-icons/fi";
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

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { settings } = useSystemSettings();
  const isMounted = useRef(true);
  
  // Dynamic statuses from system settings
  const statuses = settings?.orderStatuses || [
    "Requested",
    "Order placed",
    "Shipped to Egypt",
    "Delivered to Egypt",
    "In Distribution",
    "Shipped to clients",
  ];

  const [orders, setOrders] = useState([]);
  const [barryOrders, setBarryOrders] = useState([]);
  const [gawyOrders, setGawyOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [selectAllBarry, setSelectAllBarry] = useState(false);
  const [selectAllGawy, setSelectAllGawy] = useState(false);
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

  // Clear placement error when selection changes
  useEffect(() => {
    setPlacementError("");
  }, [selectedOrders]);

  // Improved order sorting function - handles B1, B2, B10 properly
  const sortOrdersByNumericId = (orderList) => {
    return orderList.sort((a, b) => {
      const getNumericId = (orderId) => {
        if (!orderId) return 0;
        // Extract numeric part from B-1, B1, G-2, G2, etc.
        const match = orderId.match(/(?:B|G)-?(\d+)/);
        return match ? parseInt(match[1]) : 0;
      };
      
      const numA = getNumericId(a.orderId);
      const numB = getNumericId(b.orderId);
      return numA - numB;
    });
  };

  // Load orders, accounts, and merged groups from Firestore
  useEffect(() => {
    const fetchData = async () => {
      try {
        const orderSnap = await getDocs(collection(db, "orders"));
        const orderList = orderSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Ensure deliveredAt is properly parsed
            deliveredAt: data.deliveredAt ? data.deliveredAt.toDate() : null
          };
        });
        
        // Use improved numeric sorting
        const sortedOrders = sortOrdersByNumericId(orderList);
        
        setOrders(sortedOrders);

        const accSnap = await getDocs(collection(db, "accounts"));
        const accountNames = accSnap.docs.map((doc) => doc.data().name);
        setAccounts(accountNames);

        // Load merged groups from Firestore
        const mergedGroupsSnap = await getDocs(collection(db, "mergedGroups"));
        const mergedGroupsList = mergedGroupsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setMergedGroups(mergedGroupsList);

        showToast("Data loaded successfully!", "success");

      } catch (error) {
        showToast(`❌ Failed to load data: ${error.message}`, "error");
      }
    };
    fetchData();
  }, []);

  // Filter and split orders into Barry and Gawy
  useEffect(() => {
    let result = [...orders];
    
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

    const barry = sortOrdersByNumericId(result.filter(order => order.orderType === "B" || order.orderId?.startsWith("B")));
    const gawy = sortOrdersByNumericId(result.filter(order => order.orderType === "G" || order.orderId?.startsWith("G")));
    
    setBarryOrders(barry);
    setGawyOrders(gawy);
  }, [filters, orders]);

  // Check if all selected orders are in "Requested" status
  const areAllSelectedOrdersRequested = () => {
    if (selectedOrders.length === 0) return false;
    
    return selectedOrders.every(id => {
      const order = orders.find(o => o.id === id);
      return order?.status === "Requested";
    });
  };

  // Calculate totals for each table
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

  // Calculate merged pieces for selected orders
  const calculateMergedPieces = (orderIds = selectedOrders) => {
    if (orderIds.length <= 1) return 0;
    
    const selectedOrderDetails = orderIds.map(id => 
      orders.find(o => o.id === id)
    ).filter(Boolean);
    
    return selectedOrderDetails.reduce((total, order) => {
      const pieces = order.pieces || 0;
      return total + Number(pieces);
    }, 0);
  };

  // Check if selected orders are from the same table
  const areOrdersFromSameTable = (orderIds) => {
    if (orderIds.length === 0) return true;
    
    const firstOrder = orders.find(o => o.id === orderIds[0]);
    if (!firstOrder) return true;
    
    const firstOrderType = firstOrder.orderType === "B" || firstOrder.orderId?.startsWith("B") ? "barry" : "gawy";
    
    return orderIds.every(id => {
      const order = orders.find(o => o.id === id);
      if (!order) return true;
      const orderType = order.orderType === "B" || order.orderId?.startsWith("B") ? "barry" : "gawy";
      return orderType === firstOrderType;
    });
  };

  // Get pieces count for an order
  const getPiecesCount = (order) => {
    return order.pieces || 0;
  };

  // Save merged group to Firestore
  const saveMergedGroupToFirestore = async (group) => {
    try {
      const groupRef = doc(db, "mergedGroups", group.id);
      await setDoc(groupRef, {
        orders: group.orders,
        trackingNumber: group.trackingNumber,
        totalPieces: group.totalPieces,
        createdAt: new Date(),
        orderIds: group.orders.map(orderId => {
          const order = orders.find(o => o.id === orderId);
          return order ? order.orderId : orderId;
        })
      });
    } catch (error) {
      throw error;
    }
  };

  // Delete merged group from Firestore
  const deleteMergedGroupFromFirestore = async (groupId) => {
    try {
      const groupRef = doc(db, "mergedGroups", groupId);
      await deleteDoc(groupRef);
    } catch (error) {
      throw error;
    }
  };

  // Handle merging cells - PREVENT CROSS-TABLE MERGING
  const handleMergeCells = async (orderIds, trackingNumber = "") => {
    if (orderIds.length <= 1) return;
    
    // Check if orders are from the same table
    if (!areOrdersFromSameTable(orderIds)) {
      showToast("❌ Cannot merge orders from different tables (Barry and Gawy). Please select orders from the same table only.", "error");
      return;
    }
    
    setMergeLoading(true);
    setMergeSuccess(false);
    
    try {
      // Sort orders by their position in the table to maintain order
      const sortedOrderIds = [...orderIds].sort((a, b) => {
        const orderA = orders.find(o => o.id === a);
        const orderB = orders.find(o => o.id === b);
        return sortOrdersByNumericId([orderA, orderB]).map(o => o.id).indexOf(orderA.id);
      });

      const totalPieces = calculateMergedPieces(sortedOrderIds);
      
      const newGroup = {
        id: `merge-${Date.now()}`,
        orders: sortedOrderIds,
        trackingNumber: trackingNumber || generateTrackingNumber(),
        totalPieces: totalPieces,
      };
      
      // Save to Firestore first
      await saveMergedGroupToFirestore(newGroup);
      
      // Then update local state
      setMergedGroups(prev => [...prev, newGroup]);
      
      // Update orders with merged group info
      const updatedOrders = orders.map(order => {
        if (sortedOrderIds.includes(order.id)) {
          return {
            ...order,
            mergedGroupId: newGroup.id,
            isMerged: true
          };
        }
        return order;
      });
      setOrders(updatedOrders);
      
      // Show success feedback
      setMergeSuccess(true);
      showToast(`✅ Successfully merged ${orderIds.length} orders!`, "success");
      setTimeout(() => setMergeSuccess(false), 3000);
      
      return newGroup.id;
    } catch (error) {
      showToast("❌ Failed to save merged group. Please try again.", "error");
      return null;
    } finally {
      setMergeLoading(false);
    }
  };

  // Handle unmerging cells
  const handleUnmergeCells = async (groupId) => {
    try {
      // Delete from Firestore first
      await deleteMergedGroupFromFirestore(groupId);
      
      // Then update local state
      setMergedGroups(prev => prev.filter(group => group.id !== groupId));
      
      // Update orders to remove merged group info
      const updatedOrders = orders.map(order => {
        if (order.mergedGroupId === groupId) {
          const { mergedGroupId, isMerged, ...rest } = order;
          return rest;
        }
        return order;
      });
      setOrders(updatedOrders);
      
      showToast("✅ Orders unmerged successfully!", "success");
    } catch (error) {
      showToast("❌ Failed to unmerge group. Please try again.", "error");
    }
  };

  // Check if an order is part of a merged group
  const getOrderMergeInfo = (orderId) => {
    for (const group of mergedGroups) {
      if (group.orders.includes(orderId)) {
        const isFirstInGroup = group.orders[0] === orderId;
        return {
          isMerged: true,
          groupId: group.id,
          isFirstInGroup,
          rowSpan: group.orders.length,
          trackingNumber: group.trackingNumber,
          totalPieces: group.totalPieces
        };
      }
    }
    return { isMerged: false };
  };

  // Update merged tracking number in Firestore
  const updateMergedTracking = async (groupId, trackingNumber) => {
    try {
      const groupRef = doc(db, "mergedGroups", groupId);
      await updateDoc(groupRef, { 
        trackingNumber: trackingNumber,
        updatedAt: new Date()
      });
      
      setMergedGroups(prev => 
        prev.map(group => 
          group.id === groupId 
            ? { ...group, trackingNumber }
            : group
        )
      );
      showToast("Tracking number updated successfully!", "success");
    } catch (error) {
      showToast("❌ Failed to update tracking number. Please try again.", "error");
    }
  };

  // Auto-generate tracking number for merged orders
  const generateTrackingNumber = () => {
    const timestamp = new Date().getTime();
    return `TRK${timestamp.toString().slice(-8)}`;
  };

  // Get all orders with merged groups properly inserted - FIXED SORTING
  const getOrdersWithMergedGroups = (orderList) => {
    const result = [];
    
    // First, add all non-merged orders
    const mergedOrderIds = new Set();
    mergedGroups.forEach(group => {
      group.orders.forEach(orderId => mergedOrderIds.add(orderId));
    });
    
    orderList.forEach(order => {
      if (!mergedOrderIds.has(order.id)) {
        result.push({ type: 'order', data: order });
      }
    });
    
    // Then, add merged groups
    mergedGroups.forEach(group => {
      const firstOrder = orders.find(o => o.id === group.orders[0]);
      if (firstOrder && orderList.some(o => o.id === firstOrder.id)) {
        result.push({ 
          type: 'merged-group', 
          data: group,
          firstOrder: firstOrder
        });
      }
    });
    
    // Use numeric sorting for the final result
    return sortOrdersByNumericId(result.map(item => 
      item.type === 'order' ? item.data : item.firstOrder
    )).map(sortedOrder => {
      const originalItem = result.find(item => 
        item.type === 'order' ? item.data.id === sortedOrder.id : item.firstOrder.id === sortedOrder.id
      );
      return originalItem;
    }).filter(Boolean);
  };

  const barryTotals = calculateTotals(barryOrders);
  const gawyTotals = calculateTotals(gawyOrders);
  const mergedPieces = calculateMergedPieces();

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  // ADDED: Clear filters function
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

  // Recalculate outstanding amount when financial fields change - USING DYNAMIC CONVERSION RATE
  const recalculateOutstanding = (order) => {
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

 const handleUpdate = async (orderId, field, value) => {
  try {
    const orderRef = doc(db, "orders", orderId);
    const orderToUpdate = orders.find((o) => o.id === orderId);
    
    if (!orderToUpdate) {
      showToast("Order not found in local state", "error");
      return;
    }

    const updatedOrder = { ...orderToUpdate, [field]: value };

    // Check if status is being changed
    if (field === "status") {
      // If status is being changed to "Delivered to Egypt"
      if (value === "Delivered to Egypt") {
        // Add delivered date and time
        const deliveredAt = new Date();
        updatedOrder.deliveredAt = deliveredAt;
        
        // Update both status and deliveredAt in Firestore
        await updateDoc(orderRef, { 
          [field]: updatedOrder[field],
          deliveredAt: deliveredAt,
          lastUpdated: deliveredAt
        });
      } 
      // If status is being changed to "In Distribution" - SEND WHATSAPP MESSAGE
      else if (value === "In Distribution") {
        // Send WhatsApp message using template from settings
        const cleanPhone = orderToUpdate.phone?.replace(/\D/g, "");
        
        if (cleanPhone) {
          // Use message template from system settings
          const messageTemplate = settings?.inDistributionMessage || 
            "Your order ({orderId}) has arrived. It will be delivered to you in 1-3 days. Kindly transfer the outstanding amount ({outstandingAmount} EGP) and upload the receipt screenshot on the following link: http://localhost:5173/upload";
          
          const message = encodeURIComponent(
            messageTemplate
              .replace('{customerName}', orderToUpdate.customerName || '')
              .replace('{orderId}', orderToUpdate.orderId || '')
              .replace('{outstandingAmount}', orderToUpdate.outstanding?.toFixed(2) || '0.00')
          );
          window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
        }
        
        // Update status in Firestore
        await updateDoc(orderRef, { 
          [field]: updatedOrder[field],
          lastUpdated: new Date()
        });
      }
      else {
        // For other status changes, just update
        await updateDoc(orderRef, { 
          [field]: updatedOrder[field],
          lastUpdated: new Date()
        });
      }
    } else {
      // Recalculate outstanding if financial fields change
      const financialFields = [
        "depositEGP", "paidToWebsite", "discountSR", "couponSR", 
        "discount2SR", "discount3SR", "totalSR", "extraEGP"
      ];
      
      if (financialFields.includes(field)) {
        const newOutstanding = recalculateOutstanding(updatedOrder);
        updatedOrder.outstanding = newOutstanding;
        
        // Update both the field and outstanding in Firestore
        await updateDoc(orderRef, { 
          [field]: updatedOrder[field],
          outstanding: newOutstanding,
          lastUpdated: new Date()
        });
      } else {
        // For non-financial fields, update with lastUpdated timestamp
        await updateDoc(orderRef, { 
          [field]: updatedOrder[field],
          lastUpdated: new Date()
        });
      }
    }

    // Update local state
    setOrders(orders.map((o) => (o.id === orderId ? updatedOrder : o)));
    
    // Show success toast
    if (field === "status") {
      if (value === "In Distribution") {
        showToast("Status updated to 'In Distribution' and WhatsApp message sent!", "success");
      } else if (value === "Delivered to Egypt") {
        showToast("Status updated to 'Delivered to Egypt' with delivery timestamp!", "success");
      } else {
        showToast("Status updated successfully!", "success");
      }
    } else {
      showToast("Order updated successfully!", "success");
    }
    
  } catch (error) {
    showToast(`❌ Failed to update order: ${error.message}`, "error");
  }
};
  // FIXED: Proper deletion from Firestore
  const handleDelete = async (order) => {
    showConfirmation(
      "Delete Order",
      `Are you sure you want to permanently delete order ${order.orderId}? This action cannot be undone!`,
      async () => {
        try {
          // Delete from Firestore first
          await deleteDoc(doc(db, "orders", order.id));
          
          // Check if order is part of a merged group
          const mergedGroup = mergedGroups.find(group => group.orders.includes(order.id));
          if (mergedGroup) {
            if (mergedGroup.orders.length === 1) {
              // If this is the last order in the merged group, delete the group
              await deleteMergedGroupFromFirestore(mergedGroup.id);
              setMergedGroups(prev => prev.filter(group => group.id !== mergedGroup.id));
            } else {
              // Remove order from merged group
              const updatedGroup = {
                ...mergedGroup,
                orders: mergedGroup.orders.filter(id => id !== order.id),
                totalPieces: mergedGroup.totalPieces - (order.pieces || 0)
              };
              await saveMergedGroupToFirestore(updatedGroup);
              setMergedGroups(prev => 
                prev.map(group => group.id === mergedGroup.id ? updatedGroup : group)
              );
            }
          }
          
          // Then update local state
          setOrders(prevOrders => prevOrders.filter((o) => o.id !== order.id));
          setSelectedOrders(prev => prev.filter(id => id !== order.id));
          
          showToast(`✅ Order ${order.orderId} deleted successfully!`, "success");
        } catch (err) {
          showToast(`❌ Failed to delete order: ${err.message}`, "error");
        }
      },
      "danger"
    );
  };

  // FIXED: Proper bulk deletion from Firestore
  const handleDeleteSelected = async () => {
    if (selectedOrders.length === 0) {
      showToast("Please select orders to delete first.", "warning");
      return;
    }

    const selectedOrderDetails = selectedOrders.map(id => 
      orders.find(o => o.id === id)
    ).filter(Boolean);

    const orderIds = selectedOrderDetails.map(o => o.orderId).join(', ');
    
    showConfirmation(
      "Delete Selected Orders",
      `Are you sure you want to permanently delete ${selectedOrders.length} selected orders?\n\nOrders: ${orderIds}\n\nThis action cannot be undone!`,
      async () => {
        const successfulDeletes = [];
        const failedDeletes = [];

        // Delete from Firestore first
        for (const id of selectedOrders) {
          try {
            await deleteDoc(doc(db, "orders", id));
            successfulDeletes.push(id);
          } catch (err) {
            failedDeletes.push({ id, error: err.message });
          }
        }

        // Handle merged groups for deleted orders
        for (const id of successfulDeletes) {
          const mergedGroup = mergedGroups.find(group => group.orders.includes(id));
          if (mergedGroup) {
            if (mergedGroup.orders.length === 1) {
              // If this is the last order in the merged group, delete the group
              await deleteMergedGroupFromFirestore(mergedGroup.id);
              setMergedGroups(prev => prev.filter(group => group.id !== mergedGroup.id));
            } else {
              // Remove order from merged group
              const order = orders.find(o => o.id === id);
              const updatedGroup = {
                ...mergedGroup,
                orders: mergedGroup.orders.filter(orderId => orderId !== id),
                totalPieces: mergedGroup.totalPieces - (order?.pieces || 0)
              };
              await saveMergedGroupToFirestore(updatedGroup);
              setMergedGroups(prev => 
                prev.map(group => group.id === mergedGroup.id ? updatedGroup : group)
              );
            }
          }
        }

        // Only update local state after Firestore operations are complete
        if (successfulDeletes.length > 0) {
          setOrders(prevOrders => prevOrders.filter((o) => !successfulDeletes.includes(o.id)));
          setSelectedOrders([]);
          setSelectAllBarry(false);
          setSelectAllGawy(false);
        }

        if (successfulDeletes.length > 0) {
          showToast(`✅ ${successfulDeletes.length} orders deleted successfully!`, "success");
        }
        
        if (failedDeletes.length > 0) {
          showToast(`❌ ${failedDeletes.length} orders failed to delete.`, "error");
        }
      },
      "danger"
    );
  };

  // Handle selection
  const toggleSelectOrder = (id) => {
    setSelectedOrders((prev) =>
      prev.includes(id) ? prev.filter((oid) => oid !== id) : [...prev, id]
    );
  };

  const handleSelectAllBarry = () => {
    if (selectAllBarry) {
      setSelectedOrders(selectedOrders.filter(id => 
        !barryOrders.some(order => order.id === id)
      ));
    } else {
      const barryIds = barryOrders.map(order => order.id);
      setSelectedOrders([...new Set([...selectedOrders, ...barryIds])]);
    }
    setSelectAllBarry(!selectAllBarry);
  };

  const handleSelectAllGawy = () => {
    if (selectAllGawy) {
      setSelectedOrders(selectedOrders.filter(id => 
        !gawyOrders.some(order => order.id === id)
      ));
    } else {
      const gawyIds = gawyOrders.map(order => order.id);
      setSelectedOrders([...new Set([...selectedOrders, ...gawyIds])]);
    }
    setSelectAllGawy(!selectAllGawy);
  };

  // Toast functions
  const showToast = (message, type = "info") => {
    if (!isMounted.current) return; // Don't show toast if component is unmounted
    
    const id = `toast-${Date.now()}-${toastCounter}`;
    setToastCounter(prev => prev + 1);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const showConfirmation = (title, message, onConfirm, type = "danger") => {
    setConfirmationModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmationModal({ isOpen: false, title: "", message: "", onConfirm: null });
      },
      type
    });
  };

  const closeConfirmation = () => {
    setConfirmationModal({ isOpen: false, title: "", message: "", onConfirm: null });
  };

  // Place selected orders - AUTO MERGE THEM - USING DYNAMIC MESSAGES
  const handlePlaceOrders = async () => {
    // Clear previous errors
    setPlacementError("");

    if (selectedOrders.length === 0) {
      setPlacementError("❌ Please select orders first.");
      showToast("Please select orders first.", "warning");
      return;
    }

    // Check if all selected orders are in "Requested" status
    if (!areAllSelectedOrdersRequested()) {
      const nonRequestedOrders = selectedOrders.filter(id => {
        const order = orders.find(o => o.id === id);
        return order?.status !== "Requested";
      });
      
      const nonRequestedOrderIds = nonRequestedOrders.map(id => {
        const order = orders.find(o => o.id === id);
        return order?.orderId || id;
      }).join(', ');
      
      setPlacementError(`❌ Only orders with 'Requested' status can be placed. The following orders have invalid status: ${nonRequestedOrderIds}`);
      showToast(`Only 'Requested' orders can be placed. Invalid orders: ${nonRequestedOrderIds}`, "error");
      return;
    }

    // Check if orders are from the same table before auto-merging
    if (selectedOrders.length > 1 && !areOrdersFromSameTable(selectedOrders)) {
      setPlacementError("❌ Cannot place and merge orders from different tables. Please select orders from the same table only.");
      showToast("Cannot place and merge orders from different tables.", "error");
      return;
    }

    // AUTO-MERGE: Always merge selected orders when placing
    let groupId;
    if (selectedOrders.length > 1) {
      const trackingNumber = generateTrackingNumber();
      groupId = await handleMergeCells(selectedOrders, trackingNumber);
      if (!groupId) return; // Stop if merging failed
    }

    const successfulUpdates = [];
    const failedUpdates = [];

    for (const id of selectedOrders) {
      try {
        const order = orders.find((o) => o.id === id);
        if (!order) {
          failedUpdates.push({ id, error: "Order not found" });
          continue;
        }

        if (!order.phone) {
          failedUpdates.push({ id: order.orderId, error: "No phone number" });
          continue;
        }

        const orderRef = doc(db, "orders", id);
        
        // Update order status
        await updateDoc(orderRef, { 
          status: "Order placed"
        });

        // Update local state
        setOrders((prev) =>
          prev.map((o) => 
            o.id === id ? { 
              ...o, 
              status: "Order placed"
            } : o
          )
        );

        // Send WhatsApp message using template from settings
        const cleanPhone = order.phone.replace(/\D/g, "");
        
        if (cleanPhone) {
          // Use message template from system settings
          const messageTemplate = settings?.orderPlacedMessage || 
            "📦 Hello {customerName}, your order ({orderId}) has been *placed* successfully! ✅";
          
          const message = encodeURIComponent(
            messageTemplate
              .replace('{customerName}', order.customerName || '')
              .replace('{orderId}', order.orderId || '')
          );
          window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
        }

        successfulUpdates.push(order.orderId);
      } catch (error) {
        failedUpdates.push({ 
          id, 
          error: error.message || "Unknown error" 
        });
      }
    }

    setSelectedOrders([]);
    setSelectAllBarry(false);
    setSelectAllGawy(false);

    if (successfulUpdates.length > 0) {
      const successMessage = `✅ ${successfulUpdates.length} orders placed successfully!${
        groupId ? `\n\nMerged ${selectedOrders.length} orders` : ''
      }`;
      showToast(successMessage, "success");
    }
    
    if (failedUpdates.length > 0) {
      showToast(`❌ ${failedUpdates.length} orders failed to update.`, "error");
    }
  };

  // the cleanup function
 // the cleanup function with Supabase uploads removal
const clearOldDeliveredOrders = async () => {
  try {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    
    const ordersSnapshot = await getDocs(collection(db, "orders"));
    const allOrders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const ordersToDelete = allOrders.filter(order => {
      if (order.status !== "Delivered to Egypt") return false;
      let deliveredDate;
      
      // Priority 1: Use deliveredAt date if available
      if (order.deliveredAt) {
        deliveredDate = order.deliveredAt.toDate();
      } 
      // Priority 2: Fallback to creation date (shouldn't happen for delivered orders)
      else if (order.createdAt) {
        deliveredDate = order.createdAt.toDate();
      } else {
        return false;
      }
      return deliveredDate < twoMonthsAgo;
    });

    if (ordersToDelete.length === 0) {
      return { deletedCount: 0, errorCount: 0 };
    }

    let deletedCount = 0;
    let errorCount = 0;

    for (const order of ordersToDelete) {
      try {
        // Delete from Firestore
        await deleteDoc(doc(db, "orders", order.id));

        // DELETE FROM SUPABASE UPLOADS
        if (supabase) {
          try {
            // Delete uploads associated with this order (using orderId or firestore_order_id)
            const { error: uploadsError } = await supabase
              .from('uploads')
              .delete()
              .or(`order_id.eq.${order.orderId},firestore_order_id.eq.${order.id}`);
            
            if (uploadsError) {
              console.error(`Error deleting uploads for order ${order.orderId}:`, uploadsError);
              errorCount++;
            } else {
              console.log(`✅ Deleted uploads for order ${order.orderId}`);
            }
          } catch (supabaseError) {
            console.error(`Supabase error for order ${order.orderId}:`, supabaseError);
            errorCount++;
          }
        }
        
        deletedCount++;
        
      } catch (error) {
        console.error(`❌ Failed to delete order ${order.id}:`, error);
        errorCount++;
      }
    }

    // Check if component is still mounted before showing toast
    if (isMounted.current && deletedCount > 0) {
      showToast(`✅ Automatically cleared ${deletedCount} old delivered orders${errorCount > 0 ? ` (${errorCount} errors)` : ''}`, 
        errorCount > 0 ? "warning" : "success");
    }
    
    return { deletedCount, errorCount };
    
  } catch (error) {
    console.error('Error in automatic order cleanup:', error);
    // Check if component is still mounted before showing toast
    if (isMounted.current) {
      showToast(`❌ Automatic cleanup failed: ${error.message}`, "error");
    }
    throw error;
  }
};

  // Add this useEffect hook for daily cleanup
  useEffect(() => {
    let isSubscribed = true; // Track if effect is still subscribed
    
    const runAutoCleanup = async () => {
      try {
        const lastCleanup = localStorage.getItem('lastAutoCleanup');
        const today = new Date().toDateString();
        
        // Only run once per day
        if (!lastCleanup || lastCleanup !== today) {
          console.log('Running daily automatic cleanup...');
          
          // Check if component is still mounted before proceeding
          if (isSubscribed) {
            await clearOldDeliveredOrders();
            localStorage.setItem('lastAutoCleanup', today);
          }
       }
      } catch (error) {
        throw error;
      }
    };

    // Run when dashboard loads
    if (isSubscribed) {
      runAutoCleanup();
    }

    // Cleanup function
    return () => {
      isSubscribed = false;
    };
  }, []);

  // Render order table with modern design
  const renderOrderTable = (orderList, type, selectAll, onSelectAll) => {
    const totals = calculateTotals(orderList);
    const tableData = getOrdersWithMergedGroups(orderList);
    
    // Different colors for Barry and Gawy tables
    const tableColors = {
      barry: {
        header: 'bg-gradient-to-r from-blue-500 to-blue-600',
        border: 'border-blue-200',
        accent: 'text-blue-600',
        light: 'bg-blue-50',
        medium: 'bg-blue-100'
      },
      gawy: {
        header: 'bg-gradient-to-r from-green-500 to-green-600',
        border: 'border-green-200',
        accent: 'text-green-600',
        light: 'bg-green-50',
        medium: 'bg-green-100'
      }
    };
    
    const colors = type === "Barry" ? tableColors.barry : tableColors.gawy;
    
    return (
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Table Header */}
        <div className={`${colors.header} text-white p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 p-2 rounded-lg">
                {type === "Barry" ? (
                  <span className="text-lg font-bold">B</span>
                ) : (
                  <span className="text-lg font-bold">G</span>
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold">{type} Orders</h2>
                <p className="text-white/80 text-sm">{orderList.length} orders • {totals.totalPieces} pieces</p>
              </div>
            </div>
            {isAdmin && (
              <div className="text-right">
                <div className="text-2xl font-bold">${totals.totalEGP.toFixed(2)}</div>
                <div className="text-white/80 text-sm">Total EGP</div>
              </div>
            )}
          </div>
        </div>

  {/* Table Content - FULL WIDTH WITHOUT HORIZONTAL SCROLL */}
<div className="flex-1 w-full">
  <table className="w-full border-collapse text-sm" style={{ minWidth: isAdmin ? '2400px' : '1200px' }}>
    <thead>
      <tr className={`${colors.medium} text-left`}>
        <th className="p-3 border-b w-12">
          <input
            type="checkbox"
            checked={selectAll}
            onChange={onSelectAll}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </th>
        <th className="p-3 border-b font-semibold w-40">Order ID</th>
        <th className="p-3 border-b font-semibold w-60">Customer</th>
        <th className="p-3 border-b font-semibold w-40">Phone</th>
        <th className="p-3 border-b font-semibold w-80">Account</th>
        <th className="p-3 border-b font-semibold w-80">Tracking Numbers</th>
        <th className="p-3 border-b font-semibold w-80">Status</th>
        <th className="p-3 border-b font-semibold w-32">Pieces</th>
        <th className="p-3 border-b font-semibold w-60 bg-blue-200">Merged Pieces</th>
        
        {/* Money fields - only show for admin */}
        {isAdmin && (
          <>
            <th className="p-3 border-b font-semibold w-40">Total (EGP)</th>
            <th className="p-3 border-b font-semibold w-40">Deposit (EGP)</th>
            <th className="p-3 border-b font-semibold w-48">Paid to website (SR)</th>
            <th className="p-3 border-b font-semibold w-40">Discount (SR)</th>
            <th className="p-3 border-b font-semibold w-40">Coupon (SR)</th>
            <th className="p-3 border-b font-semibold w-48">Discount 2 (SR)</th>
            <th className="p-3 border-b font-semibold w-48">Discount 3 (SR)</th>
            <th className="p-3 border-b font-semibold w-48">Outstanding (EGP)</th>
          </>
        )}
        
        <th className="p-3 border-b font-semibold w-32 text-center">Actions</th>
      </tr>
    </thead>
    <tbody>
      {tableData.map((item, index) => {
        if (item.type === 'order') {
          const order = item.data;
          return (
            <tr key={order.id} className="border-b hover:bg-gray-50 transition-colors">
              <td className="p-3 text-center w-12">
                <input
                  type="checkbox"
                  checked={selectedOrders.includes(order.id)}
                  onChange={() => toggleSelectOrder(order.id)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </td>
              <td className="p-3 font-mono text-sm font-medium w-40">{order.orderId}</td>
              <td className="p-3 w-60">
                <div className="break-words min-w-0">
                  <div className="font-medium text-gray-900">{order.customerName}</div>
                  <div className="text-xs text-gray-500">({order.customerCode})</div>
                </div>
              </td>
              <td className="p-3 font-mono text-sm text-gray-600 w-40">{order.phone}</td>
              <td className="p-3 w-80">
                <select
                  value={order.accountName || ""}
                  onChange={(e) =>
                    handleUpdate(order.id, "accountName", e.target.value)
                  }
                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">Select Account</option>
                  {accounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-3 w-80">
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
                        const newNums = order.trackingNumbers?.length
                          ? [...order.trackingNumbers]
                          : [""];
                        newNums[idx] = e.target.value;
                        handleUpdate(order.id, "trackingNumbers", newNums);
                      }}
                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                      placeholder="Tracking number"
                    />
                  ))}
                </div>
              </td>
              <td className="p-3 w-80">
                <select
                  value={order.status}
                  onChange={(e) =>
                    handleUpdate(order.id, "status", e.target.value)
                  }
                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-3 text-center font-mono text-sm font-semibold w-32">
                {getPiecesCount(order)}
              </td>
              <td className="p-3 text-center text-gray-400 bg-gray-50 w-60">
                <div className="text-xs">Not merged</div>
              </td>
              
              {/* Money fields - only show for admin */}
              {isAdmin && (
                <>
                  <td className="p-3 text-right font-mono text-sm font-semibold text-gray-900 w-40">
                    {Number(order.totalEGP || 0).toFixed(2)}
                  </td>
                  <td className="p-3 w-40">
                    <input
                      type="number"
                      value={order.depositEGP || 0}
                      onChange={(e) =>
                        handleUpdate(order.id, "depositEGP", Number(e.target.value))
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </td>
                  <td className="p-3 w-48">
                    <input
                      type="number"
                      value={order.paidToWebsite || 0}
                      onChange={(e) =>
                        handleUpdate(order.id, "paidToWebsite", Number(e.target.value))
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </td>
                  <td className="p-3 w-40">
                    <input
                      type="number"
                      value={order.discountSR || 0}
                      onChange={(e) =>
                        handleUpdate(order.id, "discountSR", Number(e.target.value))
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </td>
                  <td className="p-3 w-40">
                    <input
                      type="number"
                      value={order.couponSR || 0}
                      onChange={(e) =>
                        handleUpdate(order.id, "couponSR", Number(e.target.value))
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </td>
                  <td className="p-3 w-48">
                    <input
                      type="number"
                      value={order.discount2SR || 0}
                      onChange={(e) =>
                        handleUpdate(order.id, "discount2SR", Number(e.target.value))
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-3 w-48">
                    <input
                      type="number"
                      value={order.discount3SR || 0}
                      onChange={(e) =>
                        handleUpdate(order.id, "discount3SR", Number(e.target.value))
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-3 text-right font-mono text-sm font-semibold text-gray-900 w-48">
                    {Number(order.outstanding || 0).toFixed(2)}
                  </td>
                </>
              )}
              
              <td className="p-3 text-center w-32">
                <button
                  className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 transition-colors duration-200"
                  onClick={() => handleDelete(order)}
                  title="Delete order"
                >
                  <FiTrash2 size={16} />
                </button>
              </td>
            </tr>
          );
        } else {
          // This is a merged group
          const group = item.data;
          const firstOrder = item.firstOrder;
          
          return (
            <React.Fragment key={group.id}>
              {group.orders.map((orderId, orderIndex) => {
                const order = orders.find(o => o.id === orderId);
                if (!order) return null;
                
                return (
                  <tr key={order.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-3 text-center w-12">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => toggleSelectOrder(order.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-3 font-mono text-sm font-medium w-40">{order.orderId}</td>
                    <td className="p-3 w-60">
                      <div className="break-words min-w-0">
                        <div className="font-medium text-gray-900">{order.customerName}</div>
                        <div className="text-xs text-gray-500">({order.customerCode})</div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-sm text-gray-600 w-40">{order.phone}</td>
                    <td className="p-3 w-80">
                      <select
                        value={order.accountName || ""}
                        onChange={(e) =>
                          handleUpdate(order.id, "accountName", e.target.value)
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      >
                        <option value="">Select Account</option>
                        {accounts.map((account) => (
                          <option key={account} value={account}>
                            {account}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 w-80">
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
                              const newNums = order.trackingNumbers?.length
                                ? [...order.trackingNumbers]
                                : [""];
                              newNums[idx] = e.target.value;
                              handleUpdate(order.id, "trackingNumbers", newNums);
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                            placeholder="Tracking number"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="p-3 w-80">
                      <select
                        value={order.status}
                        onChange={(e) =>
                          handleUpdate(order.id, "status", e.target.value)
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      >
                        {statuses.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-center font-mono text-sm font-semibold w-32">
                      {getPiecesCount(order)}
                    </td>
                    
                    {/* MERGED CELL - Only show in first row, span the rest */}
                    {orderIndex === 0 ? (
                      <td 
                        className="p-3 bg-blue-50 text-center align-middle border-l-4 border-blue-400 w-60" 
                        rowSpan={group.orders.length}
                      >
                        <div className="flex flex-col gap-2 justify-center h-full">
                          <div className="text-xs text-gray-600 font-medium">Merged Total</div>
                          <div className="text-blue-700 font-bold text-lg font-mono">
                            {group.totalPieces}
                          </div>
                          <div className="text-xs text-gray-500">
                            ({group.orders.length} orders)
                          </div>
                          <button
                            onClick={() => handleUnmergeCells(group.id)}
                            className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded transition-colors"
                          >
                            Unmerge
                          </button>
                        </div>
                      </td>
                    ) : null}
                    
                    {/* Money fields - only show for admin */}
                    {isAdmin && (
                      <>
                        <td className="p-3 text-right font-mono text-sm font-semibold text-gray-900 w-40">
                          {Number(order.totalEGP || 0).toFixed(2)}
                        </td>
                        <td className="p-3 w-40">
                          <input
                            type="number"
                            value={order.depositEGP || 0}
                            onChange={(e) =>
                              handleUpdate(order.id, "depositEGP", Number(e.target.value))
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                        </td>
                        <td className="p-3 w-48">
                          <input
                            type="number"
                            value={order.paidToWebsite || 0}
                            onChange={(e) =>
                              handleUpdate(order.id, "paidToWebsite", Number(e.target.value))
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                        </td>
                        <td className="p-3 w-40">
                          <input
                            type="number"
                            value={order.discountSR || 0}
                            onChange={(e) =>
                              handleUpdate(order.id, "discountSR", Number(e.target.value))
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                        </td>
                        <td className="p-3 w-40">
                          <input
                            type="number"
                            value={order.couponSR || 0}
                            onChange={(e) =>
                              handleUpdate(order.id, "couponSR", Number(e.target.value))
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                        </td>
                        <td className="p-3 w-48">
                          <input
                            type="number"
                            value={order.discount2SR || 0}
                            onChange={(e) =>
                              handleUpdate(order.id, "discount2SR", Number(e.target.value))
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder="0"
                          />
                        </td>
                        <td className="p-3 w-48">
                          <input
                            type="number"
                            value={order.discount3SR || 0}
                            onChange={(e) =>
                              handleUpdate(order.id, "discount3SR", Number(e.target.value))
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder="0"
                          />
                        </td>
                        <td className="p-3 text-right font-mono text-sm font-semibold text-gray-900 w-48">
                          {Number(order.outstanding || 0).toFixed(2)}
                        </td>
                      </>
                    )}
                    
                    <td className="p-3 text-center w-32">
                      <button
                        className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 transition-colors duration-200"
                        onClick={() => handleDelete(order)}
                        title="Delete order"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          );
        }
      })}
    </tbody>

    {/* Totals Footer */}
    {orderList.length > 0 && (<tfoot>
      <tr className="font-bold bg-gradient-to-r from-gray-100 to-gray-200">
        <td className="p-3 text-center text-gray-700 w-12"></td>
        <td className="p-3 text-center text-gray-700 w-40" colSpan="2">
          TOTAL SUMMARY ({orderList.length} orders)
        </td>
        <td className="p-3 text-center text-gray-700 w-40"></td>
        <td className="p-3 text-center text-gray-700 w-80"></td>
        <td className="p-3 text-center text-gray-700 w-80"></td>
        <td className="p-3 text-center text-gray-700 w-80"></td>
        <td className="p-3 text-center text-blue-700 font-mono bg-blue-100 w-32">
          {totals.totalPieces}
        </td>
        <td className="p-3 text-center text-purple-700 font-mono bg-purple-100 w-60"></td>
        
        {isAdmin && (
          <>
            <td className="p-3 text-right text-green-700 font-mono w-40">
              {totals.totalEGP.toFixed(2)}
            </td>
            <td className="p-3 text-right text-blue-700 font-mono w-40">
              {totals.depositEGP.toFixed(2)}
            </td>
            <td className="p-3 text-right text-purple-700 font-mono w-48">
              {totals.paidToWebsite.toFixed(2)}
            </td>
            <td className="p-3 text-right text-orange-700 font-mono w-40">
              {totals.discountSR.toFixed(2)}
            </td>
            <td className="p-3 text-right text-orange-600 font-mono w-40">
              {totals.couponSR.toFixed(2)}
            </td>
            <td className="p-3 text-right text-orange-500 font-mono w-48">
              {totals.discount2SR.toFixed(2)}
            </td>
            <td className="p-3 text-right text-orange-400 font-mono w-48">
              {totals.discount3SR.toFixed(2)}
            </td>
            <td className="p-3 text-right text-red-700 font-mono w-48">
              {totals.outstanding.toFixed(2)}
            </td>
          </>
        )}
        
        <td className="p-3 text-center text-gray-700 w-32"></td>
      </tr>
    </tfoot>)}
  </table>
</div>

 {orderList.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FiAlertCircle className="mx-auto text-4xl mb-4 text-gray-300" />
              <p className="text-lg font-medium">No {type} orders found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          )}
        </div>
    );
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
        onClose={closeConfirmation}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        type={confirmationModal.type}
      />

      {/* MAIN CONTAINER WITH HORIZONTAL SCROLL */}
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 w-full overflow-x-auto">
        <div className="p-6 min-w-[2400px]"> {/* Increased min-width to accommodate both tables */}
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Orders Dashboard</h1>
            <p className="text-gray-600">Manage and track all your orders in one place</p>
          </div>

          {/* Full Width Filters */}
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
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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

          {/* Placement Error Banner - HIGHLY VISIBLE */}
          {placementError && (
            <div className="mb-6 animate-pulse">
              <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-2xl p-6 shadow-lg border-2 border-red-300">
                <div className="flex items-center space-x-4">
                  <div className="bg-white/20 p-3 rounded-xl">
                    <FiAlertCircle size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold">Cannot Place Orders</h3>
                    <p className="text-white/90 font-medium">{placementError}</p>
                  </div>
                  <button
                    onClick={() => setPlacementError("")}
                    className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
                    title="Dismiss"
                  >
                    <FiX size={20} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Two Tables Side by Side - FULL WIDTH */}
          <div className="flex gap-8 mb-6 w-full">
            {renderOrderTable(barryOrders, "Barry", selectAllBarry, handleSelectAllBarry)}
            {renderOrderTable(gawyOrders, "Gawy", selectAllGawy, handleSelectAllGawy)}
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 p-6 bg-white rounded-2xl shadow-lg border border-gray-200">
            <div className="flex items-center gap-4">
              {selectedOrders.length > 0 && (
                <button
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg flex items-center gap-3 transition-colors shadow-lg font-semibold"
                  onClick={handleDeleteSelected}
                >
                  <FiTrash2 size={18} />
                  Delete Selected ({selectedOrders.length})
                </button>
              )}
             
            </div>
            
            <div className="flex items-center gap-4">
              {selectedOrders.length > 1 && areOrdersFromSameTable(selectedOrders) && (
                <div className="bg-blue-100 border border-blue-300 rounded-lg px-4 py-2">
                  <span className="font-bold text-blue-800">
                    {selectedOrders.length} orders • {calculateMergedPieces()} pieces
                  </span>
                </div>
              )}
              
              <button
                className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-8 py-3 rounded-lg font-bold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handlePlaceOrders}
                disabled={selectedOrders.length === 0}
              >
                📩 Place Selected Orders ({selectedOrders.length})
              </button>
            </div>
          </div>

          {/* Merge Controls with Cross-Table Prevention */}
          {selectedOrders.length > 1 && (
            <div className="mb-6">
              <div className={`bg-gradient-to-r ${
                !areOrdersFromSameTable(selectedOrders) 
                  ? 'from-red-500 to-red-600' 
                  : mergeSuccess
                  ? 'from-green-500 to-green-600'
                  : 'from-blue-500 to-blue-600'
              } text-white rounded-2xl p-6 shadow-lg transition-all duration-300`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="bg-white/20 p-3 rounded-xl">
                      {!areOrdersFromSameTable(selectedOrders) ? (
                        <FiX size={24} />
                      ) : mergeSuccess ? (
                        <FiCheck size={24} />
                      ) : mergeLoading ? (
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <span className="text-xl font-bold">🔗</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">
                        {!areOrdersFromSameTable(selectedOrders) 
                          ? "Cannot Merge Different Tables" 
                          : mergeSuccess
                          ? "Orders Merged Successfully!"
                          : mergeLoading
                          ? "Merging Orders..."
                          : "Merge Selected Orders"}
                      </h3>
                      <p className="text-white/90">
                        {selectedOrders.length} orders selected • {calculateMergedPieces()} total pieces
                        {!areOrdersFromSameTable(selectedOrders) && " • Select orders from same table only"}
                        {mergeSuccess && " • Orders are now merged and saved"}
                      </p>
                    </div>
                  </div>
                  {areOrdersFromSameTable(selectedOrders) && !mergeSuccess && !mergeLoading && (
                    <button
                      onClick={() => handleMergeCells(selectedOrders, generateTrackingNumber())}
                      disabled={mergeLoading}
                      className="bg-white text-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-gray-100 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {mergeLoading ? "Merging..." : "Merge Selected Orders"}
                    </button>
                  )}
                  {mergeSuccess && (
                    <div className="flex items-center space-x-2 bg-white/20 px-4 py-2 rounded-lg">
                      <FiCheck className="text-white" />
                      <span className="text-white font-semibold">Success!</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          {(barryOrders.length > 0 || gawyOrders.length > 0) && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-6">Dashboard Summary</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Barry Summary */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                  <h4 className="font-bold text-blue-800 mb-4 text-lg">Barry Orders</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Total Orders:</span>
                      <span className="font-bold">{barryOrders.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Pieces:</span>
                      <span className="font-bold text-blue-700">{barryTotals.totalPieces}</span>
                    </div>
                    {isAdmin && (
                      <>
                        <div className="flex justify-between">
                          <span>Total Amount:</span>
                          <span className="font-bold text-green-700">{barryTotals.totalEGP.toFixed(2)} EGP</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Outstanding:</span>
                          <span className="font-bold text-red-700">{barryTotals.outstanding.toFixed(2)} EGP</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Gawy Summary */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                  <h4 className="font-bold text-green-800 mb-4 text-lg">Gawy Orders</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Total Orders:</span>
                      <span className="font-bold">{gawyOrders.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Pieces:</span>
                      <span className="font-bold text-green-700">{gawyTotals.totalPieces}</span>
                    </div>
                    {isAdmin && (
                      <>
                        <div className="flex justify-between">
                          <span>Total Amount:</span>
                          <span className="font-bold text-green-700">{gawyTotals.totalEGP.toFixed(2)} EGP</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Outstanding:</span>
                          <span className="font-bold text-red-700">{gawyTotals.outstanding.toFixed(2)} EGP</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Combined Summary - NOW BELOW BOTH SUMMARIES */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border-2 border-purple-300">
                <h4 className="font-bold text-purple-800 mb-4 text-lg text-center">Combined Total</h4>
                <div className={`grid ${isAdmin ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'} gap-4`}>
                  <div className="text-center">
                    <div className="text-sm text-purple-600 font-medium">Total Orders</div>
                    <div className="text-2xl font-bold text-purple-700">{barryOrders.length + gawyOrders.length}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-purple-600 font-medium">Total Pieces</div>
                    <div className="text-2xl font-bold text-purple-700">{barryTotals.totalPieces + gawyTotals.totalPieces}</div>
                  </div>
                  {isAdmin && (
                    <>
                      <div className="text-center">
                        <div className="text-sm text-purple-600 font-medium">Total Amount</div>
                        <div className="text-2xl font-bold text-purple-700">{(barryTotals.totalEGP + gawyTotals.totalEGP).toFixed(2)} EGP</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-purple-600 font-medium">Total Outstanding</div>
                        <div className="text-2xl font-bold text-red-700">{(barryTotals.outstanding + gawyTotals.outstanding).toFixed(2)} EGP</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}