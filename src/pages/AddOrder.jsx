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
    discountEGP: "",
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
    conversionRate: 0,
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [formChanged, setFormChanged] = useState(false);

  // Helper function to round to nearest multiple of 5
  const roundToNearest5 = (number) => {
    return Math.round(number / 5) * 5;
  };

  // Helper function to ensure whole number (no decimals)
  const toWholeNumber = (number) => {
    return Math.round(parseFloat(number) || 0);
  };

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
          discountEGP: data.discountEGP || data.discountSR || "",
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
        setFormChanged(prev => !prev);
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
              label: `${customerOption.name} (${customerCode})`
            };
            setSelectedCustomer(selectedOption);
          }
        }
      } catch (error) {
        throw error;
      }
    }
  }, [customers, selectedCustomer]);

  // Calculate totals whenever form changes - UPDATED WITH ROUNDING LOGIC
  useEffect(() => {
    if (settingsLoading || !systemSettings) return;

    // Parse all numeric values as whole numbers (remove decimals)
    const totalSR = toWholeNumber(form.totalSR);
    const depositEGP = toWholeNumber(form.depositEGP);
    const discountEGP = toWholeNumber(form.discountEGP);
    const extraSR = toWholeNumber(form.extraSR);

    // Calculate conversion rate based on client type and order type
    let conversionRate = 0;
    const threshold = systemSettings.wholesaleThreshold || 1500;

    if (form.clientType && form.orderType) {
      if (form.clientType === "Wholesale") {
        if (form.orderType === "B") {
          conversionRate = totalSR > threshold 
            ? (systemSettings.barryWholesaleAbove1500 || 12.25)
            : (systemSettings.barryWholesaleBelow1500 || 12.5);
        } else if (form.orderType === "G") {
          conversionRate = totalSR > threshold
            ? (systemSettings.gawyWholesaleAbove1500 || 13.5)
            : (systemSettings.gawyWholesaleBelow1500 || 14);
        }
      } else if (form.clientType === "Retail") {
        conversionRate = form.orderType === "B" 
          ? (systemSettings.barryRetail || 14.5)
          : (systemSettings.gawyRetail || 15.5);
      }
    }

    // Calculate Base EGP before rounding: (Total SR × Conversion Rate) - Discount EGP
    const baseBeforeDiscount = totalSR * conversionRate;
    const effectiveDiscount = Math.abs(discountEGP); // Always positive discount
    const baseEGPBeforeRounding = Math.max(0, baseBeforeDiscount - effectiveDiscount);

    // Calculate Extra EGP: (Extra SR × 2) - always whole number
    let extraEGP = toWholeNumber(extraSR * 2);

    // Calculate Total Order EGP before rounding: Base EGP + Extra EGP
    const totalOrderEGPBeforeRounding = baseEGPBeforeRounding + extraEGP;

    // For Retail customers, round Base EGP and Total Order EGP to nearest multiple of 5
    let baseEGP, totalOrderEGP;
    
    if (form.clientType === "Retail") {
      baseEGP = roundToNearest5(baseEGPBeforeRounding);
      totalOrderEGP = roundToNearest5(totalOrderEGPBeforeRounding);
    } else {
      // For Wholesale or no client type, just ensure whole numbers (no decimals)
      baseEGP = toWholeNumber(baseEGPBeforeRounding);
      totalOrderEGP = toWholeNumber(totalOrderEGPBeforeRounding);
    }

    // Calculate Outstanding EGP: Total Order EGP - Deposit EGP
    const outstandingEGPBeforeRounding = Math.max(0, totalOrderEGP - depositEGP);
    
    // For Retail customers, round Outstanding to nearest multiple of 5
    let outstandingEGP;
    if (form.clientType === "Retail") {
      outstandingEGP = roundToNearest5(outstandingEGPBeforeRounding);
    } else {
      outstandingEGP = toWholeNumber(outstandingEGPBeforeRounding);
    }

    // Ensure all values are whole numbers (safety check)
    baseEGP = toWholeNumber(baseEGP);
    totalOrderEGP = toWholeNumber(totalOrderEGP);
    outstandingEGP = toWholeNumber(outstandingEGP);
    extraEGP = toWholeNumber(extraEGP);

    setTotals({ 
      baseEGP, 
      extraEGP, 
      totalOrderEGP, 
      outstandingEGP,
      conversionRate
    });
  }, [
    form.totalSR, 
    form.depositEGP, 
    form.discountEGP,
    form.extraSR,
    form.clientType, 
    form.orderType,
    systemSettings, 
    settingsLoading,
    formChanged
  ]);

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
    setFormChanged(prev => !prev);
  };

  // Handle form field changes
  const handleFormChange = (field, value) => {
    // For numeric fields, allow decimal input for SR values but convert to whole numbers in calculation
    if (["totalSR", "depositEGP", "discountEGP", "pieces", "extraSR"].includes(field)) {
      // Allow numbers and decimal point for SR values
      if (["totalSR", "extraSR", "pieces"].includes(field)) {
        value = value.replace(/[^\d.]/g, '');
        // Ensure only one decimal point
        const parts = value.split('.');
        if (parts.length > 2) {
          value = parts[0] + '.' + parts.slice(1).join('');
        }
      } else if (field === "discountEGP") {
        value = value.replace(/[^\d-]/g, '');
      } else if (field === "depositEGP") {
        value = value.replace(/[^\d]/g, '');
      }
    }
    
    setForm(prev => ({ ...prev, [field]: value }));
    setFormChanged(prev => !prev);
    
    // Clear field-specific error
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
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
    const totalSRValue = parseFloat(form.totalSR) || 0;
    if (!form.totalSR || totalSRValue <= 0) {
      newErrors.totalSR = "Total SR is required and must be greater than 0";
    }
    const piecesValue = parseFloat(form.pieces) || 0;
    if (!form.pieces || piecesValue <= 0) {
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
    const prefix = type === "Wholesale" 
      ? (systemSettings.customerCodePrefixWholesale || "WS")
      : (systemSettings.customerCodePrefixRetail || "RE");
    
    const q = query(collection(db, "customers"), where("clientType", "==", type));
    const snap = await getDocs(q);
    
    const existingCodes = snap.docs
      .map((doc) => doc.data().customerCode)
      .filter((code) => code && code.startsWith(prefix))
      .map((code) => {
        const match = code.match(new RegExp(`^${prefix}-(\\d+)$`));
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0);
    
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
        customerCode
      };
      setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({ ...prev, customerId: docRef.id }));
      
      const selectedOption = {
        value: docRef.id,
        label: `${form.customerName} (${customerCode})`
      };
      setSelectedCustomer(selectedOption);
      
      setNewCustomerMode(false);
      setMessage(`✅ Customer added successfully! Code: ${customerCode}`);
      setErrors({});
      setFormChanged(prev => !prev);
    } catch (err) {
      setMessage("❌ Failed to add customer.");
    }
  };

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

      // Convert all inputs to whole numbers for storage
      const formDataForStorage = {
        ...form,
        totalSR: toWholeNumber(form.totalSR),
        depositEGP: toWholeNumber(form.depositEGP),
        discountEGP: toWholeNumber(form.discountEGP),
        pieces: toWholeNumber(form.pieces),
        extraSR: toWholeNumber(form.extraSR),
        customerCode,
      };

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
          ...formDataForStorage,
          status: "Requested",
          totalEGP: totals.totalOrderEGP,
          outstanding: totals.outstandingEGP,
          extraEGP: totals.extraEGP,
          updatedAt: serverTimestamp(),
        });

        orderDocRef = orderRef;
      } else {
        orderId = await generateOrderId(form.orderType);
        firestoreOrderId = null;

        const newOrder = {
          ...formDataForStorage,
          orderId,
          createdAt: serverTimestamp(),
          status: "Requested",
          totalEGP: totals.totalOrderEGP,
          outstanding: totals.outstandingEGP,
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

      // Reset form
      setForm({
        customerId: "",
        customerName: "",
        phone: "",
        clientType: "",
        totalSR: "",
        depositEGP: "",
        orderType: "B",
        discountEGP: "",
        pieces: "",
        extraSR: "",
        customerCode: "",
      });
      setSelectedCustomer(null);
      setTotals({ 
        totalOrderEGP: 0, 
        outstandingEGP: 0,
        extraEGP: 0,
        baseEGP: 0,
        conversionRate: 0
      });
      setErrors({});
      setFormChanged(prev => !prev);
    } catch (err) {
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
                onChange={(e) => handleFormChange("customerName", e.target.value)}
                className={errors.customerName ? "border-red-500" : ""}
              />
              {errors.customerName && <p className="text-red-500 text-sm mt-1">{errors.customerName}</p>}
            </div>
            <div>
              <Input
                label="Phone Number"
                value={form.phone}
                onChange={(e) => handleFormChange("phone", e.target.value)}
                className={errors.phone ? "border-red-500" : ""}
              />
              {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">Customer Type</label>
              <select
                value={form.clientType}
                onChange={(e) => handleFormChange("clientType", e.target.value)}
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
          <label className="block text-gray-700 mb-2">Order Type</label>
          <select
            value={form.orderType}
            onChange={(e) => handleFormChange("orderType", e.target.value)}
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
                Pieces <span className="text-red-500">*</span>
              </>
            }
            type="text"
            inputMode="decimal"
            value={form.pieces}
            onChange={(e) => handleFormChange("pieces", e.target.value)}
            className={errors.pieces ? "border-red-500" : ""}
            placeholder="Whole numbers only"
          />
          {errors.pieces && <p className="text-red-500 text-sm mt-1">{errors.pieces}</p>}
        </div>
        <div>
          <Input
            label={
              <>
                Total (SR) <span className="text-red-500">*</span>
              </>
            }
            type="text"
            inputMode="decimal"
            value={form.totalSR}
            onChange={(e) => handleFormChange("totalSR", e.target.value)}
            className={errors.totalSR ? "border-red-500" : ""}
            placeholder="Enter SR amount"
          />
          {errors.totalSR && <p className="text-red-500 text-sm mt-1">{errors.totalSR}</p>}
        </div>
        <Input 
          label="Extra (SR)" 
          type="text"
          inputMode="decimal"
          value={form.extraSR} 
          onChange={(e) => handleFormChange("extraSR", e.target.value)} 
          placeholder="Extra SR amount"
        />
      </div>

      {/* Deposit and Discount */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
        <Input 
          label="Deposit (EGP)" 
          type="text"
          inputMode="decimal"
          value={form.depositEGP} 
          onChange={(e) => handleFormChange("depositEGP", e.target.value)} 
          placeholder="Whole numbers only"
        />
        
        <div>
          <Input 
            label="Discount (EGP)" 
            type="text"
            inputMode="decimal"
            value={form.discountEGP} 
            onChange={(e) => handleFormChange("discountEGP", e.target.value)} 
            placeholder="Use minus for discount"
          />
        </div>
      </div>

      {/* Totals - UPDATED WITH ROUNDING INFO */}
      <div className="mb-4 text-gray-700 bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <p className="font-medium">Conversion Rate: <span className="text-blue-600">{totals.conversionRate.toFixed(2)}</span></p>
          </div>
          <div>
            <p className="font-medium">Extra (EGP): <span className="text-green-600">{totals.extraEGP.toLocaleString()}</span></p>
            <p className="text-sm text-gray-500">(Extra SR × 2)</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="font-semibold text-lg">Total Order (EGP): <span className="text-blue-700">{totals.totalOrderEGP.toLocaleString()}</span></p>
          <p className="text-sm text-gray-500 mb-2">
            {(form.totalSR * totals.conversionRate) + totals.extraEGP - totals.discountEGP}
            {form.clientType === "Retail" && " (rounded to nearest multiple of 5)"}
          </p>
          <p className="font-medium">Outstanding Amount (EGP): <span className={totals.outstandingEGP > 0 ? "text-red-600" : "text-green-600"}>{totals.outstandingEGP.toLocaleString()}</span></p>
          <p className="text-sm text-gray-500">
            (Total Order EGP - Deposit EGP)
            {form.clientType === "Retail" && " (rounded to nearest multiple of 5)"}
          </p>
        </div>
        {form.clientType === "Retail" && (
          <div className="mt-3 pt-3 border-t border-gray-200 bg-yellow-50 p-3 rounded">
            <p className="text-sm text-yellow-700 font-medium">
              ⓘ Retail customers: All EGP amounts are rounded to the nearest multiple of 5
            </p>
            <p className="text-sm text-yellow-600 mt-1">
              Example: 83 → 85, 197 → 195, 198 → 200
            </p>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="text-center">
        <Button onClick={handleSubmit}>Add Order</Button>
        {message && <p className={`mt-3 ${message.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{message}</p>}
      </div>
    </div>
  );
}