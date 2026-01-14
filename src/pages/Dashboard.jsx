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
import { FiTrash2, FiFilter, FiSearch, FiCalendar, FiUser, FiTag, FiAlertCircle, FiCheck, FiX, FiPlus, FiMinus, FiEdit, FiFileText, FiRefreshCw } from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { useSystemSettings } from "../hooks/useSystemSettings";
import { useNavigate } from "react-router-dom";

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

// Function to generate consistent color based on sheet ID
const getSheetColor = (sheetId) => {
  if (!sheetId) return null;
  
  // Generate a consistent color based on sheet ID
  const colors = [
    'bg-blue-50 border-l-4 border-blue-400',
    'bg-green-50 border-l-4 border-green-400',
    'bg-yellow-50 border-l-4 border-yellow-400',
    'bg-purple-50 border-l-4 border-purple-400',
    'bg-pink-50 border-l-4 border-pink-400',
    'bg-indigo-50 border-l-4 border-indigo-400',
    'bg-red-50 border-l-4 border-red-400',
    'bg-teal-50 border-l-4 border-teal-400',
    'bg-orange-50 border-l-4 border-orange-400',
    'bg-cyan-50 border-l-4 border-cyan-400',
  ];
  
  // Simple hash function to get consistent color for same sheetId
  let hash = 0;
  for (let i = 0; i < sheetId.length; i++) {
    hash = sheetId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { settings } = useSystemSettings();
  const navigate = useNavigate();
  const isMounted = useRef(true);
  const placementErrorRef = useRef(null);
  
  // Dynamic statuses from system settings
  const statuses = settings?.orderStatuses || [
    "Requested",
    "Order Placed",
    "Shipped to Egypt",
    "Delivered to Egypt",
    "In Distribution",
    "Shipped to clients",
  ];

  const [orders, setOrders] = useState([]);
  const [barryOrders, setBarryOrders] = useState([]);
  const [gawyOrders, setGawyOrders] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [selectAllBarry, setSelectAllBarry] = useState(false);
  const [selectAllGawy, setSelectAllGawy] = useState(false);
  const [filters, setFilters] = useState({
    sheetId: "", 
    dateFrom: "",
    dateTo: "",
    status: "",
  });
  const [mergedGroups, setMergedGroups] = useState([]);
  const [showFilters, setShowFilters] = useState(true);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [placementError, setPlacementError] = useState("");
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);

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
  
  // Bulk status update modal state
  const [bulkStatusModal, setBulkStatusModal] = useState({
    isOpen: false,
    onConfirm: null
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

   useEffect(() => {
    if (placementError && placementErrorRef.current) {
      // Scroll to the placement error
      placementErrorRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      
      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        setPlacementError("");
      }, 5000); // 5 seconds
      
      return () => clearTimeout(timer);
    }
  }, [placementError]);



  // Improved order sorting function - updated to sort by sheetId when available
  const sortOrdersBySheet = (orderList) => {
    return orderList.sort((a, b) => {
      // If both have sheetIds, sort by sheet code
      if (a.sheetId && b.sheetId) {
        const sheetA = sheets.find(s => s.id === a.sheetId);
        const sheetB = sheets.find(s => s.id === b.sheetId);
        if (sheetA?.code && sheetB?.code) {
          return sheetA.code.localeCompare(sheetB.code);
        }
      }
      // If only one has sheetId, put it first
      if (a.sheetId && !b.sheetId) return -1;
      if (!a.sheetId && b.sheetId) return 1;
      
      // Fallback to original orderId sorting for orders without sheets
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

  // Load orders, merged groups, and sheets from Firestore
  useEffect(() => {
    const fetchData = async () => {
      try {
        const orderSnap = await getDocs(collection(db, "orders"));
        const orderList = orderSnap.docs.map((doc) => {
          const data = doc.data();
          const pieces = parseFloat(data.pieces) || 0;
          return {
            id: doc.id,
            ...data,
            deliveredAt: data.deliveredAt ? data.deliveredAt.toDate() : null,
            trackingNumbers: Array.isArray(data.trackingNumbers) 
              ? data.trackingNumbers.filter(t => t)
              : [],
            pieces: pieces,
            customerCode: data.customerCode || "", // Explicitly include customerCode
             customerName: data.customerName || "", // Also ensure customerName is included
          };
        });
        
        const sortedOrders = sortOrdersBySheet(orderList);
        setOrders(sortedOrders);

        // Load merged groups from Firestore
        const mergedGroupsSnap = await getDocs(collection(db, "mergedGroups"));
        const mergedGroupsList = mergedGroupsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMergedGroups(mergedGroupsList);

        // Load sheets from Firestore
        const sheetsSnap = await getDocs(collection(db, "sheets"));
        const sheetsList = sheetsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            totalPieces: parseFloat(data.totalPieces) || 0
          };
        });

        setSheets(sheetsList);
        showToast("Data loaded successfully!", "success");

      } catch (error) {
        showToast(`❌ Failed to load data: ${error.message}`, "error");
      }
    };
    fetchData();
  }, []);

  // Refresh sheet data function
  const refreshSheetData = async () => {
    try {
      const sheetsSnap = await getDocs(collection(db, "sheets"));
      const updatedSheetsList = sheetsSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          totalPieces: parseFloat(data.totalPieces) || 0
        };
      });
      setSheets(updatedSheetsList);
      
      // Also update orders with current sheet codes
      const ordersSnap = await getDocs(collection(db, "orders"));
      const updatedOrders = ordersSnap.docs.map((doc) => {
        const data = doc.data();
        const orderSheet = updatedSheetsList.find(s => s.id === data.sheetId);
        return {
          id: doc.id,
          ...data,
          sheetCode: orderSheet ? orderSheet.code : data.sheetCode,
          deliveredAt: data.deliveredAt ? data.deliveredAt.toDate() : null,
          trackingNumbers: Array.isArray(data.trackingNumbers) 
            ? data.trackingNumbers.filter(t => t)
            : [],
          pieces: parseFloat(data.pieces) || 0,
           customerCode: data.customerCode || "", // Add this
        customerName: data.customerName || "", // Add this
        };
      });
      
      const sortedOrders = sortOrdersBySheet(updatedOrders);
      setOrders(sortedOrders);
      
    } catch (error) {
      showToast("Failed to refresh sheet data", "error");
    }
  };

  // Add refresh interval for sheet data
  useEffect(() => {
    const interval = setInterval(() => {
      refreshSheetData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Filter and split orders into Barry and Gawy
  useEffect(() => {
    let result = [...orders];
    
    // CHANGED: sheetId filter (was orderId)
    if (filters.sheetId.trim() !== "") {
      const search = filters.sheetId.trim().toLowerCase();
      result = result.filter((o) => {
        // Check sheet code
        if (o.sheetCode?.toLowerCase().includes(search)) return true;
        
        // Check if order is in a sheet and sheet code matches
        if (o.sheetId) {
          const sheet = sheets.find(s => s.id === o.sheetId);
          if (sheet?.code?.toLowerCase().includes(search)) return true;
        }
        
        return false;
      });
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

    const barry = sortOrdersBySheet(result.filter(order => order.orderType === "B" || order.orderId?.startsWith("B")));
    const gawy = sortOrdersBySheet(result.filter(order => order.orderType === "G" || order.orderId?.startsWith("G")));
    
    setBarryOrders(barry);
    setGawyOrders(gawy);
  }, [filters, orders, sheets]);

  // Get sheet info for an order
  const getOrderSheetInfo = (order) => {
    if (order.sheetId) {
      const sheet = sheets.find(s => s.id === order.sheetId);
      if (sheet) {
        return {
          code: sheet.code,
          id: sheet.id,
          totalPieces: sheet.totalPieces || 0,
          orderCount: (sheet.orders || []).length,
          sheetType: sheet.type || 'Unknown',
          hasDynamicRows: (sheet.dynamicRows || []).length > 0,
          dynamicRowsCount: (sheet.dynamicRows || []).length
        };
      }
    }
    return null;
  };

  // Check if all selected orders are in "Requested" status
  const areAllSelectedOrdersRequested = () => {
    if (selectedOrders.length === 0) return false;
    return selectedOrders.every(id => {
      const order = orders.find(o => o.id === id);
      return order?.status === "Requested";
    });
  };

  // Determine sheet type based on selected orders
  const getSelectedOrdersType = () => {
    if (selectedOrders.length === 0) return null;
    const firstOrder = orders.find(o => o.id === selectedOrders[0]);
    if (!firstOrder) return null;
    return firstOrder.orderType === "B" || firstOrder.orderId?.startsWith("B") ? "Barry" : "Gawy";
  };


// Place selected orders - Send WhatsApp messages with actual deposit info
const handlePlaceOrders = async () => {
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

  // Check if orders are from the same table
  if (selectedOrders.length > 1 && !areOrdersFromSameTable(selectedOrders)) {
    setPlacementError("❌ Cannot place orders from different tables. Please select orders from the same table only.");
    showToast("Cannot place orders from different tables.", "error");
    return;
  }
  
  const successfulUpdates = [];
  const failedUpdates = [];

  // Helper function to get the appropriate WhatsApp message
const getWhatsAppMessage = (order) => {
  const {
    clientType,
    pieces = 0,
    totalSR = 0,
    extraSR = 0,
    totalEGP = 0,
    depositEGP = 0,
    outstanding = 0,
    customerName = '',
    customerCode = '',
    orderId
  } = order;

  const isRetail = clientType === "Retail";
  
  // Format all numbers properly
  const formattedPieces = Math.round(parseFloat(pieces) || 0);
  const formattedTotalSR = Math.round(parseFloat(totalSR) || 0);
  const formattedExtraSR = Math.round(parseFloat(extraSR) || 0);
  const formattedTotalEGP = isRetail ? 
    Math.round((parseFloat(totalEGP) || 0) / 5) * 5 : 
    Math.round(parseFloat(totalEGP) || 0);
  const formattedDeposit = isRetail ? 
    Math.round((parseFloat(depositEGP) || 0) / 5) * 5 : 
    Math.round(parseFloat(depositEGP) || 0);
  const formattedOutstanding = isRetail ? 
    Math.round((parseFloat(outstanding) || 0) / 5) * 5 : 
    Math.round(parseFloat(outstanding) || 0);
  
  // Calculate totalEGPPlusExtra with proper rounding
  const totalEGPPlusExtra = formattedTotalEGP + formattedExtraSR;
  
  if (clientType === "Wholesale") {
    return `اهلا ${customerName || 'العميل'} (${customerCode || ''})
عدد القطع (${formattedPieces})
قيمة الطلب بالريال ${formattedTotalSR}
بدون كود ${formattedExtraSR}
قيمة الطلب بالمصرى ${formattedTotalEGP}
الاجمالى المصرى ${totalEGPPlusExtra}
العربون ${formattedDeposit}
المتبقى من الطلب ${formattedOutstanding}
بعد دفع العربون، يرجى إرفاق لقطة شاشة للمعاملة وعناصر الطلب عبر الرابط التالي للتأكيد: 
https://orders-tracking-system.vercel.app/upload`;
    
  } else if (clientType === "Retail") {
    const depositAmount = formattedDeposit;
    
    if (depositAmount > 0) {
      return `Hi ${customerName || ''} (${customerCode || ''})
This is a confirmation message from us to make sure that every detail about your order is exactly as you wanted.
no of items: ${formattedPieces}
total: ${formattedTotalEGP}
paid deposit: ${formattedDeposit}
outstanding: ${formattedOutstanding}

And the photo below is the one you requested.

You won't be able to change your order once you confirm.
Instapay or wallet
01228582791
Youlawilliam
Youlawilliam137

A 50% deposit is required to complete the ordering process.
After deposit payment, kindly attach transaction screenshot and order items to the following link for confirmation: https://orders-tracking-system.vercel.app/upload

Thank you for purchasing from us.
Youla's Yard.`;
    } else {
      return `Hi ${customerName || ''} (${customerCode || ''})
This is a confirmation message from us to make sure that every detail about your order is exactly as you wanted.
no of items: ${formattedPieces}
total: ${formattedTotalEGP}

And the photo below is the one you requested.

You won't be able to change your order once you confirm.

You are marked as a VIP client on our list..no deposit is needed.

Thank you for purchasing from us.
Youla's Yard.`;
    }
  } else {
    // Fallback for unknown client types
    return `📦 Hello ${customerName || ''} (${customerCode || ''}), your order (${orderId || ''}) has been *placed* successfully! ✅`;
  }
};
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
      
      await updateDoc(orderRef, { 
        status: "Order Placed",
        lastUpdated: new Date()
      });

      setOrders((prev) =>
        prev.map((o) => 
          o.id === id ? { 
            ...o, 
            status: "Order Placed"
          } : o
        )
      );

      const cleanPhone = order.phone.replace(/\D/g, "");
      
      if (cleanPhone) {
        const message = getWhatsAppMessage(order);
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/2${cleanPhone}?text=${encodedMessage}`, "_blank");
      }

      successfulUpdates.push({
        orderId: order.orderId,
        customerName: order.customerName,
        clientType: order.clientType || 'Not specified',
        deposit: order.depositEGP || 0
      });
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
    // Create a summary of successful updates
    const wholesaleCount = successfulUpdates.filter(o => o.clientType === "Wholesale").length;
    const retailWithDepositCount = successfulUpdates.filter(o => 
      o.clientType === "Retail" && o.deposit > 0
    ).length;
    const retailNoDepositCount = successfulUpdates.filter(o => 
      o.clientType === "Retail" && (!o.deposit || o.deposit <= 0)
    ).length;
    
    const successMessage = `✅ ${successfulUpdates.length} orders placed successfully!\n` +
      `• Wholesale: ${wholesaleCount}\n` +
      `• Retail with deposit: ${retailWithDepositCount}\n` +
      `• Retail without deposit: ${retailNoDepositCount}\n` +
      `WhatsApp messages sent with deposit details.`;
    
    showToast(successMessage, "success");
  }
  
  if (failedUpdates.length > 0) {
    showToast(`❌ ${failedUpdates.length} orders failed to update.`, "error");
  }
};


// Bulk Status Update Modal Component
const BulkStatusUpdateModal = ({ isOpen, onClose, onConfirm, selectedCount }) => {
  const { settings } = useSystemSettings();
  const statuses = settings?.orderStatuses || [
    "Requested",
    "Order Placed",
    "Shipped to Egypt",
    "Delivered to Egypt",
    "In Distribution",
    "Shipped to clients",
  ];
  const [selectedStatus, setSelectedStatus] = useState("");
  
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedStatus) {
      alert("Please select a status");
      return;
    }
   
    onConfirm(selectedStatus);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <FiEdit size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Update Status for Selected Orders</h3>
          </div>
          
          <div className="space-y-4 mb-6">
            <p className="text-gray-600">
              You are about to update the status for <span className="font-bold text-blue-600">{selectedCount}</span> selected orders.
            </p>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select New Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="">Choose a status...</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex space-x-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={!selectedStatus}
            >
              Update {selectedCount} Orders
            </button>
          </div>
        </div>
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
  // Calculate totals for each table
  const calculateTotals = (orderList) => {
    const totals = {
      totalPieces: 0,
    };

    orderList.forEach((order) => {
      const pieces = Number(order.pieces) || 0;
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
      const pieces = Number(order.pieces) || 0;
      return total + pieces;
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
    const pieces = Number(order.pieces) || 0;
    return pieces;
  };  

  const formatNumber = (num) => {
    const number = Number(num);
    if (isNaN(number)) return "0";
    return number.toLocaleString();
  };

  // Get all orders with sheet-based merging
  const getOrdersWithSheetMerging = (orderList) => {
    const sheetGroups = {};
    
    orderList.forEach(order => {
      if (order.sheetId) {
        if (!sheetGroups[order.sheetId]) {
          sheetGroups[order.sheetId] = {
            id: order.sheetId,
            code: order.sheetCode,
            orders: [],
            totalPieces: 0
          };
        }
        sheetGroups[order.sheetId].orders.push(order);
        const pieces = Number(order.pieces) || 0;
        sheetGroups[order.sheetId].totalPieces += pieces;
      }
    });
    
    // Sort orders within each sheet group by sheet code
    Object.values(sheetGroups).forEach(group => {
      group.orders = sortOrdersBySheet(group.orders);
    });
    
    const result = [];
    const processedOrderIds = new Set();
    
    // Add sheet groups first
    Object.values(sheetGroups).forEach(group => {
      if (group.orders.length > 0) {
        group.orders.forEach(order => processedOrderIds.add(order.id));
        result.push({
          type: 'sheet-group',
          data: group,
          firstOrder: group.orders[0]
        });
      }
    });
    
    // Add all non-sheet orders
    orderList.forEach(order => {
      if (!processedOrderIds.has(order.id)) {
        result.push({ type: 'order', data: order });
      }
    });
    
    // Add manual merged groups
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
    
    // Use sheet-based sorting for the final result
    return sortOrdersBySheet(result.map(item => 
      item.type === 'order' ? item.data : item.firstOrder
    )).map(sortedOrder => {
      const originalItem = result.find(item => 
        item.type === 'order' ? item.data.id === sortedOrder.id : 
        item.type === 'sheet-group' ? item.firstOrder.id === sortedOrder.id :
        item.firstOrder.id === sortedOrder.id
      );
      return originalItem;
    }).filter(Boolean);
  };

  // Handle creating sheet from selected orders
  const handleCreateSheet = async () => {
    if (selectedOrders.length === 0) {
      showToast("Please select orders first.", "warning");
      return;
    }

    // Check if all selected orders are from the same type
    if (!areOrdersFromSameTable(selectedOrders)) {
      showToast("❌ Cannot add orders from different tables to the same sheet. Please select orders from the same table only.", "error");
      return;
    }

    // Determine sheet type based on first selected order
    const sheetType = getSelectedOrdersType();
    if (!sheetType) {
      showToast("❌ Could not determine sheet type.", "error");
      return;
    }

    const ordersToSheet = selectedOrders.map(id => orders.find(o => o.id === id)).filter(Boolean);

    try {
      setIsCreatingSheet(true);

      // Get next sheet number for this type
      const sheetsSnap = await getDocs(collection(db, "sheets"));
      const existingSheets = sheetsSnap.docs
        .map(doc => doc.data())
        .filter(sheet => sheet.type === sheetType);
      
      const nextSheetNumber = existingSheets.length + 1;
      const sheetCode = `${sheetType === "Barry" ? "B" : "G"}${nextSheetNumber}`;
      const sheetId = `sheet-${Date.now()}`;

      const totalPieces = ordersToSheet.reduce((sum, order) => {
        const pieces = Number(order.pieces) || 0;
        return sum + pieces;
      }, 0);
      
      // Create sheet document WITH dynamicRows array
      const sheetDoc = doc(db, "sheets", sheetId);
      const sheetData = {
        id: sheetId,
        code: sheetCode,
        type: sheetType,
        orders: ordersToSheet.map(order => ({
           id: order.id,  // Firestore document ID
          firestoreId: order.id,  // Add this for consistency
          orderId: order.orderId,
          customerName: order.customerName,
          pieces: Number(order.pieces) || 0,
          outstanding: order.outstanding || 0,
          phone: order.phone || '',
          customerCode: order.customerCode || "",
        })),
        totalPieces: totalPieces,
        dynamicRows: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await setDoc(sheetDoc, sheetData);

      // Update all selected orders with sheet information
      const updatePromises = ordersToSheet.map(async (order) => {
        const orderRef = doc(db, "orders", order.id);
        await updateDoc(orderRef, {
          sheetId: sheetId,
          sheetCode: sheetCode,
          updatedAt: new Date()
        });
      });

      await Promise.all(updatePromises);

      // Refresh sheets from Firestore to get the updated list
      const updatedSheetsSnap = await getDocs(collection(db, "sheets"));
      const updatedSheetsList = updatedSheetsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSheets(updatedSheetsList);

      // Update local orders state with the sheetCode
      setOrders(prevOrders => 
        prevOrders.map(order => 
          selectedOrders.includes(order.id) 
            ? { 
                ...order, 
                sheetId: sheetId, 
                sheetCode: sheetCode,
                 customerCode: order.customerCode || "",
                customerName: order.customerName || "",
              }
            : order
        )
      );

      // Clear selection
      setSelectedOrders([]);
      setSelectAllBarry(false);
      setSelectAllGawy(false);

      showToast(`✅ Created ${sheetCode} sheet with ${selectedOrders.length} orders!`, "success");

      // Navigate to sheets page after a short delay
      setTimeout(() => {
        navigate('/sheets');
      }, 1500);

    } catch (error) {
      showToast(`❌ Failed to create sheet: ${error.message}`, "error");
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const barryTotals = calculateTotals(barryOrders);
  const gawyTotals = calculateTotals(gawyOrders);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  // Clear filters function
  const clearFilters = () => {
    const today = getTodayDate();
    setFilters({
      sheetId: "",
      dateFrom: today,
      dateTo: today,
      status: "",
    });
    showToast("Filters reset to today", "info");
  };

 const handleUpdate = async (orderId, field, value) => {
  try {
    const orderRef = doc(db, "orders", orderId);
    const orderToUpdate = orders.find((o) => o.id === orderId);
    
    if (!orderToUpdate) {
      showToast("Order not found in local state", "error");
      return;
    }

    const updatedOrder = { ...orderToUpdate, [field]: value,
        customerCode: orderToUpdate.customerCode || "",
      customerName: orderToUpdate.customerName || "",
     };

    // Check if status is being changed
    if (field === "status") {
      if (value === "Delivered to Egypt") {
        const deliveredAt = new Date();
        updatedOrder.deliveredAt = deliveredAt;
        
        await updateDoc(orderRef, { 
          [field]: updatedOrder[field],
          deliveredAt: deliveredAt,
          lastUpdated: deliveredAt
        });
      } else if (value === "In Distribution") {
        const cleanPhone = orderToUpdate.phone?.replace(/\D/g, "");
        
        if (cleanPhone) {
          const messageTemplate = settings?.inDistributionMessage || 
            "Your order ({orderId}) has arrived. It will be delivered to you in 1-3 days. Kindly transfer the outstanding amount ({outstandingAmount} EGP) and upload the receipt screenshot on the following link: https://orders-tracking-system.vercel.app/upload";
          
          const message = encodeURIComponent(
            messageTemplate
              .replace('{customerName}', orderToUpdate.customerName || '')
              .replace('{orderId}', orderToUpdate.orderId || '')
              .replace('{outstandingAmount}', orderToUpdate.outstanding?.toFixed(2) || '0.00')
          );
          window.open(`https://wa.me/2${cleanPhone}?text=${message}`, "_blank");
        }
        
        await updateDoc(orderRef, { 
          [field]: updatedOrder[field],
          lastUpdated: new Date()
        });
      }
      else if(value === "Order Placed") {
        const cleanPhone = orderToUpdate.phone?.replace(/\D/g, "");
        
        if (cleanPhone) {
          // Create a simple helper function here to avoid undefined settings
          const getMessageForSingleOrder = (order) => {
            const {
              clientType,
              pieces = 0,
              totalSR = 0,
              extraSR = 0,
              totalEGP = 0,
              depositEGP = 0,
              deposit = 0,
              outstanding = 0,
              customerName,
              customerCode,
              orderId
            } = order;

            // Use whichever deposit field exists
            const actualDeposit = depositEGP || deposit || 0;
            
            // Calculate totalEGPPlusExtra for wholesale messages
            const totalEGPPlusExtra = (Number(totalEGP) || 0) + (Number(extraSR) || 0);
            
            // Use settings if available, otherwise use fallback templates
            if (clientType === "Wholesale") {
              const template = settings?.orderPlacedMessageWholesale || 
              `اهلا {customerName} ({customerCode})
              عدد القطع ({pieces})
قيمة الطلب بالريال {totalSR}
بدون كود {extraSR}
قيمة الطلب بالمصرى {totalEGP}
الاجمالى المصرى {totalEGPPlusExtra}
العربون {deposit}
المتبقى من الطلب {outstanding}
بعد دفع العربون، يرجى إرفاق لقطة شاشة للمعاملة وعناصر الطلب عبر الرابط التالي للتأكيد: https://orders-tracking-system.vercel.app/upload`;
              
              return template
               .replace('{customerName}', customerName || '')
                  .replace('{customerCode}', customerCode || '')
                .replace('{pieces}', pieces || '0')
                .replace('{totalSR}', totalSR || '0')
                .replace('{extraSR}', extraSR || '0')
                .replace('{totalEGP}', totalEGP || '0')
                .replace('{totalEGPPlusExtra}', totalEGPPlusExtra.toString())
                .replace('{deposit}', actualDeposit || '0')
                .replace('{outstanding}', outstanding || '0');
                
            } else if (clientType === "Retail") {
              const depositAmount = Number(actualDeposit) || 0;
              
              if (depositAmount > 0) {
                const template = settings?.orderPlacedMessageRetailWithDeposit || 
                  `Hi {customerName} ({customerCode})
This is a confirmation message from us to make sure that every detail about your order is exactly as you wanted.
no of items: {pieces}
total: {totalEGP}
paid deposit: {deposit}
outstanding: {outstanding}

And the photo below is the one you requested.

You won't be able to change your order once you confirm.
Instapay or wallet
01228582791
Youlawilliam
Youlawilliam137

A 50% deposit is required to complete the ordering process.
After deposit payment, kindly attach transaction screenshot and order items to the following link for confirmation: https://orders-tracking-system.vercel.app/upload

Thank you for purchasing from us.
Youla's Yard.`;
                
                return template
                  .replace('{customerName}', customerName || '')
                  .replace('{customerCode}', customerCode || '')
                  .replace('{pieces}', pieces || '0')
                  .replace('{totalEGP}', totalEGP || '0')
                  .replace('{deposit}', actualDeposit || '0')
                  .replace('{outstanding}', outstanding || '0');
              } else {
                const template = settings?.orderPlacedMessageRetailNoDeposit || 
                  `Hi {customerName} ({customerCode})
This is a confirmation message from us to make sure that every detail about your order is exactly as you wanted.
no of items: {pieces}
total: {totalEGP}

And the photo below is the one you requested.

You won't be able to change your order once you confirm.

You are marked as a VIP client on our list..no deposit is needed.

Thank you for purchasing from us.
Youla's Yard.`;
                
                return template
                  .replace('{customerName}', customerName || '')
                  .replace('{customerCode}', customerCode || '')
                  .replace('{pieces}', pieces || '0')
                  .replace('{totalEGP}', totalEGP || '0');
              }
            } else {
              const template = settings?.orderPlacedMessage || 
                "📦 Hello {customerName} ({customerCode}), your order ({orderId}) has been *placed* successfully! ✅";
              
              return template
                .replace('{customerName}', customerName || '')
                .replace('{customerCode}', customerCode || '')
                .replace('{orderId}', orderId || '');
            }
          };
          
          const message = getMessageForSingleOrder(orderToUpdate);
          const encodedMessage = encodeURIComponent(message);
          window.open(`https://wa.me/2${cleanPhone}?text=${encodedMessage}`, "_blank");
        }
        await updateDoc(orderRef, { 
        [field]: updatedOrder[field],
        lastUpdated: new Date()
      });
      }
      else {
        await updateDoc(orderRef, { 
          [field]: updatedOrder[field],
          lastUpdated: new Date()
        });
      }
    } else {
      await updateDoc(orderRef, { 
        [field]: updatedOrder[field],
        lastUpdated: new Date()
      });
    }

    // Update local state
    setOrders(orders.map((o) => (o.id === orderId ? updatedOrder : o)));
    
    // Show success toast
    if (field === "status") {
      if (value === "In Distribution") {
        showToast("Status updated to 'In Distribution' and WhatsApp message sent!", "success");
      } else if (value === "Delivered to Egypt") {
        showToast("Status updated to 'Delivered to Egypt' with delivery timestamp!", "success");
      } else if (value === "Order Placed") {
        showToast("Status updated to 'Order Placed' and WhatsApp message sent!", "success");
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
  // NEW: Bulk status update for selected orders
  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedOrders.length === 0) {
      showToast("Please select orders first.", "warning");
      return;
    }

    const successfulUpdates = [];
    const failedUpdates = [];

    // Process each selected order
    for (const orderId of selectedOrders) {
      try {
        const order = orders.find(o => o.id === orderId);
        if (!order) {
          failedUpdates.push({ id: orderId, error: "Order not found" });
          continue;
        }

        const orderRef = doc(db, "orders", orderId);
        
        if (newStatus === "Delivered to Egypt") {
          const deliveredAt = new Date();
          await updateDoc(orderRef, { 
            status: newStatus,
            deliveredAt: deliveredAt,
            lastUpdated: deliveredAt
          });
          
          setOrders(prev => prev.map(o => 
            o.id === orderId 
              ? { ...o, status: newStatus, deliveredAt: deliveredAt }
              : o
          ));
        } else if (newStatus === "In Distribution") {
          const cleanPhone = order.phone?.replace(/\D/g, "");
          
          if (cleanPhone) {
            const messageTemplate = settings?.inDistributionMessage || 
              "Your order ({orderId}) has arrived. It will be delivered to you in 1-3 days. Kindly transfer the outstanding amount ({outstandingAmount} EGP) and upload the receipt screenshot on the following link: https://orders-tracking-system.vercel.app/upload";
            
            const message = encodeURIComponent(
              messageTemplate
                .replace('{customerName}', order.customerName || '')
                .replace('{orderId}', order.orderId || '')
                .replace('{outstandingAmount}', order.outstanding?.toFixed(2) || '0.00')
            );
            window.open(`https://wa.me/2${cleanPhone}?text=${message}`, "_blank");
          }
          
          await updateDoc(orderRef, { 
            status: newStatus,
            lastUpdated: new Date()
        });
          
          setOrders(prev => prev.map(o => 
            o.id === orderId 
              ? { ...o, status: newStatus }
              : o
          ));
        }
         else if(newStatus === "Order Placed") {
              handlePlaceOrders();
        }
        
        else {
          await updateDoc(orderRef, { 
            status: newStatus,
            lastUpdated: new Date()
          });
          
          setOrders(prev => prev.map(o => 
            o.id === orderId 
              ? { ...o, status: newStatus }
              : o
          ));
        }

        successfulUpdates.push(order.orderId);
      } catch (error) {
        failedUpdates.push({ 
          id: orderId, 
          error: error.message || "Unknown error" 
        });
      }
    }

    // Show results
    if (successfulUpdates.length > 0) {
      showToast(`✅ Successfully updated status for ${successfulUpdates.length} orders to "${newStatus}"`, "success");
    }
    
    if (failedUpdates.length > 0) {
      showToast(`❌ Failed to update ${failedUpdates.length} orders`, "error");
    }
  };

  // FIXED: Proper deletion from Firestore
  const handleDelete = async (order) => {
    showConfirmation(
      "Delete Order",
      `Are you sure you want to permanently delete order ${order.orderId}? This action cannot be undone!`,
      async () => {
        try {
          await deleteDoc(doc(db, "orders", order.id));
          
          const mergedGroup = mergedGroups.find(group => group.orders.includes(order.id));
          if (mergedGroup) {
            if (mergedGroup.orders.length === 1) {
              await deleteMergedGroupFromFirestore(mergedGroup.id);
              setMergedGroups(prev => prev.filter(group => group.id !== mergedGroup.id));
            } else {
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

        for (const id of selectedOrders) {
          try {
            await deleteDoc(doc(db, "orders", id));
            successfulDeletes.push(id);
          } catch (err) {
            failedDeletes.push({ id, error: err.message });
          }
        }

        for (const id of successfulDeletes) {
          const mergedGroup = mergedGroups.find(group => group.orders.includes(id));
          if (mergedGroup) {
            if (mergedGroup.orders.length === 1) {
              await deleteMergedGroupFromFirestore(mergedGroup.id);
              setMergedGroups(prev => prev.filter(group => group.id !== mergedGroup.id));
            } else {
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
  //  if (!isMounted.current) return;
    
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

  // Open bulk status update modal
  const openBulkStatusModal = () => {
    if (selectedOrders.length === 0) {
      showToast("Please select orders first.", "warning");
      return;
    }
    
    setBulkStatusModal({
      isOpen: true,
      onConfirm: (newStatus) => handleBulkStatusUpdate(newStatus)
    });
  };

  const closeBulkStatusModal = () => {
    setBulkStatusModal({ isOpen: false, onConfirm: null });
  };

  // Render order table with sheet-based merging - REMOVED TRACKING NUMBER COLUMN
  const renderOrderTable = (orderList, type, selectAll, onSelectAll) => {
    const totals = calculateTotals(orderList);
    const tableData = getOrdersWithSheetMerging(orderList);
    
    const tableColors = {
      barry: {
        header: 'bg-gradient-to-r from-blue-500 to-blue-600',
        border: 'border-blue-200',
        accent: 'text-blue-600',
        light: 'bg-blue-50',
        medium: 'bg-blue-100',
        sheetCell: 'bg-blue-100 border-l-4 border-blue-400'
      },
      gawy: {
        header: 'bg-gradient-to-r from-green-500 to-green-600',
        border: 'border-green-200',
        accent: 'text-green-600',
        light: 'bg-green-50',
        medium: 'bg-green-100',
        sheetCell: 'bg-green-100 border-l-4 border-green-400'
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
                <p className="text-white/80 text-sm">{orderList.length} orders • {formatNumber(totals.totalPieces)} pieces</p>
              </div>
            </div>
            <button
              onClick={refreshSheetData}
              className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
              title="Refresh sheet data"
            >
              <FiRefreshCw size={18} className="text-white" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 w-full">
          <table className="w-full border-collapse text-sm" style={{ minWidth: '1000px' }}>
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
                <th className="p-3 border-b font-semibold w-40">Sheet ID</th>
                 <th className="p-3 border-b font-semibold w-40">Order ID</th> 
                <th className="p-3 border-b font-semibold w-32">Pieces</th>
                <th className="p-3 border-b font-semibold w-60 bg-blue-200">Total Pieces</th>
                {/* REMOVED TRACKING NUMBER COLUMN */}
                <th className="p-3 border-b font-semibold w-80">Status</th>
                <th className="p-3 border-b font-semibold w-32 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((item, index) => {
                if (item.type === 'order') {
                  const order = item.data;
                  const sheetInfo = getOrderSheetInfo(order);
                  const sheetColor = order.sheetId ? getSheetColor(order.sheetId) : '';
                  
                  return (
                    <tr 
                      key={order.id} 
                      className={`border-b hover:bg-gray-50 transition-colors ${selectedOrders.includes(order.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''} ${sheetColor}`}
                    >
                      <td className="p-3 text-center w-12">
                        <input
                          type="checkbox"
                          checked={selectedOrders.includes(order.id)}
                          onChange={() => toggleSelectOrder(order.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="p-3 font-mono text-sm font-medium w-40">
                        {sheetInfo ? (
                          <div className="flex flex-col">
                            <a 
                              href={`/sheet/${sheetInfo.id}`}
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`/sheet/${sheetInfo.id}`);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                            >
                              {sheetInfo.code}
                            </a>
                            {sheetInfo.hasDynamicRows && (
                              <span className="text-xs text-purple-600">
                                +{sheetInfo.dynamicRowsCount} dynamic rows
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">No sheet</span>
                        )}
                      </td>
                        <td className="p-3 font-mono text-sm font-medium w-40">
                          <div className="font-bold text-gray-800">
                            {order.orderId || `O-${order.orderType || 'U'}${order.orderNumber || ''}`}
                          </div>
                          {order.customerName && (
                            <div className="text-xs text-gray-500 truncate" title={order.customerName}>
                              {order.customerName} ({order.customerCode})
                            </div>
                          )}
                        </td>

                      <td className="p-3 text-center font-mono text-sm font-semibold w-32">
                        {formatNumber(getPiecesCount(order))}
                      </td>
                      
                      {/* Show sheet total if order is in a sheet */}
                      {sheetInfo ? (
                        <td className={`p-3 text-center align-middle border-l-4 ${colors.sheetCell} w-60`}>
                          <div className="flex flex-col gap-1 justify-center h-full">
                            <div className="text-xs text-gray-600">Sheet Total</div>
                            <div className={`${colors.accent} font-bold font-mono`}>
                              {formatNumber(sheetInfo.totalPieces)}
                            </div>
                            <div className="text-xs text-gray-500">
                              ({sheetInfo.orderCount} orders)
                            </div>
                            {sheetInfo.hasDynamicRows && (
                              <div className="text-xs text-purple-600 mt-1">
                                +{sheetInfo.dynamicRowsCount} dynamic
                              </div>
                            )}
                          </div>
                        </td>
                      ) : (
                        <td className="p-3 text-center text-gray-400 bg-gray-50 w-60">
                          <div className="text-xs">Not in sheet</div>
                        </td>
                      )}

                      {/* REMOVED TRACKING NUMBER CELL */}
                      
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
                } else if (item.type === 'sheet-group') {
                  const group = item.data;
                  const firstOrder = item.firstOrder;
                  const sheetInfo = getOrderSheetInfo(firstOrder);
                  
                  return (
                    <React.Fragment key={group.id}>
                      {group.orders.map((order, orderIndex) => {
                        const sheetColor = order.sheetId ? getSheetColor(order.sheetId) : '';
                        
                        return (
                          <tr 
                            key={order.id} 
                            className={`border-b hover:bg-gray-50 transition-colors ${selectedOrders.includes(order.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''} ${sheetColor}`}
                          >
                            <td className="p-3 text-center w-12">
                              <input
                                type="checkbox"
                                checked={selectedOrders.includes(order.id)}
                                onChange={() => toggleSelectOrder(order.id)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-3 font-mono text-sm font-medium w-40">
                              {sheetInfo ? (
                                <div className="flex flex-col">
                                  <a 
                                    href={`/sheet/${sheetInfo.id}`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      navigate(`/sheet/${sheetInfo.id}`);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                                  >
                                    {sheetInfo.code}
                                  </a>
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="text-blue-600 font-bold cursor-pointer">
                                    {order.sheetCode || 'No sheet'}
                                  </span>
                                </div>
                              )}
                            </td>
                             <td className="p-3 font-mono text-sm font-medium w-40">
                              <div className="font-bold text-gray-800">
                                {order.orderId || `O-${order.orderType || 'U'}${order.orderNumber || ''}`}
                              </div>
                              {order.customerName && (
                                <div className="text-xs text-gray-500 truncate" title={order.customerName}>
                                  {order.customerName}
                                </div>
                              )}
                            </td>

                            <td className="p-3 text-center font-mono text-sm font-semibold w-32">
                              {formatNumber(getPiecesCount(order))}
                            </td>
                            
                            {/* SHEET MERGED CELL - Only show in first row, span the rest */}
                            {orderIndex === 0 && sheetInfo ? (
                              <td 
                                className={`p-3 text-center align-middle border-l-4 ${colors.sheetCell} w-60`} 
                                rowSpan={group.orders.length}
                              >
                                <div className="flex flex-col gap-2 justify-center h-full">
                                  <div className="text-xs text-gray-600 font-medium">Sheet Total</div>
                                  <div className={`${colors.accent} font-bold text-lg font-mono`}>
                                    {formatNumber(sheetInfo.totalPieces)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    ({sheetInfo.orderCount} orders)
                                  </div>
                                  <a 
                                    href={`/sheet/${sheetInfo.id}`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      navigate(`/sheet/${sheetInfo.id}`);
                                    }}
                                    className="text-xs bg-white hover:bg-gray-100 text-blue-700 px-2 py-1 rounded transition-colors border border-blue-300"
                                  >
                                    View Sheet
                                  </a>
                                </div>
                              </td>
                            ) : orderIndex === 0 ? (
                              <td 
                                className="p-3 text-center text-gray-400 bg-gray-50 w-60"
                                rowSpan={group.orders.length}
                              >
                                <div className="text-xs">Sheet data loading...</div>
                              </td>
                            ) : null}
                            
                            {/* REMOVED TRACKING NUMBER CELL */}
                            
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
                } else {
                  const group = item.data;
                  const firstOrder = item.firstOrder;
                  const sheetInfo = getOrderSheetInfo(firstOrder);
                  
                  return (
                    <React.Fragment key={group.id}>
                      {group.orders.map((orderId, orderIndex) => {
                        const order = orders.find(o => o.id === orderId);
                        if (!order) return null;
                        
                        const sheetColor = order.sheetId ? getSheetColor(order.sheetId) : '';
                        
                        return (
                          <tr 
                            key={order.id} 
                            className={`border-b hover:bg-gray-50 transition-colors ${selectedOrders.includes(order.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''} ${sheetColor}`}
                          >
                            <td className="p-3 text-center w-12">
                              <input
                                type="checkbox"
                                checked={selectedOrders.includes(order.id)}
                                onChange={() => toggleSelectOrder(order.id)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-3 font-mono text-sm font-medium w-40">
                              {sheetInfo ? (
                                <div className="flex flex-col">
                                  <a 
                                    href={`/sheet/${sheetInfo.id}`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      navigate(`/sheet/${sheetInfo.id}`);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                                  >
                                    {sheetInfo.code}
                                  </a>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">No sheet</span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-sm font-medium w-40">
                              <div className="font-bold text-gray-800">
                                {order.orderId || `O-${order.orderType || 'U'}${order.orderNumber || ''}`}
                              </div>
                              {order.customerName && (
                                <div className="text-xs text-gray-500 truncate" title={order.customerName}>
                                  {order.customerName}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-center font-mono text-sm font-semibold w-32">
                              {formatNumber(getPiecesCount(order))}
                            </td>
                            
                            {/* MANUAL MERGED CELL - Only show in first row, span the rest */}
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
                                </div>
                              </td>
                            ) : null}
  
                            {/* REMOVED TRACKING NUMBER CELL */}
                            
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
            {orderList.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-gradient-to-r from-gray-100 to-gray-200">
                  <td className="p-3 text-center text-gray-700 w-12"></td>
                  <td className="p-3 text-left text-gray-700 w-40" colSpan="2">
                    TOTAL ({orderList.length} orders)
                  </td>
                  <td className="p-3 text-center text-blue-700 font-mono bg-blue-100 w-60">
                    {formatNumber(totals.totalPieces)}
                  </td>
                  <td className="p-3 text-center text-gray-700 w-60"></td>
                  <td className="p-3 text-center text-gray-700 w-80"></td>
                  <td className="p-3 text-center text-gray-700 w-32"></td>
                </tr>
              </tfoot>
            )}
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

  // Get sheet type for selected orders
  const selectedSheetType = getSelectedOrdersType();

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

      {/* Bulk Status Update Modal */}
      <BulkStatusUpdateModal
        isOpen={bulkStatusModal.isOpen}
        onClose={closeBulkStatusModal}
        onConfirm={bulkStatusModal.onConfirm}
        selectedCount={selectedOrders.length}
      />

      {/* MAIN CONTAINER */}
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 w-full overflow-x-auto">
        <div className="p-6 min-w-[1000px]">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="text-left">
              <h1 className="text-4xl font-bold text-gray-800 mb-2">Orders Dashboard</h1>
              <p className="text-gray-600">Manage and track all your orders in one place</p>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/sheets')}
                className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-6 py-3 rounded-lg flex items-center gap-3 transition-all shadow-lg font-semibold"
              >
                <FiFileText size={18} />
                View Sheets ({sheets.length})
              </button>
            </div>
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
                  {/* Sheet ID Search - CHANGED FROM ORDER ID */}
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                      <FiSearch size={16} />
                      <span>Sheet ID</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Search by Sheet ID (e.g., B1, G2)..."
                      name="sheetId" // CHANGED: orderId → sheetId
                      value={filters.sheetId}
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

          {/* Placement Error Banner */}
          {placementError && (
            <div ref={placementErrorRef}   id="placement-error-banner"  className="mb-6 animate-pulse">
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
 {selectedOrders.length > 0 &&<div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 p-6 bg-white rounded-2xl shadow-lg border border-gray-200">
  <div className="flex flex-wrap items-center gap-4">
    {selectedOrders.length > 0 && (
      <>
        <button
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg flex items-center gap-3 transition-colors shadow-lg font-semibold"
          onClick={handleDeleteSelected}
        >
          <FiTrash2 size={18} />
          Delete Selected ({selectedOrders.length})
        </button>
        
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-3 transition-colors shadow-lg font-semibold"
          onClick={openBulkStatusModal}
        >
          <FiEdit size={18} />
          Update Status ({selectedOrders.length})
        </button>
        
        {/* SINGLE ADD TO SHEET BUTTON */}
        <button
          className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-6 py-3 rounded-lg flex items-center gap-3 transition-colors shadow-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleCreateSheet}
          disabled={isCreatingSheet || selectedOrders.length === 0 || !areOrdersFromSameTable(selectedOrders)}
          title={!areOrdersFromSameTable(selectedOrders) ? "Select orders from same table only" : ""}
        >
          <FiFileText size={18} />
          {isCreatingSheet ? 'Creating Sheet...' : `Add to ${selectedSheetType || ''} Sheet (${selectedOrders.length})`}
        </button>
        
        {/* PLACE SELECTED ORDERS BUTTON - Now positioned with other buttons */}
        <button
          className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-6 py-3 rounded-lg flex items-center gap-3 transition-colors shadow-lg font-semibold"
          onClick={handlePlaceOrders}
        >
          <span className="text-lg">📩</span>
          Place Selected Orders ({selectedOrders.length})
        </button>
      </>
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
    
    {/* REMOVED the right-aligned Place Orders button */}
  </div>
</div>}

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
                    <div className="flex justify-between">
                      <span>Sheets Created:</span>
                      <span className="font-bold text-blue-700">
                        {sheets.filter(s => s.type === 'Barry').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Orders in Sheets:</span>
                      <span className="font-bold text-blue-700">
                        {barryOrders.filter(o => o.sheetCode).length}
                      </span>
                    </div>
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
                    <div className="flex justify-between">
                      <span>Sheets Created:</span>
                      <span className="font-bold text-green-700">
                        {sheets.filter(s => s.type === 'Gawy').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Orders in Sheets:</span>
                      <span className="font-bold text-green-700">
                        {gawyOrders.filter(o => o.sheetCode).length}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Combined Summary */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border-2 border-purple-300">
                <h4 className="font-bold text-purple-800 mb-4 text-lg text-center">Combined Total</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-purple-600 font-medium">Total Orders</div>
                    <div className="text-2xl font-bold text-purple-700">{barryOrders.length + gawyOrders.length}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-purple-600 font-medium">Total Pieces</div>
                    <div className="text-2xl font-bold text-purple-700">{barryTotals.totalPieces + gawyTotals.totalPieces}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-purple-600 font-medium">Total Sheets</div>
                    <div className="text-2xl font-bold text-purple-700">{sheets.length}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-purple-600 font-medium">Orders in Sheets</div>
                    <div className="text-2xl font-bold text-purple-700">
                      {orders.filter(o => o.sheetCode).length}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}