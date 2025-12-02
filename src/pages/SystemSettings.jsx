import React, { useState, useEffect } from "react";
import { useSystemSettings } from "../hooks/useSystemSettings";
import { useAuth } from "../contexts/AuthContext";
import { FiSettings, FiSave, FiDollarSign, FiPercent, FiRefreshCw, FiAlertCircle, FiCheck } from "react-icons/fi";

// Toast Component (same as before)
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
          <FiAlertCircle size={16} />
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

  // Initialize local settings when settings load
  useEffect(() => {
    if (!loading && settings) {
      setLocalSettings({
        ...settings,
        clientTypes: settings.clientTypes?.join('\n') || '',
        orderTypes: settings.orderTypes?.join('\n') || '',
        uploadStatuses: settings.uploadStatuses?.join('\n') || '',
      });
    }
  }, [settings, loading]);

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
      
      // Convert text areas to arrays
      const processedSettings = {
        ...localSettings,
        clientTypes: localSettings.clientTypes.split('\n').filter(line => line.trim()),
        orderTypes: localSettings.orderTypes.split('\n').filter(line => line.trim()),
        uploadStatuses: localSettings.uploadStatuses.split('\n').filter(line => line.trim()),
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
  const defaultSettings = {
    barryWholesaleBelow1500: 12.5,
    barryWholesaleAbove1500: 12.25,
    gawyWholesaleBelow1500: 14,
    gawyWholesaleAbove1500: 13.5,
    barryRetail: 14.5,
    gawyRetail: 15.5,
    orderStatuses: "Requested\nOrder placed\nShipped to Egypt\nDelivered to Egypt\nIn Distribution\nShipped to clients",
    clientTypes: "Retail\nWholesale",
    orderTypes: "B\nG",
    uploadStatuses: "Under Approval\nApproved\nRejected",
    orderPlacedMessage: "📦 Hello {customerName}, your order ({orderId}) has been *placed* successfully! ✅",
    inDistributionMessage: "Your order ({orderId}) has arrived. It will be delivered to you in 1-3 days. Kindly transfer the outstanding amount ({outstandingAmount} EGP) and upload the receipt screenshot on the following link: http://localhost:5173/upload",
    paymentRejectedMessage: "Order not placed as attached deposit photo is inconsistent with the entered payment amount.\n\nKindly re-upload the right deposit amount on the same link",
    wholesaleThreshold: 1500,
    customerCodePrefixRetail: "RE",
    customerCodePrefixWholesale: "WS",
    orderCodePrefixBarry: "B",
    orderCodePrefixGawy: "G",
    defaultCurrency: "EGP",
    secondaryCurrency: "SR",
  };
  
  setLocalSettings(defaultSettings);
  showToast("Settings reset to defaults!", "info");
};

  const handleSettingChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }));
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
    <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-lg p-6 mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-100 p-3 rounded-xl">
            <FiSettings className="text-blue-600 text-2xl" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">System Settings</h1>
            <p className="text-gray-600">Configure application-wide settings and pricing</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pricing Configuration */}
        <div className="space-y-6">
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
            </div>
          </div>

        </div>

        {/* System Configuration */}
        <div className="space-y-6">

         {/* WhatsApp Messages */}
          <div className="bg-gradient-to-r from-teal-50 to-teal-100 border border-teal-200 rounded-xl p-6">
            <h2 className="text-xl font-bold text-teal-800 mb-4">WhatsApp Messages</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Order Placed Message
                </label>
                <textarea
                  rows="3"
                  value={localSettings.orderPlacedMessage || ''}
                  onChange={(e) => handleSettingChange("orderPlacedMessage", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Use {customerName} and {orderId} as variables"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Variables: {"{customerName}"}, {"{orderId}"}
                </p>
              </div>

              {/* ADD THIS NEW FIELD */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  In Distribution Message
                </label>
                <textarea
                  rows="3"
                  value={localSettings.inDistributionMessage || ''}
                  onChange={(e) => handleSettingChange("inDistributionMessage", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Use {customerName} and {orderId} as variables"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Variables: {"{customerName}"}, {"{orderId}"}, {"{outstandingAmount}"}
                </p>
              </div>

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
              </div>
            </div>
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