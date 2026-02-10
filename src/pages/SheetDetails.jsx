import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { supabase } from "../supabase";
import { FiArrowLeft, FiPrinter, FiDownload, FiMail, FiPhone, FiPackage, FiDollarSign, FiCalendar, FiPercent, FiCreditCard, FiSave, FiPlus, FiTrash2, FiHash, FiUser, FiUpload, FiEye, FiAlertCircle, FiCheck, FiX } from "react-icons/fi";
import { Link } from "react-router-dom";

export default function SheetDetails() {
  const { sheetId } = useParams();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [systemSettings, setSystemSettings] = useState({});
  
  // State for the dynamic table
  const [dynamicRows, setDynamicRows] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [accounts, setAccounts] = useState([]);
  
  // State for uploads
  const [orderUploads, setOrderUploads] = useState({});
  
  // State for validation errors
  const [validationErrors, setValidationErrors] = useState({});

  // Helper function to round to nearest multiple of 5
  const roundToNearest5 = (number) => {
    return Math.round(number / 5) * 5;
  };

  // Helper function to ensure whole number (no decimals)
  const toWholeNumber = (number) => {
    return Math.round(parseFloat(number) || 0);
  };

  // Helper function to parse SAR values with decimals
  const parseSARValue = (value) => {
    if (value === '' || value === null || value === undefined) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parseFloat(parsed.toFixed(2));
  };

  // Helper function to parse EGP values as whole numbers
  const parseEGPValue = (value) => {
    if (value === '' || value === null || value === undefined) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : Math.round(parsed);
  };

  useEffect(() => {
    fetchSheetDetails();
    fetchAllOrders();
    fetchSystemSettings();
    fetchAccounts();
  }, [sheetId]);

  const fetchSystemSettings = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, "systemSettings", "default"));
      if (settingsDoc.exists()) {
        setSystemSettings(settingsDoc.data());
      }
    } catch (error) {
        throw error;
    }
  };

  const fetchAccounts = async () => {
    try {
      const accountsSnapshot = await getDocs(collection(db, "accounts"));
      const accountsList = accountsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      accountsList.sort((a, b) => a.name.localeCompare(b.name));
      setAccounts(accountsList);
    } catch (error) {
        throw error;
    }
  };

  const fetchSheetDetails = async () => {
    try {
      const sheetDoc = await getDoc(doc(db, "sheets", sheetId));
      if (sheetDoc.exists()) {
        const sheetData = {
          id: sheetDoc.id,
          ...sheetDoc.data(),
          createdAt: sheetDoc.data().createdAt?.toDate()
        };
        setSheet(sheetData);
        
        // Load dynamic rows if they exist
        if (sheetData.dynamicRows) {
          setDynamicRows(sheetData.dynamicRows);
        }
        
        // Fetch detailed order information
        const orderIds = sheetData.orders?.map(order => order.id) || [];
        const orderPromises = orderIds.map(orderId => 
          getDoc(doc(db, "orders", orderId))
        );
        
        const orderDocs = await Promise.all(orderPromises);
        const detailedOrders = orderDocs
          .filter(doc => doc.exists())
          .map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate()
          }));
          
        setOrders(detailedOrders);
        
        // Fetch uploads for all orders in this sheet
        if (detailedOrders.length > 0) {
          fetchUploadsForOrders(detailedOrders);
        }
        
      } else {
        navigate('/sheets');
      }
    } catch (error) {
        throw error;
    } finally {
      setLoading(false);
    }
  };

  const fetchAllOrders = async () => {
    try {
      const ordersSnap = await getDocs(collection(db, "orders"));
      const ordersList = ordersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllOrders(ordersList);
    } catch (error) {
     throw error;
    }
  };

  // Fetch uploads for orders from Supabase
  const fetchUploadsForOrders = async (ordersList) => {
    try {
      const uploadsMap = {};
      
      for (const order of ordersList) {
        const orderId = order.orderId || order.id;
        const customerName = order.customerName || "";
        
        // Fetch uploads from Supabase
        const { data: uploads, error } = await supabase
          .from('uploads')
          .select('*')
          .or(`order_id.eq.${orderId},client_name.eq.${customerName},firestore_order_id.eq.${order.id}`)
          .order('created_at', { ascending: false });
        
        if (!error && uploads) {
          uploadsMap[order.id] = uploads;
        }
      }
      
      setOrderUploads(uploadsMap);
    } catch (error) {
      console.error("Error fetching uploads:", error);
    }
  };

  // Add a new dynamic row
  const addDynamicRow = () => {
    const newRow = {
      id: Date.now().toString(), // Simple unique ID
      account:'',
      pieces: 0,
      totalSR: 0,
      couponSR: 0,
      paidToWebsite: 0,
      trackingNumbers: [], // Array to store multiple tracking numbers
      mediator: '' // Text field for mediator
    };
    setDynamicRows([...dynamicRows, newRow]);
  };

  // Remove a dynamic row
  const removeDynamicRow = (id) => {
    setDynamicRows(dynamicRows.filter(row => row.id !== id));
    // Clear validation errors for removed row
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`${id}-account`];
      delete newErrors[`${id}-pieces`];
      return newErrors;
    });
  };

  // Update a dynamic row field
  const updateDynamicRow = (id, field, value) => {
    setDynamicRows(dynamicRows.map(row => 
      row.id === id 
        ? { 
            ...row, 
            [field]: field === 'account' || field === 'mediator' 
              ? value 
              : field === 'totalSR' || field === 'couponSR' || field === 'paidToWebsite'
                ? parseSARValue(value) // Allow decimals for SAR values
                : parseInt(value) || 0 
          }
        : row
    ));
    
    // Clear validation error when user starts typing
    if (field === 'account' || field === 'pieces') {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`${id}-${field}`];
        return newErrors;
      });
    }
  };

  // Validate dynamic rows before saving
  const validateDynamicRows = () => {
    const errors = {};
    let isValid = true;

    dynamicRows.forEach((row, index) => {
      // Validate account field
      if (!row.account || row.account.trim() === '') {
        errors[`${row.id}-account`] = 'Account is required';
        isValid = false;
      }
      
      // Validate pieces field
      if (row.pieces === '' || row.pieces === null || row.pieces === undefined || parseInt(row.pieces) <= 0) {
        errors[`${row.id}-pieces`] = 'Pieces must be greater than 0';
        isValid = false;
      }
    });

    setValidationErrors(errors);
    return isValid;
  };

  // Add a tracking number to a row
  const addTrackingNumber = (rowId) => {
    setDynamicRows(dynamicRows.map(row => 
      row.id === rowId 
        ? { ...row, trackingNumbers: [...(row.trackingNumbers || []), ''] }
        : row
    ));
  };

  // Remove a tracking number from a row
  const removeTrackingNumber = (rowId, index) => {
    setDynamicRows(dynamicRows.map(row => 
      row.id === rowId 
        ? { 
            ...row, 
            trackingNumbers: row.trackingNumbers.filter((_, i) => i !== index)
          }
        : row
    ));
  };

  // Update a tracking number
  const updateTrackingNumber = (rowId, index, value) => {
    setDynamicRows(dynamicRows.map(row => 
      row.id === rowId 
        ? { 
            ...row, 
            trackingNumbers: row.trackingNumbers.map((tracking, i) => 
              i === index ? value : tracking
            )
          }
        : row
    ));
  };

  // Calculate totals for dynamic table
  const calculateDynamicTotals = () => {
    return dynamicRows.reduce((totals, row) => {
      return {
        pieces: totals.pieces + (parseInt(row.pieces) || 0),
        totalSR: totals.totalSR + (parseSARValue(row.totalSR) || 0),
        couponSR: totals.couponSR + (parseSARValue(row.couponSR) || 0),
        paidToWebsite: totals.paidToWebsite + (parseSARValue(row.paidToWebsite) || 0),
      };
    }, { 
      pieces: 0,
      totalSR: 0,
      couponSR: 0,
      paidToWebsite: 0
    });
  };

  // Save dynamic rows and update sheet name
  const saveDynamicTable = async () => {
    try {
      // Validate before saving
      if (!validateDynamicRows()) {
        alert("Please fix validation errors before saving. Account and Pieces are required fields.");
        return;
      }

      setIsSaving(true);
      
      // Generate new sheet name based on dynamic rows count
      const baseName = sheet.code.split('-')[0] || sheet.code;
      const dynamicRowsCount = dynamicRows.length;
      const newSheetName = `${baseName}-${dynamicRowsCount}`;
      
      // Update sheet in Firestore
      const sheetRef = doc(db, "sheets", sheetId);
      await updateDoc(sheetRef, { 
        dynamicRows: dynamicRows,
        code: newSheetName,
        updatedAt: new Date()
      });
      
      // Update local state
      setSheet(prev => ({
        ...prev,
        code: newSheetName,
        dynamicRows: dynamicRows
      }));
      
      // Clear validation errors on successful save
      setValidationErrors({});
      
      alert("Dynamic table saved successfully!");
    } catch (error) {
      alert("Failed to save dynamic table: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate Total EGP and Outstanding with rounding logic
  const calculateTotalEGP = (order) => {
    if (!order) return { totalEGP: 0, outstanding: 0 };

    // Parse all values - SAR values can have decimals, EGP values are whole numbers
    const totalSR = parseSARValue(order.totalSR) || 0;
    const extraEGP = parseEGPValue(order.extraEGP) || 0;
    const depositEGP = parseEGPValue(order.depositEGP) || 0;
    const discountEGP = Math.abs(parseEGPValue(order.discountEGP)) || 0;
    
    // Calculate conversion rate based on order type and client type
    let conversionRate = 0;
    const threshold = systemSettings?.wholesaleThreshold || 1500;

    if (order.clientType && order.orderType) {
      if (order.clientType === "Wholesale") {
        if (order.orderType === "B") {
          conversionRate = totalSR > threshold 
            ? (systemSettings.barryWholesaleAbove1500 || 12.25)
            : (systemSettings.barryWholesaleBelow1500 || 12.5);
        } else if (order.orderType === "G") {
          conversionRate = totalSR > threshold
            ? (systemSettings.gawyWholesaleAbove1500 || 13.5)
            : (systemSettings.gawyWholesaleBelow1500 || 14);
        }
      } else if (order.clientType === "Retail") {
        conversionRate = order.orderType === "B" 
          ? (systemSettings.barryRetail || 14.5)
          : (systemSettings.gawyRetail || 15.5);
      }
    }

    // Calculate Base EGP before rounding: (Total SR × Conversion Rate) - Discount EGP
    const baseBeforeDiscount = totalSR * conversionRate;
    const baseEGPBeforeRounding = Math.max(0, baseBeforeDiscount - discountEGP);

    // Calculate Total Order EGP before rounding: Base EGP + Extra EGP
    const totalOrderEGPBeforeRounding = baseEGPBeforeRounding + extraEGP;

    // For Retail customers, round Total EGP to nearest multiple of 5
    let totalOrderEGP;
    
    if (order.clientType === "Retail") {
      totalOrderEGP = roundToNearest5(totalOrderEGPBeforeRounding);
    } else {
      // For Wholesale or no client type, just ensure whole numbers (no decimals)
      totalOrderEGP = parseEGPValue(totalOrderEGPBeforeRounding);
    }

    // Calculate Outstanding EGP: Total Order EGP - Deposit EGP
    const outstandingEGPBeforeRounding = Math.max(0, totalOrderEGP - depositEGP);
    
    // For Retail customers, round Outstanding to nearest multiple of 5
    let outstandingEGP;
    if (order.clientType === "Retail") {
      outstandingEGP = roundToNearest5(outstandingEGPBeforeRounding);
    } else {
      outstandingEGP = parseEGPValue(outstandingEGPBeforeRounding);
    }

    // Final safety check to ensure whole numbers
    totalOrderEGP = parseEGPValue(totalOrderEGP);
    outstandingEGP = parseEGPValue(outstandingEGP);

    return { totalEGP: totalOrderEGP, outstanding: outstandingEGP };
  };

  const updateOrderField = async (orderId, field, value) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      
      // Determine the appropriate parsing function based on field type
      let parsedValue;
      if (field === 'depositEGP' || field === 'extraEGP' || field === 'discountEGP') {
        // EGP fields: whole numbers
        parsedValue = parseEGPValue(value);
      } else if (field === 'couponSR' || field === 'paidToWebsite' || field === 'totalSR' || field === 'extraSR') {
        // SAR fields: allow decimals
        parsedValue = parseSARValue(value);
      } else {
        // Other fields: whole numbers
        parsedValue = parseInt(value) || 0;
      }
      
      // Update the field
      await updateDoc(orderRef, { 
        [field]: parsedValue,
        updatedAt: new Date()
      });

      // Recalculate total EGP and outstanding if financial field is updated
      if (['depositEGP', 'couponSR', 'paidToWebsite', 'totalSR', 'extraEGP', 'discountEGP', 'extraSR'].includes(field)) {
        const order = orders.find(o => o.id === orderId);
        if (order) {
          const updatedOrder = { ...order, [field]: parsedValue };
          const { totalEGP, outstanding } = calculateTotalEGP(updatedOrder);
          
          // Update Firestore with recalculated values
          await updateDoc(orderRef, { 
            totalEGP: totalEGP,
            outstanding: outstanding
          });
          
          // Update local state
          setOrders(prev => prev.map(o => 
            o.id === orderId 
              ? { 
                  ...updatedOrder, 
                  totalEGP: totalEGP,
                  outstanding: outstanding 
                }
              : o
          ));
        }
      } else {
        // For other fields, just update the field
        setOrders(prev => prev.map(o => 
          o.id === orderId 
            ? { ...o, [field]: parsedValue }
            : o
        ));
      }

      // Reset editing state
      setEditingOrderId(null);
      setEditingField(null);
      setEditValue('');
      
      alert("Order updated successfully!");
    } catch (error) {
      alert("Failed to update order: " + error.message);
    }
  };

  // Function to handle upload button click
  const handleUploadClick = (orderId) => {
    // Navigate to upload route with orderId as a query parameter
    navigate(`/upload?orderId=${orderId}`);
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

  const printSheet = () => {
    window.print();
  };

  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    
    // Check if it's a SAR value (should show decimals)
    if (typeof num === 'number' && !Number.isInteger(num)) {
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    
    // For whole numbers (like pieces, EGP)
    const number = parseFloat(num) || 0;
    return number.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  const calculateTotals = () => {
    const totals = orders.reduce((acc, order) => {
      // Use existing totalEGP and outstanding from Firestore (already rounded)
      const totalEGP = parseEGPValue(order.totalEGP) || 0;
      const outstanding = parseEGPValue(order.outstanding) || 0;
      
      return {
        pieces: acc.pieces + (parseInt(order.pieces) || 0),
        totalSR: acc.totalSR + (parseSARValue(order.totalSR) || 0),
        extraSR: acc.extraSR + (parseSARValue(order.extraSR) || 0),
        extraEGP: acc.extraEGP + (parseEGPValue(order.extraEGP) || 0),
        totalEGP: acc.totalEGP + totalEGP,
        depositEGP: acc.depositEGP + (parseEGPValue(order.depositEGP) || 0),
        outstandingEGP: acc.outstandingEGP + outstanding,
        couponSR: acc.couponSR + (parseSARValue(order.couponSR) || 0),
        paidToWebsiteSR: acc.paidToWebsiteSR + (parseSARValue(order.paidToWebsite) || 0),
        orders: acc.orders + 1
      };
    }, { 
      pieces: 0,
      totalSR: 0,
      extraSR: 0,
      extraEGP: 0,
      totalEGP: 0,
      depositEGP: 0,
      outstandingEGP: 0,
      couponSR: 0,
      paidToWebsiteSR: 0,
      orders: 0
    });

    return totals;
  };

  // Start editing a field
  const startEditing = (orderId, field, currentValue) => {
    setEditingOrderId(orderId);
    setEditingField(field);
    setEditValue(currentValue);
  };

  // Save the edited value
  const saveEdit = () => {
    if (editingOrderId && editingField) {
      updateOrderField(editingOrderId, editingField, editValue);
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingOrderId(null);
    setEditingField(null);
    setEditValue('');
  };

  // Get rounding info text for retail customers
  const getRoundingInfo = (order) => {
    if (order.clientType === "Retail") {
      return "";
    }
    return "";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sheet details...</p>
        </div>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-700 mb-4">Sheet not found</h2>
          <button
            onClick={() => navigate('/sheets')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Back to Sheets
          </button>
        </div>
      </div>
    );
  }

  const totals = calculateTotals();
  const dynamicTotals = calculateDynamicTotals();
  const isBarrySheet = sheet.type === 'Barry';

  // Get all order IDs for display in header
  const orderIds = orders.map(order => order.orderId).join(' ');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 max-w-full mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/sheets')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FiArrowLeft size={24} className="text-gray-700" />
            </button>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold text-gray-800">{sheet.code}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${isBarrySheet ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                  {sheet.type}
                </span>
              </div>
              <p className="text-gray-600">
                Created: {sheet.createdAt?.toLocaleDateString()}
                {sheet.updatedAt && ` • Updated: ${sheet.updatedAt.toDate().toLocaleDateString()}`}
              </p>
            </div>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={printSheet}
              className="flex items-center space-x-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FiPrinter size={18} />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Orders Table with Financial Details */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Orders in this Sheet</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-sm font-medium text-gray-700">Order IDs:</span>
                  <div className="flex flex-wrap gap-1">
                    {orders.map(order => (
                      <span 
                        key={order.id}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-mono"
                      >
                        {order.orderId}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <span className="text-sm text-gray-600">
                {orders.length} orders • {formatNumber(totals.pieces)} pieces
              </span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[150px]">Customer Name</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[120px]">Phone</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[80px]">Pieces</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[100px]">Total SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[100px]">Extra SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[100px]">Extra EGP</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[100px]">Total EGP</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[120px]">Deposit EGP</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[100px]">Coupon SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[140px]">Paid to Website SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[120px]">Outstanding EGP</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[100px]">Client Type</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[200px]">Upload Files / References</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const uploads = orderUploads[order.id] || [];
                  const { totalEGP, outstanding } = calculateTotalEGP(order);
                  const roundingInfo = getRoundingInfo(order);
                  
                  return (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-4 min-w-[150px]">{order.customerName || '-'}</td>
                      <td className="p-4 min-w-[120px]">
                        {order.phone ? (
                          <a 
                            href={`tel:${order.phone}`}
                            className="text-blue-600 hover:text-blue-800 flex items-center space-x-2"
                          >
                            <FiPhone size={14} />
                            <span>{order.phone}</span>
                          </a>
                        ) : '-'}
                      </td>
                      <td className="p-4 font-medium text-center min-w-[80px]">
                        {formatNumber(order.pieces)}
                      </td>
                      <td className="p-4 font-medium text-green-700 text-center min-w-[100px]">
                        {formatNumber(order.totalSR)} SR
                      </td>
                      <td className="p-4 font-medium text-green-600 text-center min-w-[100px]">
                        {formatNumber(order.extraSR)} SR
                      </td>
                      <td className="p-4 font-medium text-yellow-700 text-center min-w-[100px]">
                        {formatNumber(order.extraEGP)} EGP
                      </td>
                      <td className="p-4 font-medium text-yellow-800 text-center min-w-[100px]">
                        <div className="flex flex-col items-center">
                          <span>{formatNumber(totalEGP)} EGP</span>
                          {order.clientType === "Retail" && (
                            <span className="text-xs text-gray-500 mt-1">{roundingInfo}</span>
                          )}
                        </div>
                      </td>
                      
                      {/* Editable Deposit EGP Field */}
                      <td className="p-4 min-w-[120px]">
                        {editingOrderId === order.id && editingField === 'depositEGP' ? (
                          <div className="flex items-center justify-center space-x-2">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 px-2 py-1 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center"
                              autoFocus
                              step="1"
                              min="0"
                            />
                            <div className="flex space-x-1">
                              <button
                                onClick={saveEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <FiSave size={14} />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Cancel"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="font-medium text-blue-700 cursor-pointer hover:bg-blue-50 p-1 rounded text-center"
                            onClick={() => startEditing(order.id, 'depositEGP', order.depositEGP || 0)}
                          >
                            {formatNumber(order.depositEGP)} EGP
                            <span className="text-xs text-gray-500 ml-1">✎</span>
                          </div>
                        )}
                      </td>
                      
                      {/* Editable Coupon SR Field */}
                      <td className="p-4 min-w-[100px]">
                        {editingOrderId === order.id && editingField === 'couponSR' ? (
                          <div className="flex items-center justify-center space-x-2">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 px-2 py-1 border border-purple-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm text-center"
                              autoFocus
                              step="0.01"
                              min="0"
                            />
                            <div className="flex space-x-1">
                              <button
                                onClick={saveEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <FiSave size={14} />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Cancel"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="font-medium text-purple-700 cursor-pointer hover:bg-purple-50 p-1 rounded text-center"
                            onClick={() => startEditing(order.id, 'couponSR', order.couponSR || 0)}
                          >
                            {formatNumber(order.couponSR)} SR
                            <span className="text-xs text-gray-500 ml-1">✎</span>
                          </div>
                        )}
                      </td>
                      
                      {/* Editable Paid to Website SR Field */}
                      <td className="p-4 min-w-[140px]">
                        {editingOrderId === order.id && editingField === 'paidToWebsite' ? (
                          <div className="flex items-center justify-center space-x-2">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 px-2 py-1 border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-center"
                              autoFocus
                              step="0.01"
                              min="0"
                            />
                            <div className="flex space-x-1">
                              <button
                                onClick={saveEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <FiSave size={14} />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Cancel"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="font-medium text-indigo-700 cursor-pointer hover:bg-indigo-50 p-1 rounded text-center"
                            onClick={() => startEditing(order.id, 'paidToWebsite', order.paidToWebsite || 0)}
                          >
                            {formatNumber(order.paidToWebsite)} SR
                            <span className="text-xs text-gray-500 ml-1">✎</span>
                          </div>
                        )}
                      </td>
                      
                      {/* Outstanding EGP Field */}
                      <td className="p-4 font-medium text-red-700 text-center min-w-[120px]">
                        <div className="flex flex-col items-center">
                          <span>{formatNumber(outstanding)} EGP</span>
                          {order.clientType === "Retail" && (
                            <span className="text-xs text-gray-500 mt-1">{roundingInfo}</span>
                          )}
                        </div>
                      </td>
                      
                      {/* Client Type Column */}
                      <td className="p-4 text-center min-w-[100px]">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium inline-block ${
                          order.clientType === 'Wholesale' 
                            ? 'bg-purple-100 text-purple-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {order.clientType || 'Unknown'}
                        </span>
                      </td>
                      
                      {/* Upload Files Column */}
                      <td className="p-4 min-w-[200px]">
                        <div className="space-y-3">
                          {/* Upload Button */}
                          <button
                            onClick={() => handleUploadClick(order.id)}
                            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors w-full"
                            title="Upload files for this order"
                          >
                            <FiUpload size={16} />
                            <span className="text-sm">Upload Files</span>
                          </button>
                          
                          {/* Upload References */}
                          {uploads.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              <div className="text-xs font-medium text-gray-600">
                                Uploads ({uploads.length})
                              </div>
                              {uploads.map((upload) => (
                                <div key={upload.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-2">
                                      <span className={getStatusBadge(upload.status)}>
                                        {upload.status || "Under Approval"}
                                      </span>
                                      <span className="text-xs text-gray-500 truncate">
                                        {upload.order_id || upload.id}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1 truncate">
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
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 text-center py-2">
                              No uploads found
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              
              {/* Totals Footer */}
              {orders.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr className="font-bold">
                    <td className="p-4 text-gray-700 min-w-[150px]">
                      TOTALS ({orders.length} orders)
                    </td>
                    <td className="p-4 min-w-[120px]"></td>
                    <td className="p-4 text-center text-blue-700 min-w-[80px]">
                      {formatNumber(totals.pieces)}
                    </td>
                    <td className="p-4 text-green-700 text-center min-w-[100px]">
                      {formatNumber(totals.totalSR)} SR
                    </td>
                    <td className="p-4 text-green-600 text-center min-w-[100px]">
                      {formatNumber(totals.extraSR)} SR
                    </td>
                    <td className="p-4 text-yellow-700 text-center min-w-[100px]">
                      {formatNumber(totals.extraEGP)} EGP
                    </td>
                    <td className="p-4 text-yellow-800 text-center min-w-[100px]">
                      {formatNumber(totals.totalEGP)} EGP
                    </td>
                    <td className="p-4 text-blue-700 text-center min-w-[120px]">
                      {formatNumber(totals.depositEGP)} EGP
                    </td>
                    <td className="p-4 text-purple-700 text-center min-w-[100px]">
                      {formatNumber(totals.couponSR)} SR
                    </td>
                    <td className="p-4 text-indigo-700 text-center min-w-[140px]">
                      {formatNumber(totals.paidToWebsiteSR)} SR
                    </td>
                    <td className="p-4 text-red-700 text-center min-w-[120px]">
                      {formatNumber(totals.outstandingEGP)} EGP
                    </td>
                    <td className="p-4 text-center text-gray-600 min-w-[100px]">
                      Mixed
                    </td>
                    <td className="p-4 min-w-[200px]"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          
          {orders.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FiPackage className="mx-auto text-4xl mb-4 text-gray-300" />
              <p className="text-lg font-medium">No orders in this sheet yet</p>
              <p className="text-sm text-gray-600 mb-4">Add orders from the dashboard to populate this sheet</p>
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Table Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">Manual Entries Table</h2>
              <div className="flex space-x-3">
                <button
                  onClick={addDynamicRow}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <FiPlus size={18} />
                  <span>Add Row</span>
                </button>
                <button
                  onClick={saveDynamicTable}
                  disabled={isSaving}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiSave size={18} />
                  <span>{isSaving ? 'Saving...' : 'Save Table'}</span>
                </button>
              </div>
            </div>
            <p className="text-gray-600 mt-2">
              Add manual entries below. Sheet name will update to: {sheet.code.split('-')[0] || sheet.code}-{dynamicRows.length}
            </p>
            <div className="mt-2 text-sm">
              <span className="font-medium text-red-600">* Account and Pieces fields are required</span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[150px]">Account *</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[100px]">Pieces *</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[120px]">Total SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[120px]">Coupon SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[160px]">Paid to Website SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[200px]">Tracking Numbers</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[150px]">Mediator</th>
                  <th className="p-4 text-left font-semibold text-gray-700 min-w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dynamicRows.map((row) => {
                  const accountError = validationErrors[`${row.id}-account`];
                  const piecesError = validationErrors[`${row.id}-pieces`];
                  
                  return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                      {/* Account Field - Dropdown */}
                      <td className="p-4 min-w-[150px]">
                        <select
                          value={row.account}
                          onChange={(e) => updateDynamicRow(row.id, 'account', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center ${
                            accountError ? 'border-red-500 bg-red-50' : 'border-gray-300'
                          }`}
                          required
                        >
                          <option value="">Select Account *</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.name}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                        {accountError && (
                          <div className="text-red-600 text-xs mt-1">{accountError}</div>
                        )}
                      </td>
                      
                      {/* Pieces Field */}
                      <td className="p-4 min-w-[100px]">
                        <input
                          type="number"
                          value={row.pieces}
                          onChange={(e) => updateDynamicRow(row.id, 'pieces', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center ${
                            piecesError ? 'border-red-500 bg-red-50' : 'border-gray-300'
                          }`}
                          min="1"
                          step="1"
                          required
                        />
                        {piecesError && (
                          <div className="text-red-600 text-xs mt-1">{piecesError}</div>
                        )}
                      </td>
                      
                      {/* Total SR Field */}
                      <td className="p-4 min-w-[120px]">
                        <input
                          type="number"
                          value={row.totalSR}
                          onChange={(e) => updateDynamicRow(row.id, 'totalSR', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      
                      {/* Coupon SR Field */}
                      <td className="p-4 min-w-[120px]">
                        <input
                          type="number"
                          value={row.couponSR}
                          onChange={(e) => updateDynamicRow(row.id, 'couponSR', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      
                      {/* Paid to Website SR Field */}
                      <td className="p-4 min-w-[160px]">
                        <input
                          type="number"
                          value={row.paidToWebsite}
                          onChange={(e) => updateDynamicRow(row.id, 'paidToWebsite', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      
                      {/* Tracking Numbers Field */}
                      <td className="p-4 min-w-[200px]">
                        <div className="space-y-2">
                          {row.trackingNumbers?.map((tracking, index) => {
                            // Auto-focus the last tracking number in the last row
                            const isLastTrackingNumber = 
                              index === row.trackingNumbers.length - 1 && 
                              dynamicRows.indexOf(row) === dynamicRows.length - 1;
                            
                            return (
                              <div key={index} className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={tracking}
                                  autoFocus={isLastTrackingNumber}
                                  onChange={(e) => updateTrackingNumber(row.id, index, e.target.value)}
                                  placeholder="Enter tracking number"
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                                <button
                                  onClick={() => removeTrackingNumber(row.id, index)}
                                  className="text-red-600 hover:text-red-800 p-1 flex-shrink-0"
                                  title="Remove tracking number"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                          <button
                            onClick={() => addTrackingNumber(row.id)}
                            className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm"
                          >
                            <FiPlus size={14} />
                            <span>Add Tracking</span>
                          </button>
                        </div>
                      </td>
                      
                      {/* Mediator Field */}
                      <td className="p-4 min-w-[150px]">
                        <input
                          type="text"
                          value={row.mediator || ''}
                          onChange={(e) => updateDynamicRow(row.id, 'mediator', e.target.value)}
                          placeholder="Enter mediator name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                        />
                      </td>
                      
                      {/* Actions */}
                      <td className="p-4 text-center min-w-[80px]">
                        <button
                          onClick={() => removeDynamicRow(row.id)}
                          className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center"
                          title="Delete row"
                        >
                          <FiTrash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                
                {/* Empty state */}
                {dynamicRows.length === 0 && (
                  <tr>
                    <td colSpan="8" className="text-center py-12 text-gray-500">
                      <FiPackage className="mx-auto text-4xl mb-4 text-gray-300" />
                      <p className="text-lg font-medium">No manual entries yet</p>
                      <p className="text-sm text-gray-600 mb-4">Click "Add Row" to start adding manual entries</p>
                    </td>
                  </tr>
                )}
              </tbody>
              
              {/* Totals Footer */}
              {dynamicRows.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr className="font-bold">
                    <td className="p-4 text-gray-700 text-center min-w-[150px]">
                      TOTALS ({dynamicRows.length} entries)
                    </td>
                    <td className="p-4 text-center text-blue-700 min-w-[100px]">
                      {formatNumber(dynamicTotals.pieces)}
                    </td>
                    <td className="p-4 text-green-700 text-center min-w-[120px]">
                      {formatNumber(dynamicTotals.totalSR)} SR
                    </td>
                    <td className="p-4 text-purple-700 text-center min-w-[120px]">
                      {formatNumber(dynamicTotals.couponSR)} SR
                    </td>
                    <td className="p-4 text-indigo-700 text-center min-w-[160px]">
                      {formatNumber(dynamicTotals.paidToWebsite)} SR
                    </td>
                    <td className="p-4 text-center text-gray-500 min-w-[200px]">
                      <FiHash className="inline-block mr-2" />
                      Tracking Numbers
                    </td>
                    <td className="p-4 text-center text-gray-500 min-w-[150px]">
                      <FiUser className="inline-block mr-2" />
                      Mediators
                    </td>
                    <td className="p-4 min-w-[80px]"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          
          {/* Validation Summary */}
          {Object.keys(validationErrors).length > 0 && (
            <div className="p-4 bg-red-50 border-t border-red-200">
              <div className="flex items-center space-x-2">
                <FiAlertCircle className="text-red-600" />
                <span className="text-red-700 font-medium">
                  Please fix {Object.keys(validationErrors).length} validation error(s) before saving
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}