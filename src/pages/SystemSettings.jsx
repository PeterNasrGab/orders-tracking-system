import React, { useState, useEffect } from "react";
import { useSystemSettings } from "../hooks/useSystemSettings";
import { useAuth } from "../contexts/AuthContext";
import { 
  FiSettings, FiSave, FiDollarSign, FiPercent, FiRefreshCw, 
  FiAlertCircle, FiCheck, FiPlus, FiTrash2, FiEdit2, FiX,
  FiList
} from "react-icons/fi";
import { db } from "../firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";

// Default settings object
const defaultSettings = {
  barryWholesaleBelow1500: 12.5,
  barryWholesaleAbove1500: 12.25,
  gawyWholesaleBelow1500: 14,
  gawyWholesaleAbove1500: 13.5,
  barryRetail: 14.5,
  gawyRetail: 15.5,
  paidToWebsite: 12,
  shipping: 12.7,
  coupon: 12,
  orderStatuses: [
    "Requested",
    "Order Placed", 
    "Shipped to Egypt",
    "Delivered to Egypt",
    "In Distribution",
    "Shipped to clients"
  ],
  clientTypes: ["Retail", "Wholesale"],
  orderTypes: ["B", "G"],
  uploadStatuses: ["Under Approval", "Approved", "Rejected"],
  orderPlacedMessageWholesale: `اهلا {customerName} ({customerCode})
  عدد القطع ({pieces})
قيمة الطلب بالريال {totalSR}
بدون كود {extraSR}
قيمة الطلب بالمصرى {totalEGP}
الاجمالى المصرى {totalEGPPlusExtra}
العربون {deposit}
المتبقى من الطلب {outstanding}
بعد دفع العربون، يرجى إرفاق لقطة شاشة للمعاملة وعناصر الطلب عبر الرابط التالي للتأكيد: https://orders-tracking-system.vercel.app/upload`,
  orderPlacedMessageRetailNoDeposit: `Hi {customerName} ({customerCode})
This is a confirmation message from us to make sure that every detail about your order is exactly as you wanted.
no of items: {pieces}
total: {totalEGP}

And the photo below is the one you requested.

You won't be able to change your order once you confirm.

You are marked as a VIP client on our list..no deposit is needed.

Thank you for purchasing from us.
Youla's Yard.`,
  orderPlacedMessageRetailWithDeposit: `Hi {customerName} ({customerCode})
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
Youla's Yard.`,
  orderPlacedMessage: "📦 Hello {customerName} ({customerCode}), your order ({orderId}) has been *placed* successfully! ✅",
  inDistributionMessage: "Your order ({orderId}) has arrived. It will be delivered to you in 1-3 days. Kindly transfer the outstanding amount ({outstandingAmount} EGP) and upload the receipt screenshot on the following link: https://orders-tracking-system.vercel.app/upload",
  paymentRejectedMessage: "Order not placed as attached deposit photo is inconsistent with the entered payment amount.\n\nKindly re-upload the right deposit amount on the same link",
  wholesaleThreshold: 1500,
  customerCodePrefixRetail: "RE",
  customerCodePrefixWholesale: "WS",
  orderCodePrefixBarry: "B",
  orderCodePrefixGawy: "G",
  defaultCurrency: "EGP",
  secondaryCurrency: "SR",
};

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
        return <FiSettings className="text-blue-500 text-xl" />;
      default:
        return <FiSettings className="text-gray-500 text-xl" />;
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

