import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { FiArrowLeft, FiPrinter, FiDownload, FiMail, FiPhone, FiPackage, FiDollarSign, FiCalendar, FiPercent, FiCreditCard, FiSave, FiPlus, FiTrash2 } from "react-icons/fi";

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

  // Add a new dynamic row
  const addDynamicRow = () => {
    const newRow = {
      id: Date.now().toString(), // Simple unique ID
      account:'',
      pieces: 0,
      totalSR: 0,
      couponSR: 0,
      paidToWebsite: 0
    };
    setDynamicRows([...dynamicRows, newRow]);
  };

  // Remove a dynamic row
  const removeDynamicRow = (id) => {
    setDynamicRows(dynamicRows.filter(row => row.id !== id));
  };

  // Update a dynamic row field
  const updateDynamicRow = (id, field, value) => {
    setDynamicRows(dynamicRows.map(row => 
      row.id === id 
        ? { ...row, [field]: field === 'account' ? value : parseFloat(value) || 0 }
        : row
    ));
  };

  // Calculate totals for dynamic table
  const calculateDynamicTotals = () => {
    return dynamicRows.reduce((totals, row) => {
      return {
        pieces: totals.pieces + (parseFloat(row.pieces) || 0),
        totalSR: totals.totalSR + (parseFloat(row.totalSR) || 0),
        couponSR: totals.couponSR + (parseFloat(row.couponSR) || 0),
        paidToWebsite: totals.paidToWebsite + (parseFloat(row.paidToWebsite) || 0),
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
      
      alert("Dynamic table saved successfully! Sheet name updated.");
    } catch (error) {
      alert("Failed to save dynamic table: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Recalculate outstanding amount based on BarryDashboard logic
  const calculateOutstanding = (order) => {
    const totalSR = parseFloat(order.totalSR) || 0;
    const extraEGP = parseFloat(order.extraEGP) || 0;
    const depositEGP = parseFloat(order.depositEGP) || 0;
    const paidToWebsite = parseFloat(order.paidToWebsite) || 0;
    const discountSR = parseFloat(order.discountSR) || 0;
    const discount2SR = parseFloat(order.discount2SR) || 0;
    const discount3SR = parseFloat(order.discount3SR) || 0;
    
    // Calculate net SR after all deductions
    const netSR = totalSR - (discountSR  + discount2SR + discount3SR );
    
    // Get conversion rate based on order type and client type
    let conversionRate = 1;
    const threshold = systemSettings?.wholesaleThreshold || 1500;
    
    if (order.clientType === "Wholesale") {
      if (order.orderType === "B") {
        conversionRate = totalSR > threshold 
          ? (systemSettings?.barryWholesaleAbove1500 || 12.25)
          : (systemSettings?.barryWholesaleBelow1500 || 12.5);
      } else if (order.orderType === "G") {
        conversionRate = totalSR > threshold
          ? (systemSettings?.gawyWholesaleAbove1500 || 13.5)
          : (systemSettings?.gawyWholesaleBelow1500 || 14);
      }
    } else {
      // Retail pricing
      conversionRate = order.orderType === "B" 
        ? (systemSettings?.barryRetail || 14.5)
        : (systemSettings?.gawyRetail || 15.5);
    }
    
    // Calculate total EGP and outstanding
    const totalEGP = (netSR * conversionRate) + extraEGP;
    const outstanding = totalEGP - depositEGP;
    
    return Math.max(0, outstanding); // Ensure outstanding is not negative
  };

  const updateOrderField = async (orderId, field, value) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      const numericValue = parseFloat(value) || 0;
      
      // Update the field
      await updateDoc(orderRef, { 
        [field]: numericValue,
        updatedAt: new Date()
      });

      // Recalculate outstanding if financial field is updated
      if (['depositEGP', 'paidToWebsite', 'couponSR', 'discountSR', 'discount2SR', 'discount3SR'].includes(field)) {
        const order = orders.find(o => o.id === orderId);
        if (order) {
          const updatedOrder = { ...order, [field]: numericValue };
          const outstanding = calculateOutstanding(updatedOrder);
          
          // Update outstanding in Firestore
          await updateDoc(orderRef, { 
            outstanding: outstanding,
            totalEGP: (parseFloat(updatedOrder.totalSR || 0) * getConversionRate(updatedOrder)) + (parseFloat(updatedOrder.extraEGP) || 0)
          });
          
          // Update local state
          setOrders(prev => prev.map(o => 
            o.id === orderId 
              ? { ...updatedOrder, outstanding, totalEGP: (parseFloat(updatedOrder.totalSR || 0) * getConversionRate(updatedOrder)) + (parseFloat(updatedOrder.extraEGP) || 0) }
              : o
          ));
        }
      } else {
        // For other fields, just update the field
        setOrders(prev => prev.map(o => 
          o.id === orderId 
            ? { ...o, [field]: numericValue }
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

  const getConversionRate = (order) => {
    const totalSR = parseFloat(order.totalSR) || 0;
    const threshold = systemSettings?.wholesaleThreshold || 1500;
    
    if (order.clientType === "Wholesale") {
      if (order.orderType === "B") {
        return totalSR > threshold 
          ? (systemSettings?.barryWholesaleAbove1500 || 12.25)
          : (systemSettings?.barryWholesaleBelow1500 || 12.5);
      } else if (order.orderType === "G") {
        return totalSR > threshold
          ? (systemSettings?.gawyWholesaleAbove1500 || 13.5)
          : (systemSettings?.gawyWholesaleBelow1500 || 14);
      }
    } else {
      return order.orderType === "B" 
        ? (systemSettings?.barryRetail || 14.5)
        : (systemSettings?.gawyRetail || 15.5);
    }
    return 1;
  };

  const printSheet = () => {
    window.print();
  };

  const calculateTotals = () => {
    return orders.reduce((totals, order) => {
      return {
        pieces: totals.pieces + (parseFloat(order.pieces) || 0),
        totalSR: totals.totalSR + (parseFloat(order.totalSR) || 0),
        extraSR: totals.extraSR + (parseFloat(order.extraSR) || 0),
        extraEGP: totals.extraEGP + (parseFloat(order.extraEGP) || 0),
        totalEGP: totals.totalEGP + (parseFloat(order.totalEGP) || 0),
        depositEGP: totals.depositEGP + (parseFloat(order.depositEGP) || 0),
        outstandingEGP: totals.outstandingEGP + (parseFloat(order.outstanding) || 0),
        couponSR: totals.couponSR + (parseFloat(order.couponSR) || 0),
        paidToWebsiteSR: totals.paidToWebsiteSR + (parseFloat(order.paidToWebsite) || 0),
        orders: totals.orders + 1
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
      <div className="p-6 max-w-7xl mx-auto">
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
                {orders.length} orders • {totals.pieces} pieces
              </span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-left font-semibold text-gray-700">Customer Name</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Phone</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Pieces</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Total SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Extra SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Extra EGP</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Total EGP</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Deposit EGP</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Coupon SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Paid to Website SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Outstanding EGP</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4">{order.customerName || '-'}</td>
                    <td className="p-4">
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
                    <td className="p-4 font-medium text-center">
                      {parseFloat(order.pieces) || 0}
                    </td>
                    <td className="p-4 font-medium text-green-700 text-center">
                      {(parseFloat(order.totalSR) || 0).toFixed(2)} SR
                    </td>
                    <td className="p-4 font-medium text-green-600 text-center">
                      {(parseFloat(order.extraSR) || 0).toFixed(2)} SR
                    </td>
                    <td className="p-4 font-medium text-yellow-700 text-center">
                      {(parseFloat(order.extraEGP) || 0).toFixed(2)} EGP
                    </td>
                    <td className="p-4 font-medium text-yellow-800 text-center">
                      {(parseFloat(order.totalEGP) || 0).toFixed(2)} EGP
                    </td>
                    
                    {/* Editable Deposit EGP Field */}
                    <td className="p-4">
                      {editingOrderId === order.id && editingField === 'depositEGP' ? (
                        <div className="flex items-center justify-center space-x-2">
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-24 px-2 py-1 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center"
                            autoFocus
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
                          {(parseFloat(order.depositEGP) || 0).toFixed(2)} EGP
                          <span className="text-xs text-gray-500 ml-1">✎</span>
                        </div>
                      )}
                    </td>
                    
                    {/* Editable Coupon SR Field */}
                    <td className="p-4">
                      {editingOrderId === order.id && editingField === 'couponSR' ? (
                        <div className="flex items-center justify-center space-x-2">
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-24 px-2 py-1 border border-purple-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm text-center"
                            autoFocus
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
                          {(parseFloat(order.couponSR) || 0).toFixed(2)} SR
                          <span className="text-xs text-gray-500 ml-1">✎</span>
                        </div>
                      )}
                    </td>
                    
                    {/* Editable Paid to Website SR Field */}
                    <td className="p-4">
                      {editingOrderId === order.id && editingField === 'paidToWebsite' ? (
                        <div className="flex items-center justify-center space-x-2">
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-24 px-2 py-1 border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-center"
                            autoFocus
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
                          {(parseFloat(order.paidToWebsite) || 0).toFixed(2)} SR
                          <span className="text-xs text-gray-500 ml-1">✎</span>
                        </div>
                      )}
                    </td>
                    
                    <td className="p-4 font-medium text-red-700 text-center">
                      {(parseFloat(order.outstanding) || 0).toFixed(2)} EGP
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium inline-block ${
                        order.status === 'Delivered to Egypt' ? 'bg-green-100 text-green-800' :
                        order.status === 'In Distribution' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {order.status || 'No Status'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              
              {/* Totals Footer */}
              {orders.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr className="font-bold">
                    <td className="p-4 text-gray-700">
                      TOTALS ({orders.length} orders)
                    </td>
                    <td className="p-4"></td>
                    <td className="p-4 text-center text-blue-700">
                      {totals.pieces}
                    </td>
                    <td className="p-4 text-green-700 text-center">
                      {totals.totalSR.toFixed(2)} SR
                    </td>
                    <td className="p-4 text-green-600 text-center">
                      {totals.extraSR.toFixed(2)} SR
                    </td>
                    <td className="p-4 text-yellow-700 text-center">
                      {totals.extraEGP.toFixed(2)} EGP
                    </td>
                    <td className="p-4 text-yellow-800 text-center">
                      {totals.totalEGP.toFixed(2)} EGP
                    </td>
                    <td className="p-4 text-blue-700 text-center">
                      {totals.depositEGP.toFixed(2)} EGP
                    </td>
                    <td className="p-4 text-purple-700 text-center">
                      {totals.couponSR.toFixed(2)} SR
                    </td>
                    <td className="p-4 text-indigo-700 text-center">
                      {totals.paidToWebsiteSR.toFixed(2)} SR
                    </td>
                    <td className="p-4 text-red-700 text-center">
                      {totals.outstandingEGP.toFixed(2)} EGP
                    </td>
                    <td className="p-4"></td>
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
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-left font-semibold text-gray-700">Account</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Pieces</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Total SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Coupon SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Paid to Website SR</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dynamicRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                    {/* Account Field - Dropdown */}
                    <td className="p-4">
                      <select
                        value={row.account}
                        onChange={(e) => updateDynamicRow(row.id, 'account', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                      >
                        <option value="">Select Account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.name}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    
                    {/* Pieces Field */}
                    <td className="p-4">
                      <input
                        type="number"
                        value={row.pieces}
                        onChange={(e) => updateDynamicRow(row.id, 'pieces', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                        min="0"
                        step="1"
                      />
                    </td>
                    
                    {/* Total SR Field */}
                    <td className="p-4">
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
                    <td className="p-4">
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
                    <td className="p-4">
                      <input
                        type="number"
                        value={row.paidToWebsite}
                        onChange={(e) => updateDynamicRow(row.id, 'paidToWebsite', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    
                    {/* Actions */}
                    <td className="p-4 text-center">
                      <button
                        onClick={() => removeDynamicRow(row.id)}
                        className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center"
                        title="Delete row"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                
                {/* Empty state */}
                {dynamicRows.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-gray-500">
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
                    <td className="p-4 text-gray-700 text-center">
                      TOTALS ({dynamicRows.length} entries)
                    </td>
                    <td className="p-4 text-center text-blue-700">
                      {dynamicTotals.pieces}
                    </td>
                    <td className="p-4 text-green-700 text-center">
                      {dynamicTotals.totalSR.toFixed(2)} SR
                    </td>
                    <td className="p-4 text-purple-700 text-center">
                      {dynamicTotals.couponSR.toFixed(2)} SR
                    </td>
                    <td className="p-4 text-indigo-700 text-center">
                      {dynamicTotals.paidToWebsite.toFixed(2)} SR
                    </td>
                    <td className="p-4"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}