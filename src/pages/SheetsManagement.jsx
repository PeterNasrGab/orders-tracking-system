import React, { useState, useEffect } from 'react';
import { db } from "../firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiTrash2, FiEye, FiPackage, FiUsers, FiCalendar, FiTag, FiDollarSign } from "react-icons/fi";

export default function SheetsManagement() {
  const [sheets, setSheets] = useState([]);
  const [allOrders, setAllOrders] = useState([]); // Store all orders for lookup
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSheets();
    fetchAllOrders();
  }, []);

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

  const fetchSheets = async () => {
    try {
      const sheetsSnap = await getDocs(collection(db, "sheets"));
      const sheetsList = sheetsSnap.docs.map(doc => {
        const data = doc.data();
        
        // Extract sheet number from code (e.g., B1 -> 1, G2 -> 2)
        const sheetNumber = extractSheetNumber(data.code);
        
        return {
          id: doc.id,
          ...data,
          sheetNumber: sheetNumber,
          // Ensure totalPieces is a number
          totalPieces: Number(data.totalPieces) || 0,
          // Also ensure orders have numeric pieces
          orders: data.orders?.map(order => ({
            ...order,
            pieces: Number(order.pieces) || 0,
            outstanding: Number(order.outstanding) || 0
            // Note: totalSR might not be in the embedded order data
          })) || []
        };
      });
      
      // Sort sheets: Barry first, then Gawy, then by sheet number
      sheetsList.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'Barry' ? -1 : 1;
        }
        return a.sheetNumber - b.sheetNumber;
      });
      
      setSheets(sheetsList);
    } catch (error) {
        throw error;
    } finally {
      setLoading(false);
    }
  };

  // Helper function to extract sheet number from code
  const extractSheetNumber = (code) => {
    if (!code) return 0;
    const match = code.match(/(?:B|G)(\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  const deleteSheet = async (sheetId) => {
    if (window.confirm("Are you sure you want to delete this sheet? This will unlink all orders from this sheet.")) {
      try {
        // Remove sheet reference from orders first
        const ordersSnap = await getDocs(collection(db, "orders"));
        const batchUpdates = [];
        
        ordersSnap.docs.forEach(orderDoc => {
          const order = orderDoc.data();
          if (order.sheetId === sheetId) {
            batchUpdates.push(
              updateDoc(doc(db, "orders", orderDoc.id), {
                sheetId: null,
                sheetCode: null,
                updatedAt: new Date()
              })
            );
          }
        });

        // Wait for all order updates
        await Promise.all(batchUpdates);
        
        // Then delete the sheet
        await deleteDoc(doc(db, "sheets", sheetId));
        
        // Refresh sheets list
        fetchSheets();
        
        alert("Sheet deleted successfully!");
      } catch (error) {
        alert("Failed to delete sheet: " + error.message);
      }
    }
  };

  const getSheetStats = (sheet) => {
    // Use sheet.totalPieces if it exists and is a valid number
    let totalPieces = Number(sheet.totalPieces) || 0;
    let totalSR = 0;
    
    // Calculate from orders
    if (sheet.orders?.length > 0) {
      // Recalculate total pieces from orders
      const calculatedPieces = sheet.orders.reduce((sum, order) => {
        const pieces = Number(order.pieces) || 0;
        return sum + pieces;
      }, 0);
      
      // Use calculated pieces if sheet.totalPieces is 0 or invalid
      if (totalPieces === 0 || isNaN(totalPieces)) {
        totalPieces = calculatedPieces;
      }
      
      // Calculate total SR from orders
      // We need to look up the full order details from allOrders
      totalSR = sheet.orders.reduce((sum, sheetOrder) => {
        // Find the full order in allOrders using orderId or id
        const fullOrder = allOrders.find(order => 
          order.id === sheetOrder.id || order.orderId === sheetOrder.id
        );
        
        if (fullOrder) {
          // Use totalSR from the full order
          return sum + (Number(fullOrder.totalSR) || 0);
        } else if (sheetOrder.totalSR) {
          // Fallback to totalSR from sheet order if it exists
          return sum + (Number(sheetOrder.totalSR) || 0);
        }
        return sum;
      }, 0);
    }
    
    const totalOutstanding = sheet.orders?.reduce((sum, order) => {
      const outstanding = Number(order.outstanding) || 0;
      return sum + outstanding;
    }, 0) || 0;
    
    return { totalPieces, totalSR, totalOutstanding };
  };

  const formatNumber = (num) => {
    const number = Number(num);
    if (isNaN(number)) return "0";
    return number.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sheets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FiArrowLeft size={24} className="text-gray-700" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Sheets Management</h1>
              <p className="text-gray-600">View and manage all order sheets</p>
            </div>
          </div>
          <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-medium">
            {sheets.length} Sheet{sheets.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Sheets Grid */}
        {sheets.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <FiPackage className="mx-auto text-6xl text-gray-300 mb-6" />
            <h3 className="text-2xl font-bold text-gray-700 mb-4">No Sheets Yet</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Sheets will appear here when you add orders to them from the dashboard.
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sheets.map((sheet) => {
              const stats = getSheetStats(sheet);
              
              return (
                <div 
                  key={sheet.id} 
                  className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
                  onClick={() => navigate(`/sheet/${sheet.id}`)}
                >
                  {/* Sheet Header */}
                  <div className={`p-6 ${sheet.type === 'Barry' ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gradient-to-r from-green-500 to-green-600'} text-white`}>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-xl font-bold">
                        {sheet.code}
                      </h3>
                      <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-medium">
                        {sheet.type}
                      </span>
                    </div>
                    <p className="text-white/90 text-sm">
                      Created: {sheet.createdAt?.toDate().toLocaleDateString()}
                    </p>
                  </div>

                  {/* Sheet Content */}
                  <div className="p-6">
                    <div className="space-y-4 mb-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-gray-600">
                          <FiUsers size={18} />
                          <span>Orders</span>
                        </div>
                        <span className="font-bold text-gray-800">
                          {sheet.orders?.length || 0}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-gray-600">
                          <FiPackage size={18} />
                          <span>Total Pieces</span>
                        </div>
                        <span className="font-bold text-gray-800">
                          {formatNumber(stats.totalPieces)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-gray-600">
                          <FiDollarSign size={18} />
                          <span>Total SR</span>
                        </div>
                        <span className="font-bold text-green-700">
                          SR {formatNumber(stats.totalSR)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-gray-600">
                          <FiTag size={18} />
                          <span>Outstanding</span>
                        </div>
                        <span className="font-bold text-yellow-700">
                          EGP {formatNumber(stats.totalOutstanding.toFixed(2))}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex space-x-2 pt-4 border-t border-gray-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/sheet/${sheet.id}`);
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                      >
                        <FiEye size={16} />
                        <span>View Details</span>
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSheet(sheet.id);
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Sheet"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Summary Stats */}
        {sheets.length > 0 && (
          <div className="mt-8 bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <FiPackage className="text-blue-600" size={20} />
                  <span className="text-gray-600 font-medium">Total Sheets</span>
                </div>
                <p className="text-2xl font-bold text-blue-700">{sheets.length}</p>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <FiPackage className="text-green-600" size={20} />
                  <span className="text-gray-600 font-medium">Total Pieces</span>
                </div>
                <p className="text-2xl font-bold text-green-700">
                  {formatNumber(sheets.reduce((sum, sheet) => {
                    const stats = getSheetStats(sheet);
                    return sum + stats.totalPieces;
                  }, 0))}
                </p>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <FiDollarSign className="text-purple-600" size={20} />
                  <span className="text-gray-600 font-medium">Total SR</span>
                </div>
                <p className="text-2xl font-bold text-purple-700">
                  SR {formatNumber(sheets.reduce((sum, sheet) => {
                    const stats = getSheetStats(sheet);
                    return sum + stats.totalSR;
                  }, 0))}
                </p>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <FiTag className="text-yellow-600" size={20} />
                  <span className="text-gray-600 font-medium">Total Outstanding</span>
                </div>
                <p className="text-2xl font-bold text-yellow-700">
                  EGP {formatNumber(sheets.reduce((sum, sheet) => {
                    const stats = getSheetStats(sheet);
                    return sum + stats.totalOutstanding;
                  }, 0).toFixed(2))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}