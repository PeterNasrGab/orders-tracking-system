import React, { useState, useEffect } from "react";
import Select from "react-select";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment
} from "firebase/firestore";
import Input from "../components/Input";
import Button from "../components/Button";
import { useSystemSettings } from "../hooks/useSystemSettings";

export default function AddOrder() {
  const { settings: systemSettings, loading: settingsLoading } = useSystemSettings();
  const [form, setForm] = useState({
    customerId: "",
    customerName: "",
    phone: "",
    clientType: "",
    totalSR: "",
    depositEGP: "",
    orderType: "B",
    discountSR: "",
    pieces: "",
    extraSR: "",
    customerCode: "",
  });

  const [customers, setCustomers] = useState([]);
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const [totals, setTotals] = useState({
    totalOrderEGP: 0,
    outstandingEGP: 0,
    extraEGP: 0,
    baseEGP: 0,
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Load customers
  useEffect(() => {
    const fetchData = async () => {
      const custSnap = await getDocs(collection(db, "customers"));
      const custList = custSnap.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        phone: doc.data().phone,
        customerCode: doc.data().customerCode,
        clientType: doc.data().clientType,
      }));
      custList.sort((a, b) => a.name.localeCompare(b.name));
      setCustomers(custList);
    };
    fetchData();
  }, []);

  // Check for pre-filled data from upload approval
  useEffect(() => {
    const prefilledData = sessionStorage.getItem('prefilledOrderData');
    const uploadId = sessionStorage.getItem('uploadId');

    if (prefilledData && uploadId) {
      try {
        const data = JSON.parse(prefilledData);
        setForm(prev => ({
          ...prev,
          customerId: data.customerId || "",
          customerName: data.customerName || "",
          phone: data.phone || "",
          clientType: data.clientType || "",
          depositEGP: data.depositEGP || "",
          orderType: data.orderType || "B",
          totalSR: data.totalSR || "",
          pieces: data.pieces || "",
          extraSR: data.extraSR || "",
           customerCode: data.customerCode || "",
        }));

        if (data.customerId && customers.length > 0) {
          const customerOption = customers.find(c => c.id === data.customerId);
          if (customerOption) {
            const selectedOption = { 
              value: customerOption.id, 
              label: `${customerOption.name} (${customerOption.customerCode})` 
            };
            setSelectedCustomer(selectedOption);
          }
        }

        setMessage("✅ Order data pre-filled from upload. Please complete the order details.");
      } catch (error) {
        throw error;
      }
    }
  }, [customers]);

  useEffect(() => {
    const prefilledData = sessionStorage.getItem('prefilledOrderData');
    const uploadId = sessionStorage.getItem('uploadId');

    if (prefilledData && uploadId && customers.length > 0) {
      try {
        const data = JSON.parse(prefilledData);

        if (data.customerId && !selectedCustomer) {
          const customerOption = customers.find(c => c.id === data.customerId);
          if (customerOption) {
            const selectedOption = {
              value: customerOption.id,
              label: `${customerOption.name} (${customerOption.customerCode})`
            };
            setSelectedCustomer(selectedOption);
          }
        }
      } catch (error) {
        throw error;
      }
    }
  }, [customers, selectedCustomer]);