export default function SystemSettings() {
  const { isAdmin } = useAuth();
  const { settings, loading, error, saveSettings, reloadSettings } = useSystemSettings();
  const [localSettings, setLocalSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [toastCounter, setToastCounter] = useState(0);
  
  // Accounts state
  const [accounts, setAccounts] = useState([]);
  const [newAccountName, setNewAccountName] = useState("");
  const [editingAccount, setEditingAccount] = useState(null);
  const [editAccountName, setEditAccountName] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Initialize local settings when settings load
  useEffect(() => {
    if (!loading && settings) {
      // Merge with defaults to ensure all fields exist
      const mergedSettings = {
        ...defaultSettings,
        ...settings,
        clientTypes: settings.clientTypes?.join('\n') || defaultSettings.clientTypes.join('\n'),
        orderTypes: settings.orderTypes?.join('\n') || defaultSettings.orderTypes.join('\n'),
        uploadStatuses: settings.uploadStatuses?.join('\n') || defaultSettings.uploadStatuses.join('\n'),
      };
      
      setLocalSettings(mergedSettings);
    }
  }, [settings, loading]);

  // Load accounts from Firestore
  const loadAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const accountsSnapshot = await getDocs(collection(db, "accounts"));
      const accountsList = accountsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      accountsList.sort((a, b) => a.name.localeCompare(b.name));
      setAccounts(accountsList);
    } catch (error) {
      showToast("Failed to load accounts", "error");
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Load accounts on component mount
  useEffect(() => {
    if (isAdmin) {
      loadAccounts();
    }
  }, [isAdmin]);

  // Toast functions
  const showToast = (message, type = "info") => {
    const id = `toast-${Date.now()}-${toastCounter}`;
    setToastCounter(prev => prev + 1);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Save settings to Firestore
  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      
      // Convert text areas to arrays and ensure ALL fields are included
      const processedSettings = {
        ...localSettings,
        clientTypes: localSettings.clientTypes.split('\n').filter(line => line.trim()),
        orderTypes: localSettings.orderTypes.split('\n').filter(line => line.trim()),
        uploadStatuses: localSettings.uploadStatuses.split('\n').filter(line => line.trim()),
        
        // Ensure all numeric fields have values
        barryWholesaleBelow1500: parseFloat(localSettings.barryWholesaleBelow1500) || 12.5,
        barryWholesaleAbove1500: parseFloat(localSettings.barryWholesaleAbove1500) || 12.25,
        gawyWholesaleBelow1500: parseFloat(localSettings.gawyWholesaleBelow1500) || 14,
        gawyWholesaleAbove1500: parseFloat(localSettings.gawyWholesaleAbove1500) || 13.5,
        barryRetail: parseFloat(localSettings.barryRetail) || 14.5,
        gawyRetail: parseFloat(localSettings.gawyRetail) || 15.5,
        paidToWebsite: parseFloat(localSettings.paidToWebsite) || 12,
        shipping: parseFloat(localSettings.shipping) || 12.7,
        coupon: parseFloat(localSettings.coupon) || 12,
        wholesaleThreshold: parseFloat(localSettings.wholesaleThreshold) || 1500,
        
        // Text fields
        customerCodePrefixRetail: localSettings.customerCodePrefixRetail || "RE",
        customerCodePrefixWholesale: localSettings.customerCodePrefixWholesale || "WS",
        orderCodePrefixBarry: localSettings.orderCodePrefixBarry || "B",
        orderCodePrefixGawy: localSettings.orderCodePrefixGawy || "G",
        defaultCurrency: localSettings.defaultCurrency || "EGP",
        secondaryCurrency: localSettings.secondaryCurrency || "SR",
        
        // WhatsApp messages
        orderPlacedMessage: localSettings.orderPlacedMessage || defaultSettings.orderPlacedMessage,
        orderPlacedMessageWholesale: localSettings.orderPlacedMessageWholesale || defaultSettings.orderPlacedMessageWholesale,
        orderPlacedMessageRetailNoDeposit: localSettings.orderPlacedMessageRetailNoDeposit || defaultSettings.orderPlacedMessageRetailNoDeposit,
        orderPlacedMessageRetailWithDeposit: localSettings.orderPlacedMessageRetailWithDeposit || defaultSettings.orderPlacedMessageRetailWithDeposit,
        inDistributionMessage: localSettings.inDistributionMessage || defaultSettings.inDistributionMessage,
        paymentRejectedMessage: localSettings.paymentRejectedMessage || defaultSettings.paymentRejectedMessage,
      };

      const success = await saveSettings(processedSettings);
      if (success) {
        showToast("Settings saved successfully!", "success");
      } else {
        showToast("Failed to save settings.", "error");
      }
    } catch (error) {
      showToast("Failed to save settings.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Reset to defaults
  const resetToDefaults = async () => {
    // Reset to default settings with text areas converted to strings
    const resetSettings = {
      ...defaultSettings,
      clientTypes: defaultSettings.clientTypes.join('\n'),
      orderTypes: defaultSettings.orderTypes.join('\n'),
      uploadStatuses: defaultSettings.uploadStatuses.join('\n'),
    };
    
    setLocalSettings(resetSettings);
    showToast("Settings reset to defaults!", "info");
  };

  const handleSettingChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Add new account
  const handleAddAccount = async () => {
    if (!newAccountName.trim()) {
      showToast("Please enter an account name", "warning");
      return;
    }

    try {
      // Check if account already exists
      const existingAccount = accounts.find(
        account => account.name.toLowerCase() === newAccountName.trim().toLowerCase()
      );
      
      if (existingAccount) {
        showToast("Account already exists", "warning");
        return;
      }

      const docRef = await addDoc(collection(db, "accounts"), {
        name: newAccountName.trim(),
        createdAt: new Date().toISOString(),
        createdBy: "system"
      });

      const newAccount = {
        id: docRef.id,
        name: newAccountName.trim()
      };

      setAccounts(prev => [...prev, newAccount].sort((a, b) => a.name.localeCompare(b.name)));
      setNewAccountName("");
      showToast("Account added successfully!", "success");
    } catch (error) {
      showToast("Failed to add account", "error");
    }
  };

  // Start editing account
  const startEditAccount = (account) => {
    setEditingAccount(account.id);
    setEditAccountName(account.name);
  };

  // Cancel editing
  const cancelEditAccount = () => {
    setEditingAccount(null);
    setEditAccountName("");
  };

  // Update account
  const handleUpdateAccount = async () => {
    if (!editAccountName.trim()) {
      showToast("Please enter an account name", "warning");
      return;
    }

    try {
      // Check if account name already exists (excluding the current one)
      const existingAccount = accounts.find(
        account => 
          account.id !== editingAccount && 
          account.name.toLowerCase() === editAccountName.trim().toLowerCase()
      );
      
      if (existingAccount) {
        showToast("Account name already exists", "warning");
        return;
      }

      await updateDoc(doc(db, "accounts", editingAccount), {
        name: editAccountName.trim(),
        updatedAt: new Date().toISOString()
      });

      setAccounts(prev =>
        prev.map(account =>
          account.id === editingAccount
            ? { ...account, name: editAccountName.trim() }
            : account
        ).sort((a, b) => a.name.localeCompare(b.name))
      );

      setEditingAccount(null);
      setEditAccountName("");
      showToast("Account updated successfully!", "success");
    } catch (error) {
      showToast("Failed to update account", "error");
    }
  };

  // Delete account
  const handleDeleteAccount = async (accountId, accountName) => {
    if (!window.confirm(`Are you sure you want to delete account "${accountName}"?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "accounts", accountId));
      setAccounts(prev => prev.filter(account => account.id !== accountId));
      showToast("Account deleted successfully!", "success");
    } catch (error) {
      showToast("Failed to delete account", "error");
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md p-8 mt-10 text-center">
        <FiAlertCircle className="mx-auto text-6xl text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
        <p className="text-gray-600">You need administrator privileges to access system settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md p-8 mt-10 text-center">
        <FiAlertCircle className="mx-auto text-6xl text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Error Loading Settings</h2>
        <p className="text-gray-600">{error}</p>
        <button
          onClick={reloadSettings}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-lg p-6 mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-100 p-3 rounded-xl">
            <FiSettings className="text-blue-600 text-2xl" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">System Settings</h1>
            <p className="text-gray-600">Configure application-wide settings and manage accounts</p>
          </div>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={resetToDefaults}
            className="flex items-center space-x-2 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <FiRefreshCw size={18} />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <FiSave size={18} />
            <span>{saving ? "Saving..." : "Save Settings"}</span>
          </button>
        </div>
      </div>

      {/* Toast Container */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Pricing Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pricing Configuration */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-6">
            <h2 className="text-xl font-bold text-blue-800 mb-4 flex items-center space-x-2">
              <FiDollarSign />
              <span>Pricing Configuration</span>
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Barry Wholesale (Below {localSettings.wholesaleThreshold || 1500} SR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={localSettings.barryWholesaleBelow1500 || ''}
                  onChange={(e) => handleSettingChange("barryWholesaleBelow1500", parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Barry Wholesale (Above {localSettings.wholesaleThreshold || 1500} SR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={localSettings.barryWholesaleAbove1500 || ''}
                  onChange={(e) => handleSettingChange("barryWholesaleAbove1500", parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gawy Wholesale (Below {localSettings.wholesaleThreshold || 1500} SR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={localSettings.gawyWholesaleBelow1500 || ''}
                  onChange={(e) => handleSettingChange("gawyWholesaleBelow1500", parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gawy Wholesale (Above {localSettings.wholesaleThreshold || 1500} SR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={localSettings.gawyWholesaleAbove1500 || ''}
                  onChange={(e) => handleSettingChange("gawyWholesaleAbove1500", parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Barry Retail Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={localSettings.barryRetail || ''}
                  onChange={(e) => handleSettingChange("barryRetail", parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gawy Retail Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={localSettings.gawyRetail || ''}
                  onChange={(e) => handleSettingChange("gawyRetail", parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* NEW FIELDS - Additional Charges */}
              <div className="pt-4 border-t border-blue-200">
                <h3 className="text-lg font-semibold text-blue-700 mb-3">Additional Charges</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paid to Website
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={localSettings.paidToWebsite || ''}
                    onChange={(e) => handleSettingChange("paidToWebsite", parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="12"
                  />
                  </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Shipping
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={localSettings.shipping || ''}
                    onChange={(e) => handleSettingChange("shipping", parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="12.7"
                  />                
                  </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Coupon
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={localSettings.coupon || ''}
                    onChange={(e) => handleSettingChange("coupon", parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="12"
                  />                
                  </div>
              </div>
            </div>
          </div>

        {/* WhatsApp Messages */}
<div className="bg-gradient-to-r from-teal-50 to-teal-100 border border-teal-200 rounded-xl p-6">
  <h2 className="text-xl font-bold text-teal-800 mb-4">WhatsApp Messages</h2>
  
  <div className="space-y-4">
    {/* Wholesale Message - Keep as is, doesn't need customerCode */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Wholesale (Gomla) Order Placed Message
      </label>
      <textarea
        rows="5"
        value={localSettings.orderPlacedMessageWholesale || ''}
        onChange={(e) => handleSettingChange("orderPlacedMessageWholesale", e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      />
      <p className="text-xs text-gray-500 mt-1">
        Variables: {"{pieces}"}, {"{totalSR}"}, {"{extraSR}"}, {"{totalEGP}"}, {"{totalEGPPlusExtra}"}, {"{deposit}"}, {"{outstanding}"}
      </p>
    </div>

    {/* Retail No Deposit Message - Add customerCode */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Retail Order (No Deposit) Message
      </label>
      <textarea
        rows="6"
        value={localSettings.orderPlacedMessageRetailNoDeposit || ''}
        onChange={(e) => handleSettingChange("orderPlacedMessageRetailNoDeposit", e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      />
      <p className="text-xs text-gray-500 mt-1">
        Variables: {"{customerName}"}, {"{customerCode}"}, {"{pieces}"}, {"{totalEGP}"}
      </p>
    </div>

    {/* Retail With Deposit Message - Add customerCode */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Retail Order (With Deposit) Message
      </label>
      <textarea
        rows="8"
        value={localSettings.orderPlacedMessageRetailWithDeposit || ''}
        onChange={(e) => handleSettingChange("orderPlacedMessageRetailWithDeposit", e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      />
      <p className="text-xs text-gray-500 mt-1">
        Variables: {"{customerName}"}, {"{customerCode}"}, {"{pieces}"}, {"{totalEGP}"}, {"{deposit}"}, {"{outstanding}"}
      </p>
    </div>

    {/* Legacy Order Placed Message - Add customerCode */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Legacy Order Placed Message (For backward compatibility)
      </label>
      <textarea
        rows="3"
        value={localSettings.orderPlacedMessage || ''}
        onChange={(e) => handleSettingChange("orderPlacedMessage", e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        placeholder="Use {customerName} and {orderId} as variables"
      />
      <p className="text-xs text-gray-500 mt-1">
        Variables: {"{customerName}"}, {"{customerCode}"}, {"{orderId}"}
      </p>
    </div>

    {/* In Distribution Message - Add customerCode */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        In Distribution Message
      </label>
      <textarea
        rows="3"
        value={localSettings.inDistributionMessage || ''}
        onChange={(e) => handleSettingChange("inDistributionMessage", e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      />
      <p className="text-xs text-gray-500 mt-1">
        Variables: {"{customerName}"}, {"{customerCode}"}, {"{orderId}"}, {"{outstandingAmount}"}
      </p>
    </div>

    {/* Payment Rejected Message - Add customerCode if it has customerName */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Payment Rejected Message
      </label>
      <textarea
        rows="3"
        value={localSettings.paymentRejectedMessage || ''}
        onChange={(e) => handleSettingChange("paymentRejectedMessage", e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      />
      <p className="text-xs text-gray-500 mt-1">
        Variables: {"{customerName}"}, {"{customerCode}"} (if used in message)
      </p>
    </div>
  </div>
</div>
        </div>

        {/* Right Column: Accounts Management */}
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-purple-800 flex items-center space-x-2">
                <FiList />
                <span>Accounts Management</span>
              </h2>
              <button
                onClick={loadAccounts}
                className="text-purple-600 hover:text-purple-800"
                title="Refresh accounts"
              >
                <FiRefreshCw size={18} />
              </button>
            </div>

            {/* Add New Account Form */}
            <div className="mb-6">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="Enter new account name"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddAccount()}
                />
                <button
                  onClick={handleAddAccount}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <FiPlus size={18} />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Accounts List */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-700 mb-2">Existing Accounts ({accounts.length})</h3>
              
              {loadingAccounts ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 inline-block"></div>
                  <p className="text-gray-500 mt-2">Loading accounts...</p>
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-6 bg-white rounded-lg border border-dashed border-gray-300">
                  <FiList className="mx-auto text-3xl text-gray-400 mb-2" />
                  <p className="text-gray-500">No accounts found</p>
                  <p className="text-sm text-gray-400">Add your first account above</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto pr-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="bg-white rounded-lg border border-gray-200 p-3 mb-2 hover:shadow-md transition-shadow"
                    >
                      {editingAccount === account.id ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={editAccountName}
                            onChange={(e) => setEditAccountName(e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                            onKeyPress={(e) => e.key === 'Enter' && handleUpdateAccount()}
                          />
                          <button
                            onClick={handleUpdateAccount}
                            className="text-green-600 hover:text-green-800"
                            title="Save"
                          >
                            <FiCheck size={18} />
                          </button>
                          <button
                            onClick={cancelEditAccount}
                            className="text-gray-500 hover:text-gray-700"
                            title="Cancel"
                          >
                            <FiX size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800">{account.name}</span>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => startEditAccount(account)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Edit"
                            >
                              <FiEdit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteAccount(account.id, account.name)}
                              className="text-red-600 hover:text-red-800"
                              title="Delete"
                            >
                              <FiTrash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Accounts Summary */}
            {accounts.length > 0 && (
              <div className="mt-4 pt-4 border-t border-purple-200">
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>Total Accounts:</span>
                  <span className="font-semibold">{accounts.length}</span>
                </div> 
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Button at Bottom */}
      <div className="flex justify-center mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center space-x-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg transition-colors disabled:opacity-50 text-lg font-semibold"
        >
          <FiSave size={20} />
          <span>{saving ? "Saving Settings..." : "Save All Settings"}</span>
        </button>
      </div>
    </div>
  );
}