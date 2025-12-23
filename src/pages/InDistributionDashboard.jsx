import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  getDoc,
} from "firebase/firestore";
import { supabase } from "../supabase";
import { Link } from "react-router-dom";
import { FiDollarSign, FiPackage, FiUpload, FiAlertCircle, FiCheck, FiX, FiUser, FiEye, FiTag, FiTruck, FiTrendingUp, FiCreditCard, FiDownload, FiActivity } from "react-icons/fi";
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
  
  // State for shipping fees
  const [shippingFees, setShippingFees] = useState(0);
  
  // State for sheets data
  const [sheetsData, setSheetsData] = useState([]);
  
  // Ref to track if we've loaded the saved shipping fees
  const hasLoadedSavedFees = useRef(false);
  
  // Ref to track initial load
  const isInitialLoad = useRef(true);
  
  // State for temporary losts editing values
  const [tempLostsValues, setTempLostsValues] = useState({});
  
  // State for temporary paid after delivery editing values
  const [tempPaidAfterDeliveryValues, setTempPaidAfterDeliveryValues] = useState({});

  // Toast functions
  const showToast = (message, type = "info") => {
    const id = `toast-${Date.now()}-${toastCounter}`;
    setToastCounter(prev => prev + 1);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Handle shipping fees change with auto-save
  const handleShippingFeesChange = (value) => {
    const numValue = Number(value) || 0;
    setShippingFees(numValue);
    
    // Save to localStorage immediately
    localStorage.setItem('distribution_shipping_fees', numValue.toString());
    
    // Show auto-save notification
    showToast("Shipping fees auto-saved", "info");
  };

  // Clear shipping fees manually
  const handleClearShippingFees = () => {
    setShippingFees(0);
    localStorage.removeItem('distribution_shipping_fees');
    showToast("Shipping fees cleared", "info");
  };


// Also update the fetchData function to ensure we have sheets data
const fetchSheetsData = async () => {
  try {
    const sheetsSnapshot = await getDocs(collection(db, "sheets"));
    const sheetsList = sheetsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        dynamicRows: data.dynamicRows || [],
        orders: data.orders || []
      };
    });
    
    setSheetsData(sheetsList);
    return sheetsList; // Return the sheets data
  } catch (error) {
    showToast("Failed to load sheets data", "warning");
    return [];
  }
};

