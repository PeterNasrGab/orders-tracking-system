import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";
import { FiDollarSign, FiPackage, FiUpload, FiAlertCircle, FiCheck, FiX, FiUser, FiShoppingCart, FiExternalLink, FiEye } from "react-icons/fi";
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

export default function DistributionDashboard() {
  const { isAdmin } = useAuth();
  const [distributionData, setDistributionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [toastCounter, setToastCounter] = useState(0);
  const { settings } = useSystemSettings();
  
  // State for editable fields
  const [editableFields, setEditableFields] = useState({});

  // Toast functions
  const showToast = (message, type = "info") => {
    const id = `toast-${Date.now()}-${toastCounter}`;
    setToastCounter(prev => prev + 1);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Handle input changes for editable fields
  const handleInputChange = (clientName, orderType, field, value) => {
    const key = `${clientName}-${orderType}`;
    setEditableFields(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  // Get the current value for an input field
  const getInputValue = (clientName, orderType, field, defaultValue = 0) => {
    const key = `${clientName}-${orderType}`;
    if (editableFields[key] && editableFields[key][field] !== undefined) {
      return editableFields[key][field];
    }
    return defaultValue;
  };

  // Fetch upload records from Supabase for distribution orders only
  const fetchUploadRecordsForDistributionOrders = async (orderIds, clientName, clientCode) => {
    try {
      // Get all uploads for this client
      const { data: allUploads, error } = await supabase
        .from('uploads')
        .select('*')
        .or(`client_name.eq.${clientName},client_code.eq.${clientCode}`)
        .order('created_at', { ascending: false });

      if (error) {
        return [];
      }

      if (!allUploads) return [];

      // Filter uploads to only include those related to distribution orders
      const distributionUploads = allUploads.filter(upload => {
        // Check if upload order_id matches any of the distribution order IDs
        return orderIds.some(orderId => 
          upload.order_id === orderId || 
          upload.firestore_order_id === orderId
        );
      });

      return distributionUploads;
    } catch (error) {
      return [];
    }
  };

  const calculateLostsAndTotalSR = (order) => {
  const lostsSR = Number(order.losts || 0);
  const totalSR = Number(order.totalSR || 0);
  const paidToWebsite = Number(order.paidToWebsite || 0);
  const discountSR = Number(order.discountSR || 0);
  const couponSR = Number(order.couponSR || 0);
  const discount2SR = Number(order.discount2SR || 0);
  const discount3SR = Number(order.discount3SR || 0);
  
  // Calculate net SR after all deductions (for conversion rate calculation)
  const netSR = totalSR - (discountSR + couponSR + discount2SR + discount3SR + paidToWebsite);
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
  
  // Calculate losts in EGP for outstanding calculations
  const lostsEGP = (lostsSR * conversionRate);
  
  return {
    lostsEGP: Math.max(0, lostsEGP),
    lostsSR: lostsSR,
    conversionRate: conversionRate
  };
};

// Update the data loading section to include discount calculations
useEffect(() => {
  const fetchDistributionData = async () => {
    try {
      setLoading(true);
      
      // Get all orders first (no complex query that requires index)
      const ordersQuery = query(collection(db, "orders"));
      
      const ordersSnapshot = await getDocs(ordersQuery);
      const allOrders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter orders client-side for distribution phase
      const distributionOrders = allOrders.filter(order => 
        order.status === "In Distribution" || order.status === "Shipped to clients"
      );

      // Group orders by client and order type
      const clientsMap = new Map();

      // First, create client structure
      distributionOrders.forEach(order => {
        const clientName = order.customerName || "Unknown Client";
        const clientCode = order.customerCode || "";
        const orderType = order.orderType || "Unknown";
        const clientType = order.clientType || "Retail";
        const orderId = order.orderId || `Order-${order.id}`;
        const orderPieces = Number(order.pieces) || 0;
        const orderTotal = Number(order.totalEGP) || 0;
        const orderDeposit = Number(order.depositEGP) || 0;
        const orderPaidToWebsite = Number(order.paidToWebsite) || 0;
        const orderTotalSR = Number(order.totalSR) || 0;
        const paidAfterDelivery = Number(order.paidAfterDelivery) || 0;
        const lostsSR = Number(order.losts) || 0;
        const outstandingAmount = Number(order.outstanding) || 0; // Static value from order data
        
        // Discount fields
        const discountSR = Number(order.discountSR) || 0;
        const couponSR = Number(order.couponSR) || 0;
        const discount2SR = Number(order.discount2SR) || 0;
        const discount3SR = Number(order.discount3SR) || 0;
        const totalDiscounts = discountSR + couponSR + discount2SR + discount3SR;

        const clientKey = `${clientName}-${orderType}`;
        
        if (!clientsMap.has(clientKey)) {
          clientsMap.set(clientKey, {
            client: clientName,
            orderType: orderType,
            clientCode: clientCode,
            clientType: clientType,
            orders: [],
            orderIds: [],
            totalPieces: 0,
            totalPrices: 0, // EGP (will be calculated as totalPrices - lostsEGP)
            totalDeposits: 0, // EGP
            totalDiscounts: 0, // SR (sum of all discount types)
            outstandingAmount: 0, // EGP (static from order data)
            paidAfterDelivery: 0, // EGP
            outstanding: 0, // EGP (outstandingAmount - paidAfterDelivery - lostsEGP)
            paidToWebsite: 0, // EGP
            lostsEGP: 0, // EGP (converted from SR)
            lostsSR: 0, // SR (original value)
            uploads: [],
            totalSR: 0, // SR (sum of orders totalSR)
            conversionRate: 0
          });
        }

        const clientData = clientsMap.get(clientKey);

        // Calculate losts conversion for this order
        const { lostsEGP, conversionRate } = calculateLostsAndTotalSR({
          ...order,
          orderType: orderType,
          clientType: clientType
        });

        // Add order details
        clientData.orders.push({
          id: orderId,
          pieces: orderPieces,
          price: orderTotal,
          deposit: orderDeposit,
          firestoreId: order.id,
          totalSR: orderTotalSR, // Keep original totalSR
          lostsSR: lostsSR,
          outstandingAmount: outstandingAmount, // Store static outstanding amount
          discountSR: discountSR,
          couponSR: couponSR,
          discount2SR: discount2SR,
          discount3SR: discount3SR,
          totalDiscounts: totalDiscounts,
          conversionRate: conversionRate
        });

        // Add order ID for upload filtering
        clientData.orderIds.push(orderId);

        // Update totals
        clientData.totalPieces += orderPieces;
        clientData.totalPrices += (orderTotal - lostsEGP); // EGP (totalPrices - lostsEGP)
        clientData.totalDeposits += orderDeposit; // EGP
        clientData.totalDiscounts += totalDiscounts; // SR
        clientData.paidToWebsite += orderPaidToWebsite; // EGP
        clientData.totalSR += orderTotalSR; // SR (sum of orders totalSR)
        clientData.lostsSR = lostsSR; // SR
        clientData.lostsEGP = lostsEGP; // EGP
        clientData.outstandingAmount += outstandingAmount; // EGP (static from order data)
        clientData.paidAfterDelivery = paidAfterDelivery; // EGP
        clientData.conversionRate = conversionRate; // Store the conversion rate
      });

      // Convert map to array and fetch upload records for each client
      const distributionArray = [];
      
      for (const [clientKey, clientData] of clientsMap.entries()) {
        // Fetch upload records for distribution orders only
        const uploadRecords = await fetchUploadRecordsForDistributionOrders(
          clientData.orderIds, 
          clientData.client, 
          clientData.clientCode
        );
        
        // Calculate final outstanding (outstandingAmount - paidAfterDelivery - lostsEGP)
        const finalOutstanding = clientData.outstandingAmount - clientData.paidAfterDelivery - clientData.lostsEGP;
        
        distributionArray.push({
          ...clientData,
          outstanding: finalOutstanding,
          // Set upload records from Supabase (only distribution orders)
          uploads: uploadRecords
        });
      }

      // Sort clients alphabetically and by order type
      distributionArray.sort((a, b) => {
        if (a.client !== b.client) {
          return a.client.localeCompare(b.client);
        }
        return a.orderType.localeCompare(b.orderType);
      });

      setDistributionData(distributionArray);
      showToast(`✅ Loaded ${distributionArray.length} order groups with ${distributionOrders.length} distribution orders`, "success");

    } catch (error) {
      showToast(`❌ Failed to load distribution data: ${error.message}`, "error");
    } finally {
      setLoading(false);
      }
    };

  fetchDistributionData();
}, []);
// Update client data in Firestore with correct calculations
const handleUpdateClientData = async (clientName, orderType, field, value) => {
  try {
    const client = distributionData.find(c => c.client === clientName && c.orderType === orderType);
    if (!client) {
      showToast(`Client ${clientName} - ${orderType} not found`, "error");
      return;
    }

    // Update in Firestore - update all orders for this client and order type
    const updatePromises = client.orders.map(async (order) => {
      try {
        const orderRef = doc(db, "orders", order.firestoreId);
        
        // If updating losts, update the losts field in SR
        if (field === 'losts') {
          await updateDoc(orderRef, {
            losts: Number(value) || 0,
            lastUpdated: new Date()
          });
        } else if (field === 'paidAfterDelivery') {
          await updateDoc(orderRef, {
            paidAfterDelivery: Number(value) || 0,
            lastUpdated: new Date()
          });
        }
      } catch (error) {
        throw error;
      }
    });

    await Promise.all(updatePromises);

    // Update local state with proper calculations
    setDistributionData(prev => 
      prev.map(clientData => {
        if (clientData.client === clientName && clientData.orderType === orderType) {
          if (field === 'losts') {
            // For losts field (input in SR), convert to EGP for calculations
            const newLostsSR = Number(value) || 0;
            
            // Recalculate lostsEGP for all orders using the new lostsSR value
            let totalLostsEGP = 0;
            const updatedOrders = clientData.orders.map(order => {
              const { lostsEGP } = calculateLostsAndTotalSR({
                ...order,
                losts: newLostsSR,
                orderType: orderType,
                clientType: clientData.clientType
              });
              totalLostsEGP = lostsEGP;
              return {
                ...order,
                lostsSR: newLostsSR
              };
            });

            // Recalculate totalPrices (totalPrices - lostsEGP)
            const originalTotalPrices = clientData.orders.reduce((sum, order) => sum + order.price, 0);
            const newTotalPrices = originalTotalPrices - totalLostsEGP;
            
            // Calculate new outstanding (outstandingAmount - paidAfterDelivery - lostsEGP)
            const newOutstanding = clientData.outstandingAmount - clientData.paidAfterDelivery - totalLostsEGP;
            
            return {
              ...clientData,
              lostsSR: newLostsSR,
              lostsEGP: totalLostsEGP,
              totalPrices: newTotalPrices,
              outstanding: newOutstanding,
              orders: updatedOrders
            };
          } else if (field === 'paidAfterDelivery') {
            // For paidAfterDelivery field (input in EGP)
            const newPaidAfterDelivery = Number(value) || 0;
            
            // Calculate new outstanding (outstandingAmount - paidAfterDelivery - lostsEGP)
            const newOutstanding = clientData.outstandingAmount - newPaidAfterDelivery - clientData.lostsEGP;
            
            return {
              ...clientData,
              paidAfterDelivery: newPaidAfterDelivery,
              outstanding: newOutstanding
            };
          }
          return clientData;
        }
        return clientData;
      })
    );

    showToast(`✅ ${field} updated for ${clientName} - ${orderType}`, "success");
  } catch (error) {
    showToast(`❌ Failed to update ${field}: ${error.message}`, "error");
  }
};
  // Refresh upload records for a specific client and order type
  const refreshUploadRecords = async (clientName, orderType) => {
    try {
      showToast(`Refreshing upload records for ${clientName} - ${orderType}...`, "info");
      const client = distributionData.find(c => c.client === clientName && c.orderType === orderType);
      if (!client) return;

      const uploadRecords = await fetchUploadRecordsForDistributionOrders(
        client.orderIds, 
        clientName, 
        client.clientCode
      );
      
      setDistributionData(prev =>
        prev.map(c =>
          c.client === clientName && c.orderType === orderType
            ? { ...c, uploads: uploadRecords }
            : c
        )
      );
      
      showToast(`✅ Updated upload records for ${clientName} - ${orderType}`, "success");
    } catch (error) {
      showToast("❌ Failed to refresh upload records", "error");
    }
  };

  // Get status badge style
  const getStatusBadge = (status) => {
    const currentStatus = status || "Under Approval";
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    
    switch (currentStatus) {
      case "Approved":
        return `${baseClasses} bg-green-100 text-green-800`;
      case "Rejected":
        return `${baseClasses} bg-red-100 text-red-800`;
      case "Under Approval":
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  // Get order type badge style
  const getOrderTypeBadge = (orderType) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    
    switch (orderType) {
      case "B":
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case "G":
        return `${baseClasses} bg-green-100 text-green-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  // Render the distribution table
  const renderDistributionTable = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (distributionData.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <FiPackage className="mx-auto text-4xl mb-4 text-gray-300" />
          <p className="text-lg font-medium">No distribution data found</p>
          <p className="text-sm">Orders in distribution phase will appear here</p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Table Header */}
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <FiPackage className="text-2xl" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Distribution Dashboard</h2>
                <p className="text-white/80">Manage client orders in distribution phase - Split by Barry & Gawy</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{distributionData.length}</div>
              <div className="text-white/80 text-sm">Order Groups</div>
            </div>
          </div>
        </div>

       {/* Table Content */}
<div className="w-full overflow-x-auto">
  <table className="w-full border-collapse text-sm">
    {/* Table Header */}
    <thead>
      <tr className="bg-gray-50 text-left border-b border-gray-200">
        <th className="p-4 font-semibold text-gray-700 w-48">Client</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-20">Type</th>
        <th className="p-4 font-semibold text-gray-700 w-64">Orders IDs / Pieces</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-24">Total Pieces</th>
        <th className="p-4 font-semibold text-gray-700 w-64">Orders IDs / Prices</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-32">Total Prices EGP</th>
        <th className="p-4 font-semibold text-gray-700 w-64">Orders IDs / Deposits</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-32">Total Deposits EGP</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-32">Total Discounts SR</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-32">Outstanding Amount EGP</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-40">Paid After Delivery EGP</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-32">Outstanding EGP</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-32">Paid to Website EGP</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-40">Losts SR</th>
        <th className="p-4 font-semibold text-gray-700 text-center w-32">Total SR</th>
        <th className="p-4 font-semibold text-gray-700 w-64">Upload Details</th>
      </tr>
    </thead>
    <tbody>
      {distributionData.map((client, index) => (
        <tr 
          key={`${client.client}-${client.orderType}`} 
          className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
            index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
          }`}
        >
          {/* Client Name - w-48 */}
          <td className="p-4 w-48">
            <div className="flex items-center space-x-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <FiUser className="text-purple-600" size={16} />
              </div>
              <span className="font-medium text-gray-900">{client.client}</span>
            </div>
          </td>

          {/* Order Type - w-20 */}
          <td className="p-4 text-center w-20">
            <span className={getOrderTypeBadge(client.orderType)}>
              {client.orderType === "B" ? "Barry" : client.orderType === "G" ? "Gawy" : client.orderType}
            </span>
          </td>

          {/* Orders IDs / Pieces - w-64 */}
          <td className="p-4 w-64">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {client.orders.map((order, idx) => (
                <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-b-0">
                  <span className="font-mono text-sm text-blue-600">{order.id}</span>
                  <span className="font-mono text-sm font-semibold text-gray-700">{order.pieces}</span>
                </div>
              ))}
            </div>
          </td>

          {/* Total Pieces - w-24 */}
          <td className="p-4 text-center w-24">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <span className="font-mono text-lg font-bold text-blue-700">{client.totalPieces}</span>
            </div>
          </td>

          {/* Orders IDs / Prices - w-64 */}
          <td className="p-4 w-64">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {client.orders.map((order, idx) => (
                <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-b-0">
                  <span className="font-mono text-sm text-blue-600">{order.id}:</span>
                  <span className="font-mono text-sm font-semibold text-green-600">
                    {order.price.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </td>

          {/* Total Prices EGP - w-32 */}
          <td className="p-4 text-center w-32">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <span className="font-mono text-lg font-bold text-green-700">
                {client.totalPrices.toFixed(2)}
              </span>
            </div>
          </td>

          {/* Orders IDs / Deposits - w-64 */}
          <td className="p-4 w-64">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {client.orders.map((order, idx) => (
                <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-b-0">
                  <span className="font-mono text-sm text-blue-600">{order.id}:</span>
                  <span className="font-mono text-sm font-semibold text-orange-600">
                    {order.deposit.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </td>

          {/* Total Deposits EGP - w-32 */}
          <td className="p-4 text-center w-32">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <span className="font-mono text-lg font-bold text-orange-700">
                {client.totalDeposits.toFixed(2)}
              </span>
            </div>
          </td>

          {/* Total Discounts SR - w-32 */}
          <td className="p-4 text-center w-32">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <span className="font-mono text-lg font-bold text-purple-700">
                {client.totalDiscounts.toFixed(2)}
              </span>
            </div>
          </td>

          {/* Outstanding Amount EGP - w-32 */}
          <td className="p-4 text-center w-32">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <span className="font-mono text-lg font-bold text-yellow-700">
                {client.outstandingAmount.toFixed(2)}
              </span>
            </div>
          </td>

          {/* Paid After Delivery EGP - w-40 */}
          <td className="p-4 text-center w-40">
            <input
              type="number"
              value={getInputValue(client.client, client.orderType, 'paidAfterDelivery', client.paidAfterDelivery || 0)}
              onChange={(e) => {
                const value = e.target.value;
                handleInputChange(client.client, client.orderType, 'paidAfterDelivery', value);
              }}
              onBlur={(e) => handleUpdateClientData(client.client, client.orderType, 'paidAfterDelivery', e.target.value)}
              className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-center font-mono"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </td>

          {/* Outstanding EGP - w-32 */}
          <td className="p-4 text-center w-32">
            <div className={`border rounded-lg p-3 ${
              client.outstanding > 0 
                ? 'bg-red-50 border-red-200 text-red-700' 
                : 'bg-green-50 border-green-200 text-green-700'
            }`}>
              <span className="font-mono text-lg font-bold">
                {client.outstanding.toFixed(2)}
              </span>
            </div>
          </td>

          {/* Paid to Website EGP - w-32 */}
          <td className="p-4 text-center w-32">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <span className="font-mono text-lg font-bold text-blue-700">
                {client.paidToWebsite.toFixed(2)}
              </span>
            </div>
          </td>

          {/* Losts SR - w-40 */}
          <td className="p-4 text-center w-40">
            <div className="space-y-1">
              <input
                type="number"
                value={getInputValue(client.client, client.orderType, 'losts', client.lostsSR || 0)}
                onChange={(e) => {
                  const value = e.target.value;
                  handleInputChange(client.client, client.orderType, 'losts', value);
                }}
                onBlur={(e) => handleUpdateClientData(client.client, client.orderType, 'losts', e.target.value)}
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-center font-mono"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
              <div className="text-xs text-gray-500">
                {client.lostsEGP?.toFixed(2)} EGP
              </div>
            </div>
          </td>

          {/* Total SR - w-32 */}
          <td className="p-4 text-center w-32">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <span className="font-mono text-lg font-bold text-blue-700">
                {client.totalSR.toFixed(2)}
              </span>
            </div>
          </td>

          {/* Upload Details - w-64 */}
          <td className="p-4 w-64">
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-gray-600">
                  Uploads ({client.uploads?.length || 0})
                </span>
                <button
                  onClick={() => refreshUploadRecords(client.client, client.orderType)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded transition-colors"
                >
                  Refresh
                </button>
              </div>
              
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {client.uploads && client.uploads.length > 0 ? (
                  client.uploads.map((upload) => (
                    <div key={upload.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className={getStatusBadge(upload.status)}>
                            {upload.status || "Under Approval"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {upload.order_id}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {upload.payment_amount} EGP • {new Date(upload.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Link
                        to={`/upload/${upload.id}`}
                        className="flex items-center space-x-1 bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs transition-colors ml-2 flex-shrink-0"
                      >
                        <FiEye size={12} />
                        <span>View</span>
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-500 text-center py-2">
                    No distribution uploads found
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
    
    {/* Totals Footer */}
    {distributionData.length > 0 && (
      <tfoot>
        <tr className="font-bold bg-gradient-to-r from-gray-100 to-gray-200">
          {/* Client - w-48 */}
          <td className="p-4 w-48"></td>
          
          {/* Type - w-20 */}
          <td className="p-4 w-20"></td>
          
          {/* Orders IDs / Pieces - w-64 */}
          <td className="p-4 w-64"></td>
          
          {/* Total Pieces - w-24 */}
          <td className="p-4 text-center text-blue-700 font-mono bg-blue-100 border border-blue-200 w-24">
            {distributionData.reduce((sum, client) => sum + client.totalPieces, 0)}
          </td>
          
          {/* Orders IDs / Prices - w-64 */}
          <td className="p-4 w-64"></td>
          
          {/* Total Prices EGP - w-32 */}
          <td className="p-4 text-center text-green-700 font-mono bg-green-100 border border-green-200 w-32">
            {distributionData.reduce((sum, client) => sum + client.totalPrices, 0).toFixed(2)}
          </td>
          
          {/* Orders IDs / Deposits - w-64 */}
          <td className="p-4 w-64"></td>
          
          {/* Total Deposits EGP - w-32 */}
          <td className="p-4 text-center text-orange-700 font-mono bg-orange-100 border border-orange-200 w-32">
            {distributionData.reduce((sum, client) => sum + client.totalDeposits, 0).toFixed(2)}
          </td>
          
          {/* Total Discounts SR - w-32 */}
          <td className="p-4 text-center text-purple-700 font-mono bg-purple-100 border border-purple-200 w-32">
            {distributionData.reduce((sum, client) => sum + client.totalDiscounts, 0).toFixed(2)}
          </td>
          
          {/* Outstanding Amount EGP - w-32 */}
          <td className="p-4 text-center text-yellow-700 font-mono bg-yellow-100 border border-yellow-200 w-32">
            {distributionData.reduce((sum, client) => sum + client.outstandingAmount, 0).toFixed(2)}
          </td>
          
          {/* Paid After Delivery EGP - w-40 */}
          <td className="p-4 text-center text-indigo-700 font-mono bg-indigo-100 border border-indigo-200 w-40">
            {distributionData.reduce((sum, client) => sum + (client.paidAfterDelivery || 0), 0).toFixed(2)}
          </td>
          
          {/* Outstanding EGP - w-32 */}
          <td className="p-4 text-center text-red-700 font-mono bg-red-100 border border-red-200 w-32">
            {distributionData.reduce((sum, client) => sum + client.outstanding, 0).toFixed(2)}
          </td>
          
          {/* Paid to Website EGP - w-32 */}
          <td className="p-4 text-center text-blue-700 font-mono bg-blue-100 border border-blue-200 w-32">
            {distributionData.reduce((sum, client) => sum + client.paidToWebsite, 0).toFixed(2)}
          </td>
          
          {/* Losts SR - w-40 */}
          <td className="p-4 text-center text-pink-700 font-mono bg-pink-100 border border-pink-200 w-40">
            {distributionData.reduce((sum, client) => sum + (client.lostsSR || 0), 0).toFixed(2)}
          </td>
          
          {/* Total SR - w-32 */}
          <td className="p-4 text-center text-cyan-700 font-mono bg-cyan-100 border border-cyan-200 w-32">
            {distributionData.reduce((sum, client) => sum + client.totalSR, 0).toFixed(2)}
          </td>
          
          {/* Upload Details - w-64 */}
          <td className="p-4 w-64"></td>
        </tr>
      </tfoot>
    )}
  </table>
</div>
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

      {/* Main Container */}
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Distribution Dashboard</h1>
            <p className="text-gray-600">Track and manage client orders in distribution phase</p>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Order Groups</p>
                  <p className="text-2xl font-bold text-gray-900">{distributionData.length}</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-lg">
                  <FiUser className="text-purple-600 text-xl" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Pieces</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {distributionData.reduce((sum, client) => sum + client.totalPieces, 0)}
                  </p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <FiPackage className="text-blue-600 text-xl" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {distributionData.reduce((sum, client) => sum + client.totalPrices, 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <FiDollarSign className="text-green-600 text-xl" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Outstanding</p>
                  <p className="text-2xl font-bold text-red-600">
                    {distributionData.reduce((sum, client) => sum + client.outstanding, 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-red-100 p-3 rounded-lg">
                  <FiAlertCircle className="text-red-600 text-xl" />
                </div>
              </div>
            </div>
          </div>

          {/* Main Table */}
          {renderDistributionTable()}
        </div>
      </div>
    </>
  );
}