// Customer select
const handleCustomerChange = (selectedOption) => {
  const selectedCustomer = customers.find((c) => c.id === selectedOption.value);
  setForm((prev) => ({
    ...prev,
    customerId: selectedCustomer.id,
    customerName: selectedCustomer.name,
    phone: selectedCustomer.phone,
    clientType: selectedCustomer.clientType,
    customerCode: selectedCustomer.customerCode,
  }));
  setSelectedCustomer(selectedOption);
  if (errors.customerId) {
    setErrors(prev => ({ ...prev, customerId: "" }));
  }
};

  // Validate new customer
  const validateCustomer = () => {
    const newErrors = {};
    if (!form.customerName.trim()) newErrors.customerName = "Name is required";
    if (!form.phone.trim()) newErrors.phone = "Phone is required";
    else if (!/^[0-9]{10,15}$/.test(form.phone)) newErrors.phone = "Invalid phone number";
    if (!form.clientType.trim()) newErrors.clientType = "Type is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Validate mandatory fields
  const validateMandatoryFields = () => {
    const newErrors = {};
    if (!form.customerId) {
      newErrors.customerId = "Customer is required";
    }
    if (!form.totalSR || Number(form.totalSR) <= 0) {
      newErrors.totalSR = "Total SR is required and must be greater than 0";
    }
    if (!form.pieces || Number(form.pieces) <= 0) {
      newErrors.pieces = "Pieces is required and must be greater than 0";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Generate next order ID using new format: O-B1, O-G1, etc.
  const generateOrderId = async (orderType) => {
    const counterRef = doc(db, "counters", "orders");
    const counterSnap = await getDoc(counterRef);

    let nextNumber = 1;

    if (counterSnap.exists()) {
      nextNumber = counterSnap.data().lastNumber + 1;
      await updateDoc(counterRef, { lastNumber: increment(1) });
    } else {
      await setDoc(counterRef, { lastNumber: 1 });
    }

    // Format: O-B1, O-G1, O-B2, O-G2, etc.
    const prefix = orderType === "B" ? "O-B" : "O-G";
    return `${prefix}${nextNumber}`;
  };

  // Generate customer code using sequential numbers (WS-1, WS-2, RE-1, RE-2)
  const generateCustomerCode = async (type) => {
    // Get prefix from system settings or use defaults
    const prefix = type === "Wholesale" 
      ? (systemSettings.customerCodePrefixWholesale || "WS")
      : (systemSettings.customerCodePrefixRetail || "RE");
    
    // Query customers of the same type
    const q = query(collection(db, "customers"), where("clientType", "==", type));
    const snap = await getDocs(q);
    
    // Extract existing codes with the same prefix
    const existingCodes = snap.docs
      .map((doc) => doc.data().customerCode)
      .filter((code) => code && code.startsWith(prefix))
      .map((code) => {
        // Extract number from code like "WS-1" or "RE-12"
        const match = code.match(new RegExp(`^${prefix}-(\\d+)$`));
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0);
    
    // Find the next sequential number
    const nextNumber = existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
    
    return `${prefix}-${nextNumber}`;
  };

  // Add new customer
  const handleAddCustomer = async () => {
    if (!validateCustomer()) {
      setMessage("⚠️ Please fix errors before saving customer.");
      return;
    }

    try {
      const customerCode = await generateCustomerCode(form.clientType);
      const newCust = {
        name: form.customerName,
        phone: form.phone,
        clientType: form.clientType,
        customerCode,
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, "customers"), newCust);
      const newCustomer = { 
        id: docRef.id, 
        ...newCust,
        customerCode // Make sure customerCode is included
      };
      setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({ ...prev, customerId: docRef.id }));
      
      // Auto-select the newly created customer
      const selectedOption = {
        value: docRef.id,
        label: `${form.customerName} (${customerCode})`
      };
      setSelectedCustomer(selectedOption);
      
      setNewCustomerMode(false);
      setMessage(`✅ Customer added successfully! Code: ${customerCode}`);
      setErrors({});
    } catch (err) {
      setMessage("❌ Failed to add customer.");
    }
  };

  // Calculate totals using system settings - FIXED VERSION
  useEffect(() => {
    if (settingsLoading || !systemSettings) return;

    const totalSR = Number(form.totalSR || 0);
    const depositEGP = Number(form.depositEGP || 0);
    const discountSR = Number(form.discountSR || 0);
    const extraSR = Number(form.extraSR || 0);

    // Calculate net SR after discount deduction
    const netSR = totalSR - discountSR;

    let baseEGP = 0;
    const threshold = systemSettings.wholesaleThreshold || 1500;

    if (form.clientType === "Wholesale") {
      if (form.orderType === "B") {
        baseEGP = totalSR > threshold 
          ? (netSR * (systemSettings.barryWholesaleAbove1500 || 12.25))
          : netSR * (systemSettings.barryWholesaleBelow1500 || 12.5);
      } else if (form.orderType === "G") {
        baseEGP = totalSR > threshold
          ? netSR * (systemSettings.gawyWholesaleAbove1500 || 13.5)
          : netSR * (systemSettings.gawyWholesaleBelow1500 || 14);
      }
    } else if (form.clientType === "Retail") {
      baseEGP = form.orderType === "B" 
        ? netSR * (systemSettings.barryRetail || 14.5)
        : netSR * (systemSettings.gawyRetail || 15.5);
    }

    // Calculate extraEGP (extraSR * 2)
    const extraEGP = extraSR * 2;

    // Calculate total order EGP (base EGP + extra EGP)
    const totalOrderEGP = baseEGP + extraEGP;
    const outstandingEGP = totalOrderEGP - depositEGP;

    setTotals({ 
      baseEGP, 
      extraEGP, 
      totalOrderEGP, 
      outstandingEGP 
    });
  }, [
    form.totalSR, 
    form.depositEGP, 
    form.discountSR, 
    form.extraSR,
    form.clientType, 
    form.orderType,
    systemSettings, 
    settingsLoading
  ]);

 // Handle order submit
const handleSubmit = async (e) => {
  e.preventDefault();

  if (!validateMandatoryFields()) {
    setMessage("⚠️ Please fill all required fields");
    return;
  }

  try {
    const prefilledData = sessionStorage.getItem('prefilledOrderData');
    const existingOrderData = prefilledData ? JSON.parse(prefilledData) : null;
    const existingOrderId = existingOrderData?.existingOrderId;

    // Find customer to get customerCode
    const selectedCustomerData = customers.find(c => c.id === form.customerId);
    const customerCode = selectedCustomerData?.customerCode || "";

    let orderId;
    let firestoreOrderId;
    let orderDocRef;

    if (existingOrderId && existingOrderId !== "NEW_ORDER") {
      firestoreOrderId = existingOrderId;
      const orderRef = doc(db, "orders", firestoreOrderId);
      const existingOrderSnap = await getDoc(orderRef);
      if (existingOrderSnap.exists()) {
        const existingOrderData = existingOrderSnap.data();
        orderId = existingOrderData.orderId;
      } else {
        throw new Error("Existing order not found");
      }
      
      await updateDoc(orderRef, {
        ...form,
        customerCode: customerCode, // Add customerCode
        status: "Requested",
        totalEGP: totals.totalOrderEGP,
        outstanding: totals.outstandingEGP,
        discountSR: Number(form.discountSR || 0),
        extraSR: Number(form.extraSR || 0),
        extraEGP: totals.extraEGP,
        updatedAt: serverTimestamp(),
      });

      orderDocRef = orderRef;
    } else {
      orderId = await generateOrderId(form.orderType);
      firestoreOrderId = null;

      const newOrder = {
        ...form,
        customerCode: customerCode, // Add customerCode
        orderId,
        createdAt: serverTimestamp(),
        status: "Requested",
        totalEGP: totals.totalOrderEGP,
        outstanding: totals.outstandingEGP,
        discountSR: Number(form.discountSR || 0),
        extraSR: Number(form.extraSR || 0),
        extraEGP: totals.extraEGP,
        uploadId: sessionStorage.getItem('uploadId') || null,
      };

      orderDocRef = await addDoc(collection(db, "orders"), newOrder);
      firestoreOrderId = orderDocRef.id;
    }

    if (sessionStorage.getItem('uploadId')) {
      sessionStorage.removeItem('prefilledOrderData');
      sessionStorage.removeItem('uploadId');
    }

    setMessage(`✅ Order ${existingOrderId ? 'updated' : 'added'} successfully! Order ID: ${orderId} (Status: Requested)`);

    setForm({
      customerId: "",
      customerName: "",
      phone: "",
      clientType: "",
      totalSR: "",
      depositEGP: "",
      orderType: "B",
      discountSR: "",
      pieces: "",
      extraSR: "",
      customerCode: "",
    });
    setSelectedCustomer(null);
    setTotals({ 
      totalOrderEGP: 0, 
      outstandingEGP: 0,
      extraEGP: 0,
      baseEGP: 0 
    });
    setErrors({});
  } catch (err) {
    console.error("Error:", err);
    setMessage("❌ Error " + (existingOrderId ? 'updating' : 'adding') + " order: " + err.message);
  }
};
  const customStyles = {
    control: (base, state) => ({
      ...base,
      borderColor: errors.customerId ? '#ef4444' : '#d1d5db',
      borderRadius: '0.5rem',
      '&:hover': {
        borderColor: errors.customerId ? '#ef4444' : '#3b82f6'
      },
      boxShadow: state.isFocused ? `0 0 0 3px ${errors.customerId ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'}` : 'none',
    })
  };

  if (settingsLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto bg-white shadow-lg rounded-2xl p-6 mt-10">
      <h2 className="text-2xl font-semibold mb-6 text-center text-gray-800">➕ Add New Order</h2>

      {/* Customer select/add */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-gray-700 font-medium">
            Customer <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            className="text-blue-600 hover:underline text-sm"
            onClick={() => { setNewCustomerMode(!newCustomerMode); setErrors({}); setMessage(""); }}
          >
            {newCustomerMode ? "Select Existing" : "➕ Add New Customer"}
          </button>
        </div>
        {!newCustomerMode ? (
          <div>
            <Select
              options={customers.map((c) => ({ 
                value: c.id, 
                label: `${c.name} (${c.customerCode || c.id})` 
              }))}
              value={selectedCustomer}
              onChange={handleCustomerChange}
              placeholder="Search and select customer..."
              isSearchable
              classNamePrefix="react-select"
              styles={customStyles}
            />
            {errors.customerId && <p className="text-red-500 text-sm mt-1">{errors.customerId}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <Input
                label="Customer Name"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                className={errors.customerName ? "border-red-500" : ""}
              />
              {errors.customerName && <p className="text-red-500 text-sm mt-1">{errors.customerName}</p>}
            </div>
            <div>
              <Input
                label="Phone Number"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={errors.phone ? "border-red-500" : ""}
              />
              {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">Customer Type</label>
              <select
                value={form.clientType}
                onChange={(e) => setForm({ ...form, clientType: e.target.value })}
                className={`border border-gray-300 rounded-lg p-2 w-full focus:ring focus:ring-blue-200 ${errors.clientType ? "border-red-500" : ""}`}
              >
                <option value="">Select Type</option>
                {systemSettings.clientTypes?.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {errors.clientType && <p className="text-red-500 text-sm mt-1">{errors.clientType}</p>}
            </div>
            <div className="sm:col-span-3 text-right">
              <Button onClick={handleAddCustomer}>Save Customer</Button>
            </div>
          </div>
        )}
      </div>

      {/* Order Details */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-gray-700 font-medium mb-2">Order Type</label>
          <select
            value={form.orderType}
            onChange={(e) => setForm({ ...form, orderType: e.target.value })}
            className="border border-gray-300 rounded-lg p-2 w-full focus:ring focus:ring-blue-200"
          >
            {systemSettings.orderTypes?.map((type) => (
              <option key={type} value={type}>
                {type === "B" ? "Barry" : "Gawy"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Input
            label={
              <>
                Total (SR) <span className="text-red-500">*</span>
              </>
            }
            type="number"
            value={form.totalSR}
            onChange={(e) => {
              setForm({ ...form, totalSR: e.target.value });
              if (errors.totalSR) {
                setErrors(prev => ({ ...prev, totalSR: "" }));
              }
            }}
            className={errors.totalSR ? "border-red-500" : ""}
          />
          {errors.totalSR && <p className="text-red-500 text-sm mt-1">{errors.totalSR}</p>}
        </div>
        <Input label="Deposit (EGP)" type="number" value={form.depositEGP} onChange={(e) => setForm({ ...form, depositEGP: e.target.value })} />
        <div>
          <Input
            label={
              <>
                Pieces <span className="text-red-500">*</span>
              </>
            }
            type="number"
            value={form.pieces}
            onChange={(e) => {
              setForm({ ...form, pieces: e.target.value });
              if (errors.pieces) {
                setErrors(prev => ({ ...prev, pieces: "" }));
              }
            }}
            className={errors.pieces ? "border-red-500" : ""}
          />
          {errors.pieces && <p className="text-red-500 text-sm mt-1">{errors.pieces}</p>}
        </div>
      </div>

      {/* Discount & Extra SR */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
        <Input 
          label="Discount (SR)" 
          type="number" 
          value={form.discountSR} 
          onChange={(e) => setForm({ ...form, discountSR: e.target.value })} 
        />
        <Input 
          label="Extra (SR)" 
          type="number" 
          value={form.extraSR} 
          onChange={(e) => setForm({ ...form, extraSR: e.target.value })} 
        />
        <div className="sm:col-span-2"></div>
      </div>

      {/* Totals */}
      <div className="mb-4 text-gray-700 bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <p className="font-medium">Base Order (EGP): <span className="text-blue-600">{totals.baseEGP.toFixed(2)}</span></p>
            <p className="text-sm text-gray-500">(Total SR - Discount SR) × Conversion Rate</p>
          </div>
          <div>
            <p className="font-medium">Extra (EGP): <span className="text-green-600">{totals.extraEGP.toFixed(2)}</span></p>
            <p className="text-sm text-gray-500">(Extra SR × 2)</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="font-semibold text-lg">Total Order (EGP): <span className="text-blue-700">{totals.totalOrderEGP.toFixed(2)}</span></p>
          <p className="font-medium">Outstanding Amount (EGP): <span className={totals.outstandingEGP > 0 ? "text-red-600" : "text-green-600"}>{totals.outstandingEGP.toFixed(2)}</span></p>
        </div>
      </div>

      {/* Submit */}
      <div className="text-center">
        <Button onClick={handleSubmit}>Add Order</Button>
        {message && <p className={`mt-3 ${message.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{message}</p>}
      </div>
    </div>
  );
}