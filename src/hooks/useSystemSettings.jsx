import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, enableNetwork, disableNetwork } from 'firebase/firestore';

const defaultSettings = {
  // Pricing Configuration
  barryWholesaleBelow1500: 12.5,
  barryWholesaleAbove1500: 12.25,
  gawyWholesaleBelow1500: 14,
  gawyWholesaleAbove1500: 13.5,
  barryRetail: 14.5,
  gawyRetail: 15.5,
  
  // Order Statuses
  orderStatuses: [
    "Requested",
    "Order placed", 
    "Shipped to Egypt",
    "Delivered to Egypt",
    "In Distribution",
    "Shipped to clients"
  ],
  
  // Client Types
  clientTypes: ["Retail", "Wholesale"],
  
  // Order Types
  orderTypes: ["B", "G"],
  
  // Upload Statuses
  uploadStatuses: ["Under Approval", "Approved", "Rejected"],
  
  // WhatsApp Messages
  orderPlacedMessage: "📦 Hello {customerName}, your order ({orderId}) has been *placed* successfully! ✅",
  paymentRejectedMessage: "Order not placed as attached deposit photo is inconsistent with the entered payment amount.\n\nKindly re-upload the right deposit amount on the same link",
   inDistributionMessage: "Your order ({orderId}) has arrived. It will be delivered to you in 1-3 days. Kindly transfer the outstanding amount ({outstandingAmount} EGP) and upload the receipt screenshot on the following link: http://localhost:5173/upload",
  // Thresholds
  wholesaleThreshold: 1500,
  
  // Auto-generation settings
  customerCodePrefixRetail: "RE",
  customerCodePrefixWholesale: "WS",
  orderCodePrefixBarry: "B",
  orderCodePrefixGawy: "G",
  
  // Financial Settings
  defaultCurrency: "EGP",
  secondaryCurrency: "SR",
};

export const useSystemSettings = () => {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if we're online before attempting to fetch
      if (!navigator.onLine) {
        setError("You are currently offline. Using default settings.");
        setSettings(defaultSettings);
        return;
      }

      const settingsRef = doc(db, "systemSettings", "general");
      const settingsSnap = await getDoc(settingsRef);
      
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        // Ensure arrays are properly formatted
        const processedData = {
          ...data,
          clientTypes: Array.isArray(data.clientTypes) ? data.clientTypes : defaultSettings.clientTypes,
          orderTypes: Array.isArray(data.orderTypes) ? data.orderTypes : defaultSettings.orderTypes,
          uploadStatuses: Array.isArray(data.uploadStatuses) ? data.uploadStatuses : defaultSettings.uploadStatuses,
        };
        setSettings(processedData);
      } else {
        // Initialize with default settings only if online
        if (navigator.onLine) {
          await setDoc(settingsRef, {
            ...defaultSettings,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
        setSettings(defaultSettings);
      }
    } catch (err) {
      
      if (err.code === 'unavailable' || err.message.includes('offline')) {
        setError("Unable to connect to server. Using default settings. Some features may be limited.");
        setSettings(defaultSettings);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings) => {
    try {
      // Check if online before attempting to save
      if (!navigator.onLine) {
        throw new Error("Cannot save settings while offline. Please check your internet connection.");
      }

      const settingsRef = doc(db, "systemSettings", "general");
      await setDoc(settingsRef, {
        ...newSettings,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setSettings(newSettings);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Retry loading when coming back online
  useEffect(() => {
    if (isOnline && error) {
      loadSettings();
    }
  }, [isOnline]);

  return {
    settings,
    loading,
    error,
    isOnline,
    saveSettings,
    reloadSettings: loadSettings
  };
};