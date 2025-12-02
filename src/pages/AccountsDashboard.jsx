import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

export default function AccountsDashboard() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountData, setAccountData] = useState([]);
  
  // Helper: get today's date in yyyy-mm-dd format
  const today = new Date().toISOString().split("T")[0];

  const [filters, setFilters] = useState({
    account: "",
    dateFrom: today,
    dateTo: today,
  });

  // Load orders & accounts
  useEffect(() => {
    const fetchData = async () => {
      const orderSnap = await getDocs(collection(db, "orders"));
      const orderList = orderSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setOrders(orderList);

      const accSnap = await getDocs(collection(db, "accounts"));
      const accountList = accSnap.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
      }));
      setAccounts(accountList);
    };
    fetchData();
  }, []);

  // Process and group data by account
  useEffect(() => {
    const processAccountData = () => {
      let filteredOrders = [...orders];

      // Apply date filters
      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        filteredOrders = filteredOrders.filter((order) => 
          order.createdAt?.toDate() >= fromDate
        );
      }

      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        filteredOrders = filteredOrders.filter((order) => 
          order.createdAt?.toDate() <= toDate
        );
      }

      // Apply account filter
      if (filters.account) {
        filteredOrders = filteredOrders.filter((order) => 
          order.accountName === filters.account
        );
      }

      // Group by account
      const accountGroups = {};

      filteredOrders.forEach((order) => {
        const accountName = order.accountName || "Unknown Account";
        
        if (!accountGroups[accountName]) {
          accountGroups[accountName] = {
            accountName,
            totalPieces: 0,
            totalSR: 0,
            totalCouponEGP: 0,
            totalDepositEGP: 0,
            orders: [],
            dailyData: {}
          };
        }

        const pieces = Number(order.pieces) || 0;
        const totalSR = Number(order.totalSR) || 0;
        const couponEGP = Number(order.couponEGP) || 0;
        const depositEGP = Number(order.depositEGP) || 0;

        accountGroups[accountName].totalPieces += pieces;
        accountGroups[accountName].totalSR += totalSR;
        accountGroups[accountName].totalCouponEGP += couponEGP;
        accountGroups[accountName].totalDepositEGP += depositEGP;
        accountGroups[accountName].orders.push(order);

        // Group by day for hourly breakdown
        if (order.createdAt) {
          const orderDate = order.createdAt.toDate();
          const dateKey = orderDate.toISOString().split('T')[0]; // YYYY-MM-DD
          const hour = orderDate.getHours();
          
          if (!accountGroups[accountName].dailyData[dateKey]) {
            accountGroups[accountName].dailyData[dateKey] = {
              date: dateKey,
              hours: Array(24).fill().map(() => ({
                pieces: 0,
                totalSR: 0,
                couponEGP: 0,
                depositEGP: 0,
                orders: []
              }))
            };
          }

          accountGroups[accountName].dailyData[dateKey].hours[hour].pieces += pieces;
          accountGroups[accountName].dailyData[dateKey].hours[hour].totalSR += totalSR;
          accountGroups[accountName].dailyData[dateKey].hours[hour].couponEGP += couponEGP;
          accountGroups[accountName].dailyData[dateKey].hours[hour].depositEGP += depositEGP;
          accountGroups[accountName].dailyData[dateKey].hours[hour].orders.push(order);
        }
      });

      // Convert to array and calculate totals
      const accountDataArray = Object.values(accountGroups).map(account => ({
        ...account,
        grandTotal: account.totalSR + account.totalCouponEGP + account.totalDepositEGP
      }));

      setAccountData(accountDataArray);
    };

    processAccountData();
  }, [orders, filters]);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const clearFilters = () => {
    setFilters({
      account: "",
      dateFrom: today,
      dateTo: today,
    });
  };

  // Calculate overall totals
  const overallTotals = accountData.reduce((totals, account) => ({
    totalPieces: totals.totalPieces + account.totalPieces,
    totalSR: totals.totalSR + account.totalSR,
    totalCouponEGP: totals.totalCouponEGP + account.totalCouponEGP,
    totalDepositEGP: totals.totalDepositEGP + account.totalDepositEGP,
    grandTotal: totals.grandTotal + account.grandTotal
  }), {
    totalPieces: 0,
    totalSR: 0,
    totalCouponEGP: 0,
    totalDepositEGP: 0,
    grandTotal: 0
  });

  return (
    <div className="p-6 max-w-full mx-auto">
      <h1 className="text-2xl font-bold mb-4">Accounts Dashboard</h1>

      {/* Filters */}
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <div className="flex gap-4 mb-4 flex-wrap">
          <div className="flex-1 min-w-200">
            <label className="block text-sm font-medium mb-1">Account</label>
            <select
              name="account"
              value={filters.account}
              onChange={handleFilterChange}
              className="border rounded-md p-2 w-full"
            >
              <option value="">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.name}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-200">
            <label className="block text-sm font-medium mb-1">Date From</label>
            <input
              type="date"
              name="dateFrom"
              value={filters.dateFrom}
              max={filters.dateTo}
              onChange={handleFilterChange}
              className="border rounded-md p-2 w-full"
            />
          </div>
          <div className="flex-1 min-w-200">
            <label className="block text-sm font-medium mb-1">Date To</label>
            <input
              type="date"
              name="dateTo"
              value={filters.dateTo}
              min={filters.dateFrom}
              max={today}
              onChange={handleFilterChange}
              className="border rounded-md p-2 w-full"
            />
          </div>
        </div>
        <button
          onClick={clearFilters}
          className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
        >
          Clear Filters
        </button>
      </div>

      {/* Summary Cards */}
      <div className={`grid ${isAdmin ? 'grid-cols-5' : 'grid-cols-2'} gap-4 mb-6`}>
        <div className="bg-white p-4 rounded-lg shadow border">
          <h3 className="text-sm font-medium text-gray-500">Total Accounts</h3>
          <p className="text-2xl font-bold">{accountData.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <h3 className="text-sm font-medium text-gray-500">Total Pieces</h3>
          <p className="text-2xl font-bold text-blue-600">{overallTotals.totalPieces}</p>
        </div>
        {isAdmin && (
          <>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Total SR</h3>
              <p className="text-2xl font-bold text-green-600">{overallTotals.totalSR.toFixed(2)}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Total Coupon</h3>
              <p className="text-2xl font-bold text-orange-600">{overallTotals.totalCouponEGP.toFixed(2)}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Grand Total</h3>
              <p className="text-2xl font-bold text-purple-600">{overallTotals.grandTotal.toFixed(2)}</p>
            </div>
          </>
        )}
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="border p-3 font-medium">Account Name</th>
              <th className="border p-3 font-medium text-right">Number of Pieces</th>
              {isAdmin && (
                <>
                  <th className="border p-3 font-medium text-right">Subtotal (SR)</th>
                  <th className="border p-3 font-medium text-right">Coupon (EGP)</th>
                  <th className="border p-3 font-medium text-right">Paid to Website (EGP)</th>
                  <th className="border p-3 font-medium text-right">Total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {accountData.map((account, index) => (
              <tr key={index} className="border-b hover:bg-gray-50">
                <td className="border p-3 font-medium">{account.accountName}</td>
                <td className="border p-3 text-right text-blue-600">
                  {account.totalPieces}
                </td>
                {isAdmin && (
                  <>
                    <td className="border p-3 text-right text-green-600">
                      {account.totalSR.toFixed(2)}
                    </td>
                    <td className="border p-3 text-right text-orange-600">
                      {account.totalCouponEGP.toFixed(2)}
                    </td>
                    <td className="border p-3 text-right text-red-600">
                      {account.totalDepositEGP.toFixed(2)}
                    </td>
                    <td className="border p-3 text-right font-bold text-purple-600">
                      {account.grandTotal.toFixed(2)}
                    </td>
                  </>
                )}
              </tr>
            ))}
            
            {/* Overall Totals Row */}
            {accountData.length > 0 && (
              <tr className="bg-gray-800 text-white font-bold">
                <td className="border p-3">TOTAL</td>
                <td className="border p-3 text-right">{overallTotals.totalPieces}</td>
                {isAdmin && (
                  <>
                    <td className="border p-3 text-right">{overallTotals.totalSR.toFixed(2)}</td>
                    <td className="border p-3 text-right">{overallTotals.totalCouponEGP.toFixed(2)}</td>
                    <td className="border p-3 text-right">{overallTotals.totalDepositEGP.toFixed(2)}</td>
                    <td className="border p-3 text-right">{overallTotals.grandTotal.toFixed(2)}</td>
                  </>
                )}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Daily Breakdown - Only show for admin */}
      {isAdmin && accountData.length > 0 && accountData.map((account, accountIndex) => (
        <div key={accountIndex} className="mt-8 bg-white rounded-lg shadow overflow-hidden">
          <h3 className="text-lg font-bold p-4 bg-gray-100 border-b">
            Daily Breakdown - {account.accountName}
          </h3>
          {Object.values(account.dailyData).map((day, dayIndex) => (
            <div key={dayIndex} className="border-b">
              <h4 className="font-medium p-3 bg-gray-50">
                {new Date(day.date).toLocaleDateString()}
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="border p-2">Hour</th>
                    <th className="border p-2 text-right">Pieces</th>
                    <th className="border p-2 text-right">Subtotal (SR)</th>
                    <th className="border p-2 text-right">Coupon (EGP)</th>
                    <th className="border p-2 text-right">Paid (EGP)</th>
                    <th className="border p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {day.hours.map((hourData, hourIndex) => (
                    hourData.pieces > 0 && (
                      <tr key={hourIndex} className="border-b hover:bg-gray-50">
                        <td className="border p-2">{hourIndex}:00 - {hourIndex}:59</td>
                        <td className="border p-2 text-right">{hourData.pieces}</td>
                        <td className="border p-2 text-right">{hourData.totalSR.toFixed(2)}</td>
                        <td className="border p-2 text-right">{hourData.couponEGP.toFixed(2)}</td>
                        <td className="border p-2 text-right">{hourData.depositEGP.toFixed(2)}</td>
                        <td className="border p-2 text-right font-medium">
                          {(hourData.totalSR + hourData.couponEGP + hourData.depositEGP).toFixed(2)}
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}