const calculateDynamicRowValuesForOrders = (orderIds) => {
  let totalCouponsSR = 0;
  let totalPaidToWebsiteSR = 0;
  
  // Create a Set of order IDs for faster lookup
  const orderIdSet = new Set(orderIds);
  
  // Find sheets that contain these distribution orders
  sheetsData.forEach(sheet => {
    if (sheet.orders && Array.isArray(sheet.orders)) {
      // Check if any order in this sheet is in our distribution orders
      const hasDistributionOrder = sheet.orders.some(order => 
        orderIdSet.has(order.id)
      );
      
      if (hasDistributionOrder) {
        // Calculate values from dynamic rows
        if (sheet.dynamicRows && Array.isArray(sheet.dynamicRows)) {
          sheet.dynamicRows.forEach(row => {
            totalCouponsSR += Number(row.couponSR) || 0;
            totalPaidToWebsiteSR += Number(row.paidToWebsite) || 0;
          });
        }
      }
    }
  });
  
  return {
    couponsSR: totalCouponsSR,
    paidToWebsiteSR: totalPaidToWebsiteSR
  };
};

  // Calculate conversion rate based on settings
  const calculateConversionRate = (orderType, clientType, totalSR) => {
    const threshold = settings?.wholesaleThreshold || 1500;
    
    if (clientType === "Wholesale") {
      if (orderType === "B") {
        return totalSR > threshold 
          ? (settings?.barryWholesaleAbove1500 || 12.25)
          : (settings?.barryWholesaleBelow1500 || 12.5);
      } else if (orderType === "G") {
        return totalSR > threshold
          ? (settings?.gawyWholesaleAbove1500 || 13.5)
          : (settings?.gawyWholesaleBelow1500 || 14);
      }
    } else {
      // Retail pricing
      return orderType === "B" 
        ? (settings?.barryRetail || 14.5)
        : (settings?.gawyRetail || 15.5);
    }
    return 1;
  };

  // Calculate all financial metrics for an order
  const calculateOrderFinancials = (order) => {
    const totalSR = Number(order.totalSR) || 0;
    const discountSR = Number(order.discountSR) || 0;
    const discount2SR = Number(order.discount2SR) || 0;
    const discount3SR = Number(order.discount3SR) || 0;
    const lostsSR = Number(order.losts) || 0;
    const extraSR = Number(order.extraSR) || 0;
    
    const orderType = order.orderType || "B";
    const clientType = order.clientType || "Retail";
    
    // Calculate conversion rate
    const conversionRate = calculateConversionRate(orderType, clientType, totalSR);
    
    // Calculate net SR after discounts and losts
    const netSR = totalSR - discountSR - discount2SR - discount3SR - lostsSR;
    
    // Calculate base EGP
    const baseEGP = netSR * conversionRate;
    
    // Calculate extra EGP (extraSR * 2)
    const extraEGP = extraSR * 2;
    
    // Calculate total EGP
    const totalEGP = baseEGP + extraEGP;
    
    // Calculate losts EGP
    const lostsEGP = lostsSR * conversionRate;
    
    // Get shipping from settings (fixed amount per order)
    const shippingPerOrder = settings?.shipping || 12.7;
    const shippingEGP = shippingPerOrder; // Fixed amount per order
    
    return {
      totalSR,
      discountSR,
      discount2SR,
      discount3SR,
      lostsSR,
      extraSR,
      netSR,
      baseEGP,
      extraEGP,
      totalEGP,
      lostsEGP,
      shippingEGP,
      conversionRate,
      totalDiscounts: discountSR + discount2SR + discount3SR
    };
  };

  // Calculate aggregates for a client
  const calculateClientAggregates = (client) => {
    let aggregates = {
      totalSR: 0,
      totalEGP: 0,
      totalDiscounts: 0,
      lostsSR: 0,
      lostsEGP: 0,
      shippingEGP: 0,
      totalOrders: 0,
      conversionRate: 0
    };
    
    client.orders.forEach(order => {
      // Use the order's existing financials (they should be up-to-date)
      aggregates.totalSR += order.totalSR || 0;
      aggregates.totalEGP += order.totalEGP || 0;
      aggregates.totalDiscounts += (order.discountSR || 0) + (order.discount2SR || 0) + (order.discount3SR || 0);
      aggregates.lostsSR += order.lostsSR || 0;
      aggregates.lostsEGP += order.lostsEGP || 0;
      aggregates.shippingEGP += order.shippingEGP || 0;
      aggregates.totalOrders += 1;
    });
    
    // Average conversion rate
    if (client.orders.length > 0) {
      const netSR = aggregates.totalSR - aggregates.totalDiscounts - aggregates.lostsSR;
      aggregates.conversionRate = netSR > 0 ? aggregates.totalEGP / netSR : 0;
    }
    
    return aggregates;
  };

  // Calculate global totals
  const calculateGlobalTotals = () => {
    let totals = {
      totalSR: 0,
      totalEGP: 0,
      totalDiscounts: 0,
      lostsSR: 0,
      lostsEGP: 0,
      shippingEGP: 0,
      totalOrders: 0,
      totalClients: distributionData.length
    };
    
    // Get all order IDs from distribution data
    const allOrderIds = [];
    distributionData.forEach(client => {
      client.orders.forEach(order => {
        allOrderIds.push(order.firestoreId);
      });
    });
    
    // Calculate dynamic row values for all distribution orders
    const dynamicRowValues = calculateDynamicRowValuesForOrders(allOrderIds);
    
    distributionData.forEach(client => {
      const clientAgg = calculateClientAggregates(client);
      
      totals.totalSR += clientAgg.totalSR;
      totals.totalEGP += clientAgg.totalEGP;
      totals.totalDiscounts += clientAgg.totalDiscounts;
      totals.lostsSR += clientAgg.lostsSR;
      totals.lostsEGP += clientAgg.lostsEGP;
      totals.shippingEGP += clientAgg.shippingEGP;
      totals.totalOrders += clientAgg.totalOrders;
    });
    
    // Add shipping fees (from saved input)
    const shippingFeesSR = shippingFees;
    const shippingFeesEGP = shippingFeesSR * (settings?.shipping || 12.7);
    totals.shippingEGP += shippingFeesEGP;
    
    // Convert dynamic row values from SR to EGP
    const couponsEGP = dynamicRowValues.couponsSR > 0 ? dynamicRowValues.couponsSR * (settings?.coupon || 12) : 0;
  const paidToWebsiteEGP = dynamicRowValues.paidToWebsiteSR > 0 ? dynamicRowValues.paidToWebsiteSR * (settings?.paidToWebsite || 12) : 0;

    
    // Calculate total profit
    totals.totalProfit = totals.totalEGP - 
                       paidToWebsiteEGP - 
                       totals.shippingEGP - 
                       totals.lostsEGP - 
                       couponsEGP;
    
    return {
      ...totals,
      shippingFeesSR,
      shippingFeesEGP,
      couponsSR: dynamicRowValues.couponsSR,
      couponsEGP,
      paidToWebsiteSR: dynamicRowValues.paidToWebsiteSR,
      paidToWebsiteEGP,
      totalProfit: totals.totalProfit
    };
  };

  // Fetch upload records from Supabase for distribution orders only
  const fetchUploadRecordsForDistributionOrders = async (orderIds, clientName, clientCode) => {
    try {
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

  // Load saved shipping fees from localStorage
  useEffect(() => {
    if (!hasLoadedSavedFees.current) {
      const savedFees = localStorage.getItem('distribution_shipping_fees');
      if (savedFees) {
        const fees = parseFloat(savedFees);
        if (!isNaN(fees)) {
          setShippingFees(fees);
        }
      }
      hasLoadedSavedFees.current = true;
    }
  }, []);

  // Update the data loading section
  useEffect(() => {
    const fetchDistributionData = async () => {
      try {
        setLoading(true);
        
        // Fetch sheets data first
        const sheetsList = await fetchSheetsData(); // This returns the sheets data
      
        
        // Get all orders first
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
          const orderDeposit = Number(order.depositEGP) || 0;
          const paidAfterDelivery = Number(order.paidAfterDelivery) || 0;
          const outstandingAmount = Number(order.outstanding) || 0;
          const extraSR = Number(order.extraSR) || 0;
          
           const sheetInfo = findOrderInSheets(order.id, sheetsList);
          const clientKey = `${clientName}-${orderType}`;
          
          if (!clientsMap.has(clientKey)) {
            clientsMap.set(clientKey, {
              client: clientName,
              orderType: orderType,
              clientCode: clientCode,
              clientType: clientType,
              sheetCodes: new Set(),
              orders: [],
              orderIds: [],
              totalPieces: 0,
              totalDeposits: 0,
              paidAfterDelivery: 0,
              outstandingAmount: 0,
              uploads: []
            });
          }

          const clientData = clientsMap.get(clientKey);
           if (sheetInfo?.code) {
              clientData.sheetCodes.add(sheetInfo.code);
            }


          // Calculate financials for this order
          const financials = calculateOrderFinancials({
            ...order,
            orderType: orderType,
            clientType: clientType
          });

          // Add order details
          const orderData = {
            id: orderId,
            pieces: orderPieces,
            price: financials.totalEGP,
            deposit: orderDeposit,
            firestoreId: order.id,
            totalSR: financials.totalSR,
            lostsSR: financials.lostsSR,
            extraSR: extraSR,
            outstandingAmount: outstandingAmount,
            paidAfterDelivery: paidAfterDelivery,
            totalEGP: financials.totalEGP,
            lostsEGP: financials.lostsEGP,
            shippingEGP: financials.shippingEGP,
            conversionRate: financials.conversionRate,
            sheetCode: sheetInfo?.code || 'No Sheet'
          };
          
          clientData.orders.push(orderData);

          // Add order ID for upload filtering
          clientData.orderIds.push(orderId);

          // Update totals
          clientData.totalPieces += orderPieces;
          clientData.totalDeposits += orderDeposit;
          clientData.outstandingAmount += outstandingAmount;
          clientData.paidAfterDelivery += paidAfterDelivery;
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
          
          // Calculate aggregates for the client
          const aggregates = calculateClientAggregates(clientData);
          
          distributionArray.push({
            ...clientData,
            ...aggregates,
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
        
        // On initial load, save the order hash to localStorage
        if (isInitialLoad.current) {
          // Create a simple hash of current orders
          const orderHash = distributionArray
            .flatMap(client => client.orders)
            .map(order => `${order.id}-${order.totalEGP}-${order.pieces}-${order.lostsSR}`)
            .sort()
            .join('|');
          
          localStorage.setItem('distribution_order_hash', orderHash);
          isInitialLoad.current = false;
                } else {
          // Check if orders have changed by comparing with saved hash
          const currentOrderHash = distributionArray
            .flatMap(client => client.orders)
            .map(order => `${order.id}-${order.totalEGP}-${order.pieces}-${order.lostsSR}`)
            .sort()
            .join('|');
          
          const savedOrderHash = localStorage.getItem('distribution_order_hash');
          
          if (savedOrderHash && currentOrderHash !== savedOrderHash) {
            // Orders have changed - clear shipping fees
            setShippingFees(0);
            localStorage.removeItem('distribution_shipping_fees');
            showToast("Shipping fees cleared - orders have changed", "warning");
            
            // Update the saved hash
            localStorage.setItem('distribution_order_hash', currentOrderHash);
          }
          
          showToast(`✅ Refreshed distribution data`, "info");
        }

      } catch (error) {
        showToast(`❌ Failed to load distribution data: ${error.message}`, "error");
      } finally {
        setLoading(false);
      }
    };

    fetchDistributionData();
  }, []);

// Create a function that checks if an order is in any sheet
const findOrderInSheets = (orderId, sheetsList) => {
  if (!sheetsList || sheetsList.length === 0) return null;
  
  for (const sheet of sheetsList) {
    if (sheet.orders && Array.isArray(sheet.orders)) {
      // Check if order exists in this sheet
      const orderInSheet = sheet.orders.find(order => {
        // Check multiple possible ID fields
        return order.id === orderId || 
               order.firestoreId === orderId ||
               (order.orderId && orderId.includes(order.orderId));
      });
      
      if (orderInSheet) {
        return {
          code: sheet.code,
          id: sheet.id,
          type: sheet.type || 'Unknown',
          totalPieces: sheet.totalPieces || 0
        };
      }
    }
  }
  
  return null;
};


  // Handle losts change - update temp value immediately
  const handleLostsInputChange = (clientName, orderType, value) => {
    const key = `${clientName}-${orderType}`;
    
    // Handle empty string
    if (value === '') {
      setTempLostsValues(prev => ({
        ...prev,
        [key]: {
          value: '',
          isChanged: true
        }
      }));
      return;
    }
    
    const numValue = Number(value);
    
    // Only update if it's a valid number
    if (!isNaN(numValue)) {
      setTempLostsValues(prev => ({
        ...prev,
        [key]: {
          value: numValue,
          isChanged: true
        }
      }));
    }
  };

  // Save losts to Firestore and update local state
  const saveLosts = async (clientName, orderType) => {
    try {
      const key = `${clientName}-${orderType}`;
      const tempData = tempLostsValues[key];
      
      // If no temp value or not changed, do nothing
      if (!tempData || !tempData.isChanged) return;
      
      const newLostsSR = tempData.value === '' ? 0 : Number(tempData.value);
      const client = distributionData.find(c => c.client === clientName && c.orderType === orderType);
      if (!client) return;
      // 1. Update in Firestore - update all orders for this client and order type
      const updatePromises = client.orders.map(async (order) => {
        try {
          const orderRef = doc(db, "orders", order.firestoreId);
          
          // Get order data
          const orderSnap = await getDoc(orderRef);
          const orderData = orderSnap.data();
          
          // Calculate original totalSR (before any losts)
          const totalSR = Number(orderData.totalSR) || 0;
          const discountSR = Number(orderData.discountSR) || 0;
          const discount2SR = Number(orderData.discount2SR) || 0;
          const discount3SR = Number(orderData.discount3SR) || 0;
          const extraSR = Number(orderData.extraSR) || 0;
          
          // Calculate net SR (without losts)
          const netSR = totalSR - discountSR - discount2SR - discount3SR;
          
          // Calculate conversion rate
          const conversionRate = calculateConversionRate(orderType, client.clientType, totalSR);
          
          // Calculate base EGP (without losts)
          const baseEGP = netSR * conversionRate;
          
          // Calculate extra EGP
          const extraEGP = extraSR * 2;
          
          // Calculate NEW total EGP with new losts
          const lostsEGP = newLostsSR * conversionRate;
          const newTotalEGP = baseEGP + extraEGP - lostsEGP;
          
          // Calculate new outstanding amount (totalEGP - depositEGP)
          const depositEGP = Number(orderData.depositEGP) || 0;
          const newOutstanding = Math.max(0, newTotalEGP - depositEGP);
          
          // Ensure we don't get negative or NaN values
          const safeTotalEGP = isNaN(newTotalEGP) ? orderData.totalEGP || 0 : Math.max(0, newTotalEGP);
          const safeOutstanding = isNaN(newOutstanding) ? orderData.outstanding || 0 : Math.max(0, newOutstanding);
          
          await updateDoc(orderRef, {
            losts: newLostsSR,
            totalEGP: safeTotalEGP,
            outstanding: safeOutstanding,
            lostsEGP: lostsEGP,
            lastUpdated: new Date().toISOString()
          });
          
          return { 
            success: true, 
            firestoreId: order.firestoreId,
            newTotalEGP: safeTotalEGP,
            lostsEGP: lostsEGP,
            newOutstanding: safeOutstanding
          };
        } catch (error) {
          throw error;
        }
      });

      const results = await Promise.all(updatePromises);

      // 2. Update local state with PROPER recalculation
      setDistributionData(prev => 
        prev.map(clientData => {
          if (clientData.client === clientName && clientData.orderType === orderType) {
            // Create updated orders with new losts
            const updatedOrders = clientData.orders.map((order, index) => {
              const result = results[index];
              
              if (result && result.success) {
                return {
                  ...order,
                  lostsSR: newLostsSR,
                  lostsEGP: result.lostsEGP || 0,
                  totalEGP: result.newTotalEGP || order.totalEGP,
                  outstandingAmount: result.newOutstanding || order.outstandingAmount,
                  conversionRate: calculateConversionRate(
                    clientData.orderType, 
                    clientData.clientType, 
                    order.totalSR || 0
                  )
                };
              }
              
              // Fallback calculation if result not available
              const conversionRate = calculateConversionRate(
                clientData.orderType, 
                clientData.clientType, 
                order.totalSR || 0
              );
              
              const lostsEGP = newLostsSR * conversionRate;
              const totalEGP = Math.max(0, (order.totalEGP || 0) - lostsEGP);
              const outstandingAmount = Math.max(0, totalEGP - (order.deposit || 0));
              
              return {
                ...order,
                lostsSR: newLostsSR,
                lostsEGP: lostsEGP,
                totalEGP: totalEGP,
                outstandingAmount: outstandingAmount,
                conversionRate: conversionRate
              };
            });
            
            // Recalculate ALL client aggregates
            const aggregates = calculateClientAggregates({
              ...clientData,
              orders: updatedOrders,
              orderType: clientData.orderType,
              clientType: clientData.clientType
            });
            
            return {
              ...clientData,
              orders: updatedOrders,
              ...aggregates
            };
          }
          return clientData;
        })
      );

      showToast(`✅ Losts updated for ${clientName} - ${orderType}`, "success");
      
      // 3. Clear temp value after successful save
      setTempLostsValues(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
      
    } catch (error) {
      showToast(`❌ Failed to update losts: ${error.message}`, "error");
    }
  };

 // Update the getSheetInfoForOrder function to better debug and match
const getSheetInfoForOrder = (orderFirestoreId, sheetsDataParam = sheetsData) => {
 
  sheetsDataParam.forEach((sheet, index) => {
       if (sheet.orders) {
      sheet.orders.forEach((order, oIndex) => {
      });
    }
  });
  
  const sheet = sheetsDataParam.find(sheet => {
    if (!sheet.orders || !Array.isArray(sheet.orders)) return false;
    
    // Try multiple matching strategies
    const foundOrder = sheet.orders.find(order => {
      // Match by Firestore document ID
      if (order.id === orderFirestoreId) return true;
      
      // Match by orderId (if order.id is actually orderId)
      if (order.orderId && orderFirestoreId.includes(order.orderId)) return true;
      
      // Match if order has a firestoreId field
      if (order.firestoreId === orderFirestoreId) return true;
      
      return false;
    });
    
    return !!foundOrder;
  });
  
  if (sheet) {
    return {
      code: sheet.code,
      id: sheet.id,
      type: sheet.type || 'Unknown',
      totalPieces: sheet.totalPieces || 0
    };
  }
  
  return null;
};
  // Handle paid after delivery change - update temp value immediately
  const handlePaidAfterDeliveryInputChange = (clientName, orderType, value) => {
    const key = `${clientName}-${orderType}`;
    
    // Handle empty string
    if (value === '') {
      setTempPaidAfterDeliveryValues(prev => ({
        ...prev,
        [key]: {
          value: '',
          isChanged: true
        }
      }));
      return;
    }
    
    const numValue = Number(value);
    
    // Only update if it's a valid number
    if (!isNaN(numValue)) {
      setTempPaidAfterDeliveryValues(prev => ({
        ...prev,
        [key]: {
          value: numValue,
          isChanged: true
        }
      }));
    }
  };

  // Save paid after delivery to Firestore
  const savePaidAfterDelivery = async (clientName, orderType) => {
    try {
      const key = `${clientName}-${orderType}`;
      const tempData = tempPaidAfterDeliveryValues[key];
      
      // If no temp value or not changed, do nothing
      if (!tempData || !tempData.isChanged) return;
      
      const newPaidAfterDeliveryEGP = tempData.value === '' ? 0 : Number(tempData.value);
      const client = distributionData.find(c => c.client === clientName && c.orderType === orderType);
      if (!client) return;
      // 1. Update in Firestore - update all orders for this client and order type
      const updatePromises = client.orders.map(async (order) => {
        try {
          const orderRef = doc(db, "orders", order.firestoreId);
          
          await updateDoc(orderRef, {
            paidAfterDelivery: newPaidAfterDeliveryEGP,
            lastUpdated: new Date().toISOString()
          });
          
          return { 
            success: true, 
            firestoreId: order.firestoreId,
            newPaidAfterDeliveryEGP
          };
        } catch (error) {
          throw error;
        }
      });

      const results = await Promise.all(updatePromises);
      // 2. Update local state
      setDistributionData(prev => 
        prev.map(clientData => {
          if (clientData.client === clientName && clientData.orderType === orderType) {
            // Create updated orders with new paid after delivery
            const updatedOrders = clientData.orders.map((order, index) => {
              return {
                ...order,
                paidAfterDelivery: newPaidAfterDeliveryEGP
              };
            });
            
            // Calculate client totals
            const totalOutstanding = clientData.orders.reduce((sum, order) => sum + (order.outstandingAmount || 0), 0);
            const remainingOutstanding = Math.max(0, totalOutstanding - newPaidAfterDeliveryEGP);
            
            // Recalculate ALL client aggregates
            const aggregates = calculateClientAggregates({
              ...clientData,
              orders: updatedOrders,
              orderType: clientData.orderType,
              clientType: clientData.clientType
            });
            
            return {
              ...clientData,
              orders: updatedOrders,
              paidAfterDelivery: newPaidAfterDeliveryEGP,
              outstandingAmount: totalOutstanding,
              remainingOutstanding: remainingOutstanding,
              ...aggregates
            };
          }
          return clientData;
        })
      );

      showToast(`✅ Paid after delivery updated for ${clientName} - ${orderType}`, "success");
      
      // 3. Clear temp value after successful save
      setTempPaidAfterDeliveryValues(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
      
    } catch (error) {
      showToast(`❌ Failed to update paid after delivery: ${error.message}`, "error");
    }
  };

  // Get current losts value
  const getCurrentLostsValue = (clientName, orderType, currentLostsSR) => {
    const key = `${clientName}-${orderType}`;
    const tempData = tempLostsValues[key];
    
    if (tempData && tempData.isChanged) {
      // Handle empty string or invalid values
      const tempValue = tempData.value;
      return isNaN(tempValue) || tempValue === '' ? 0 : Number(tempValue);
    }
    
    // Handle current saved value
    const savedValue = currentLostsSR || 0;
    return isNaN(savedValue) ? 0 : Number(savedValue);
  };

  // Get current paid after delivery value
  const getCurrentPaidAfterDeliveryValue = (clientName, orderType, currentPaidAfterDelivery) => {
    const key = `${clientName}-${orderType}`;
    const tempData = tempPaidAfterDeliveryValues[key];
    
    if (tempData && tempData.isChanged) {
      // Handle empty string or invalid values
      const tempValue = tempData.value;
      return isNaN(tempValue) || tempValue === '' ? 0 : Number(tempValue);
    }
    
    // Handle current saved value
    const savedValue = currentPaidAfterDelivery || 0;
    return isNaN(savedValue) ? 0 : Number(savedValue);
  };

  // Add useEffect to clear temp values when distributionData updates
  useEffect(() => {
    // When distributionData changes, clear any temp values that match the current data
    setTempLostsValues(prev => {
      const newTempValues = { ...prev };
      
      Object.keys(newTempValues).forEach(key => {
        const [clientName, orderType] = key.split('-');
        const client = distributionData.find(c => 
          c.client === clientName && c.orderType === orderType
        );
        
        if (client) {
          const tempData = newTempValues[key];
          // If temp value matches the saved value, clear it
          if (tempData && tempData.value === client.lostsSR) {
            delete newTempValues[key];
          }
        }
      });
      
      return newTempValues;
    });
    
    setTempPaidAfterDeliveryValues(prev => {
      const newTempValues = { ...prev };
      
      Object.keys(newTempValues).forEach(key => {
        const [clientName, orderType] = key.split('-');
        const client = distributionData.find(c => 
          c.client === clientName && c.orderType === orderType
        );
        
        if (client) {
          const tempData = newTempValues[key];
          // If temp value matches the saved value, clear it
          if (tempData && tempData.value === client.paidAfterDelivery) {
            delete newTempValues[key];
          }
        }
      });
      
      return newTempValues;
    });
  }, [distributionData]);

  // Handle blur event to save losts
  const handleLostsBlur = (clientName, orderType) => {
    saveLosts(clientName, orderType);
  };

  // Handle key press (Enter) to save losts
  const handleLostsKeyPress = (e, clientName, orderType) => {
    if (e.key === 'Enter') {
      saveLosts(clientName, orderType);
    }
  };

  // Handle blur event to save paid after delivery
  const handlePaidAfterDeliveryBlur = (clientName, orderType) => {
    savePaidAfterDelivery(clientName, orderType);
  };

  // Handle key press (Enter) to save paid after delivery
  const handlePaidAfterDeliveryKeyPress = (e, clientName, orderType) => {
    if (e.key === 'Enter') {
      savePaidAfterDelivery(clientName, orderType);
    }
  };

  // Refresh upload records for a specific client and order type
  const refreshUploadRecords = async (clientName, orderType) => {
    try {
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

    const globalTotals = calculateGlobalTotals();

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
                <p className="text-white/80">Manage client orders in distribution phase with detailed financials</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-2xl font-bold">{distributionData.length}</div>
                <div className="text-white/80 text-sm">Order Groups</div>
              </div>
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
                <th className="p-4 font-semibold text-gray-700 w-64">Sheet ID / Pieces</th>
                <th className="p-4 font-semibold text-gray-700 text-center w-24">Total Pieces</th>
                <th className="p-4 font-semibold text-gray-700 w-64">Sheet ID / Total EGP</th>
                <th className="p-4 font-semibold text-gray-700 text-center w-32">Total EGP</th>
                <th className="p-4 font-semibold text-gray-700 w-64">Sheet ID / Deposits</th>
                <th className="p-4 font-semibold text-gray-700 text-center w-32">Total Deposits EGP</th>
                <th className="p-4 font-semibold text-gray-700 text-center w-48">Losts SR/EGP</th>
                {/* NEW COLUMNS */}
                <th className="p-4 font-semibold text-gray-700 text-center w-32">Outstanding EGP</th>
                <th className="p-4 font-semibold text-gray-700 text-center w-32">Paid After Delivery EGP</th>
                <th className="p-4 font-semibold text-gray-700 text-center w-32">Remaining Outstanding EGP</th>
                {/* END NEW COLUMNS */}
                <th className="p-4 font-semibold text-gray-700 w-64">Upload Details</th>
              </tr>
            </thead>
            <tbody>
              {distributionData.map((client, index) => {
                const currentLostsValue = getCurrentLostsValue(client.client, client.orderType, client.lostsSR);
                const calculatedLostsEGP = currentLostsValue * (client.conversionRate || 1);
                
                // Get current paid after delivery value
                const currentPaidAfterDeliveryValue = getCurrentPaidAfterDeliveryValue(
                  client.client, 
                  client.orderType, 
                  client.paidAfterDelivery
                );
                
                // Calculate total outstanding for the client (sum of all orders)
                const totalOutstandingEGP = client.orders.reduce((sum, order) => sum + (order.outstandingAmount || 0), 0);
                
                // Calculate remaining outstanding after paid after delivery
                const remainingOutstandingEGP = Math.max(0, totalOutstandingEGP - currentPaidAfterDeliveryValue);
                
                return (
                  <tr 
                    key={`${client.client}-${client.orderType}`} 
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    {/* Client Name */}
                    <td className="p-4 w-48">
                      <div className="flex items-center space-x-3">
                        <div className="bg-purple-100 p-2 rounded-lg">
                          <FiUser className="text-purple-600" size={16} />
                        </div>
                        <span className="font-medium text-gray-900">{client.client}</span>
                      </div>
                    </td>

                    {/* Order Type */}
                    <td className="p-4 text-center w-20">
                      <span className={getOrderTypeBadge(client.orderType)}>
                        {client.orderType === "B" ? "Barry" : client.orderType === "G" ? "Gawy" : client.orderType}
                      </span>
                    </td>

                    {/* Sheet ID / Pieces */}
                    <td className="p-4 w-64">
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {client.orders.map((order, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-b-0">
                            <span className="font-bold text-blue-600">
                              {order.sheetCode || 'No Sheet'}
                            </span>

                            <span className="font-mono text-sm font-semibold text-gray-700">{order.pieces}</span>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Total Pieces */}
                    <td className="p-4 text-center w-24">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <span className="font-mono text-lg font-bold text-blue-700">{client.totalPieces}</span>
                      </div>
                    </td>

                    {/* Sheet ID / Total EGP */}
                    <td className="p-4 w-64">
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {client.orders.map((order, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-b-0">
                            <span className="font-bold text-blue-600">
                              {order.sheetCode || 'No Sheet'}
                            </span>
                            <span className="font-mono text-sm font-semibold text-green-600">
                              {order.totalEGP.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Total EGP */}
                    <td className="p-4 text-center w-32">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <span className="font-mono text-lg font-bold text-green-700">
                          {client.totalEGP.toFixed(2)}
                        </span>
                      </div>
                    </td>

                    {/* Sheet ID / Deposits */}
                    <td className="p-4 w-64">
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {client.orders.map((order, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-b-0">
                            <span className="font-bold text-blue-600">
                              {order.sheetCode || 'No Sheet'}
                            </span>
                            <span className="font-mono text-sm font-semibold text-orange-600">
                              {order.deposit.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Total Deposits EGP */}
                    <td className="p-4 text-center w-32">
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <span className="font-mono text-lg font-bold text-orange-700">
                          {client.totalDeposits.toFixed(2)}
                        </span>
                      </div>
                    </td>

                    {/* Losts SR/EGP */}
                    <td className="p-4 text-center w-48">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex flex-col items-center space-y-2">
                          <div className="flex items-center justify-center space-x-2 w-full">
                            <span className="text-sm text-gray-600">SR:</span>
                            <input
                              type="number"
                              value={isNaN(currentLostsValue) ? '' : currentLostsValue}
                              onChange={(e) => {
                                e.stopPropagation();
                                const value = e.target.value;
                                handleLostsInputChange(client.client, client.orderType, value);
                              }}
                              onBlur={(e) => {
                                const value = e.target.value;
                                if (value !== '' && !isNaN(parseFloat(value))) {
                                  saveLosts(client.client, client.orderType);
                                } else if (value === '') {
                                  handleLostsInputChange(client.client, client.orderType, '0');
                                  setTimeout(() => saveLosts(client.client, client.orderType), 100);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const value = e.target.value;
                                  if (value !== '' && !isNaN(parseFloat(value))) {
                                    saveLosts(client.client, client.orderType);
                                  } else if (value === '') {
                                    handleLostsInputChange(client.client, client.orderType, '0');
                                    setTimeout(() => saveLosts(client.client, client.orderType), 100);
                                  }
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-center font-mono text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              step="0.01"
                              min="0"
                            />
                          </div>
                          <div className="text-xs text-red-600 font-medium">
                            EGP: {calculatedLostsEGP.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* NEW COLUMN 1: Outstanding EGP (Read-only) */}
                    <td className="p-4 text-center w-32">
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                        <div className="flex flex-col items-center space-y-1">
                          <FiCreditCard className="text-indigo-600 text-lg mb-1" />
                          <span className="font-mono text-lg font-bold text-indigo-700">
                            {totalOutstandingEGP.toFixed(2)}
                          </span>
                          <div className="text-xs text-gray-600">Outstanding</div>
                        </div>
                      </div>
                    </td>

                    {/* NEW COLUMN 2: Paid After Delivery EGP (Editable Input) */}
                    <td className="p-4 text-center w-32">
                      <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                        <div className="flex flex-col items-center space-y-2">
                          <div className="flex items-center justify-center space-x-1">
                            <FiDownload className="text-teal-600 text-sm" />
                            <span className="text-sm text-gray-600">Paid:</span>
                          </div>
                          <input
                            type="number"
                            value={isNaN(currentPaidAfterDeliveryValue) ? '' : currentPaidAfterDeliveryValue}
                            onChange={(e) => {
                              e.stopPropagation();
                              const value = e.target.value;
                              handlePaidAfterDeliveryInputChange(client.client, client.orderType, value);
                            }}
                            onBlur={(e) => {
                              const value = e.target.value;
                              if (value !== '' && !isNaN(parseFloat(value))) {
                                savePaidAfterDelivery(client.client, client.orderType);
                              } else if (value === '') {
                                handlePaidAfterDeliveryInputChange(client.client, client.orderType, '0');
                                setTimeout(() => savePaidAfterDelivery(client.client, client.orderType), 100);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                const value = e.target.value;
                                if (value !== '' && !isNaN(parseFloat(value))) {
                                  savePaidAfterDelivery(client.client, client.orderType);
                                } else if (value === '') {
                                  handlePaidAfterDeliveryInputChange(client.client, client.orderType, '0');
                                  setTimeout(() => savePaidAfterDelivery(client.client, client.orderType), 100);
                                }
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center font-mono text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            step="0.01"
                            min="0"
                            max={totalOutstandingEGP}
                          />
                          <div className="text-xs text-teal-600">
                            Max: {totalOutstandingEGP.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* NEW COLUMN 3: Remaining Outstanding EGP (Calculated) */}
                    <td className="p-4 text-center w-32">
                      <div className={`border rounded-lg p-3 ${
                        remainingOutstandingEGP > 0 
                          ? 'bg-amber-50 border-amber-200' 
                          : 'bg-emerald-50 border-emerald-200'
                      }`}>
                        <div className="flex flex-col items-center space-y-1">
                          <FiActivity className={`text-lg mb-1 ${
                            remainingOutstandingEGP > 0 
                              ? 'text-amber-600' 
                              : 'text-emerald-600'
                          }`} />
                          <span className={`font-mono text-lg font-bold ${
                            remainingOutstandingEGP > 0 
                              ? 'text-amber-700' 
                              : 'text-emerald-700'
                          }`}>
                            {remainingOutstandingEGP.toFixed(2)}
                          </span>
                          <div className={`text-xs ${
                            remainingOutstandingEGP > 0 
                              ? 'text-amber-600' 
                              : 'text-emerald-600'
                          }`}>
                            {remainingOutstandingEGP > 0 ? 'Remaining' : 'Settled'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Upload Details */}
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
                );
              })}
            </tbody>
            
            {/* Totals Footer */}
            {distributionData.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-gradient-to-r from-gray-100 to-gray-200">
                  <td className="p-4 w-48"></td>
                  <td className="p-4 w-20"></td>
                  <td className="p-4 w-64"></td>
                  <td className="p-4 text-center text-blue-700 font-mono bg-blue-100 border border-blue-200 w-24">
                    {globalTotals.totalOrders}
                  </td>
                  <td className="p-4 w-64"></td>
                  <td className="p-4 text-center text-green-700 font-mono bg-green-100 border border-green-200 w-32">
                    {globalTotals.totalEGP.toFixed(2)}
                  </td>
                  <td className="p-4 w-64"></td>
                  <td className="p-4 text-center text-orange-700 font-mono bg-orange-100 border border-orange-200 w-32">
                    {distributionData.reduce((sum, client) => sum + client.totalDeposits, 0).toFixed(2)}
                  </td>
                  <td className="p-4 text-center w-48">
                    <div className="bg-red-100 border border-red-200 rounded-lg p-3">
                      <div className="font-mono text-lg font-bold text-red-700">
                        {globalTotals.lostsSR.toFixed(2)} SR
                      </div>
                      <div className="font-mono text-sm text-red-600">
                        = {globalTotals.lostsEGP.toFixed(2)} EGP
                      </div>
                    </div>
                  </td>
                  {/* NEW COLUMN TOTALS */}
                  <td className="p-4 text-center w-32">
                    <div className="bg-indigo-100 border border-indigo-200 rounded-lg p-3">
                      <span className="font-mono text-lg font-bold text-indigo-700">
                        {distributionData.reduce((sum, client) => 
                          sum + client.orders.reduce((orderSum, order) => 
                            orderSum + (order.outstandingAmount || 0), 0
                          ), 0).toFixed(2)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-center w-32">
                    <div className="bg-teal-100 border border-teal-200 rounded-lg p-3">
                      <span className="font-mono text-lg font-bold text-teal-700">
                        {distributionData.reduce((sum, client) => sum + (client.paidAfterDelivery || 0), 0).toFixed(2)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-center w-32">
                    <div className="bg-amber-100 border border-amber-200 rounded-lg p-3">
                      <span className="font-mono text-lg font-bold text-amber-700">
                        {distributionData.reduce((sum, client) => 
                          sum + Math.max(0, 
                            client.orders.reduce((orderSum, order) => 
                              orderSum + (order.outstandingAmount || 0), 0
                            ) - (client.paidAfterDelivery || 0)
                          ), 0).toFixed(2)}
                      </span>
                    </div>
                  </td>
                  {/* END NEW COLUMN TOTALS */}
                  <td className="p-4 w-64"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  };

  const globalTotals = calculateGlobalTotals();

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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
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
                  <p className="text-sm font-medium text-gray-600">Total EGP</p>
                  <p className="text-2xl font-bold text-green-600">
                    {globalTotals.totalEGP.toFixed(2)}
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
                  <p className="text-sm font-medium text-gray-600">Total Profit</p>
                  <p className={`text-2xl font-bold ${
                    globalTotals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {globalTotals.totalProfit.toFixed(2)}
                  </p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <FiTrendingUp className="text-blue-600 text-xl" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Outstanding</p>
                  <p className="text-2xl font-bold text-indigo-600">
                    {distributionData.reduce((sum, client) => 
                      sum + client.orders.reduce((orderSum, order) => 
                        orderSum + (order.outstandingAmount || 0), 0
                      ), 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-indigo-100 p-3 rounded-lg">
                  <FiCreditCard className="text-indigo-600 text-xl" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Orders</p>
                  <p className="text-2xl font-bold text-gray-900">{globalTotals.totalOrders}</p>
                </div>
                <div className="bg-orange-100 p-3 rounded-lg">
                  <FiPackage className="text-orange-600 text-xl" />
                </div>
              </div>
            </div>
          </div>

          {/* Main Table */}
          {renderDistributionTable()}

          {/* Financial Summary Section */}
          {distributionData.length > 0 && (
            <div className="mt-8 bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-800">Financial Summary</h3>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    Shipping: {settings?.shipping || 12.7} EGP/order
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Shipping Fees Input */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800">Shipping Fees (SR)</h4>
                      <p className="text-sm text-gray-600">Enter shipping fees to deduct (auto-saved)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-blue-100 p-3 rounded-lg">
                        <FiTruck className="text-blue-600 text-xl" />
                      </div>
                      <button
                        onClick={handleClearShippingFees}
                        className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-2 rounded-lg transition-colors text-sm"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700">
                        Shipping Fees (SR)
                      </label>
                      {shippingFees > 0 && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                          ✓ Auto-saved
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      value={shippingFees}
                      onChange={(e) => handleShippingFeesChange(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center font-mono text-lg"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 text-right">
                      {shippingFees.toFixed(2)} SR = {globalTotals.shippingFeesEGP.toFixed(2)} EGP
                    </p>
                  </div>
                </div>

                {/* Financial Breakdown */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800">Profit Calculation</h4>
                      <p className="text-sm text-gray-600">Total Profit = Total EGP - All Deductions</p>
                    </div>
                    <div className="bg-green-100 p-3 rounded-lg">
                      <FiTrendingUp className="text-green-600 text-xl" />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {/* Revenue */}
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                      <span className="font-medium text-gray-700">Total Revenue (EGP):</span>
                      <span className="font-mono text-lg font-bold text-green-700">
                        {globalTotals.totalEGP.toFixed(2)}
                      </span>
                    </div>
                    
                    {/* Deductions */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center p-2 bg-red-50 rounded border border-red-100">
                        <span className="font-medium text-gray-700">Shipping:</span>
                        <span className="font-mono font-bold text-red-600">
                          - {globalTotals.shippingFeesEGP.toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center p-2 bg-red-50 rounded border border-red-100">
                        <span className="font-medium text-gray-700">Paid to Website:</span>
                        <span className="font-mono font-bold text-red-600">
                          - {globalTotals.paidToWebsiteEGP.toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center p-2 bg-red-50 rounded border border-red-100">
                        <span className="font-medium text-gray-700">Losts:</span>
                        <span className="font-mono font-bold text-red-600">
                          - {globalTotals.lostsEGP.toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center p-2 bg-red-50 rounded border border-red-100">
                        <span className="font-medium text-gray-700">Coupons:</span>
                        <span className="font-mono font-bold text-red-600">
                          - {globalTotals.couponsEGP.toFixed(2)}
                        </span>
                      </div>
                      
                      {/* Dynamic Row Details */}
                      <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded border border-gray-100">
                        <div>• Coupons: {globalTotals.couponsSR.toFixed(2)} SR = {globalTotals.couponsEGP.toFixed(2)} EGP</div>
                        <div>• Paid to Website: {globalTotals.paidToWebsiteSR.toFixed(2)} SR = {globalTotals.paidToWebsiteEGP.toFixed(2)} EGP</div>
                      </div>
                    </div>
                    
                    {/* Total Profit */}
                    <div className="flex justify-between items-center p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border-2 border-green-300">
                      <div>
                        <span className="font-bold text-gray-800 text-lg">Net Profit (EGP):</span>
                        <div className="text-xs text-gray-600">
                          After all deductions
                        </div>
                      </div>
                      <span className={`font-mono text-2xl font-bold ${
                        globalTotals.totalProfit >= 0 
                          ? 'text-green-700' 
                          : 'text-red-700'
                      }`}>
                        {globalTotals.totalProfit.toFixed(2)}
                      </span>
                    </div>
                    
                    {/* Profit Margin */}
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <span className="font-medium text-gray-700">Profit Margin:</span>
                      <span className={`font-mono text-lg font-bold ${
                        (globalTotals.totalProfit / (globalTotals.totalEGP || 1) * 100) >= 0 
                          ? 'text-green-700' 
                          : 'text-red-700'
                      }`}>
                        {((globalTotals.totalProfit / (globalTotals.totalEGP || 1)) * 100).toFixed(2)}%
                      </span>
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