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
    accountName: "",
    newAccount: "",
    extraSR: "",
    couponSR: "",
    discountSR: "",
    pieces: "",
    paidToWebsite: "",
  });

  const [trackingNumbers, setTrackingNumbers] = useState([""]);
  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const [totals, setTotals] = useState({
    extraEGP: 0,
    totalOrderEGP: 0,
    outstandingEGP: 0,
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Load customers and accounts
  useEffect(() => {
    const fetchData = async () => {
      const accSnap = await getDocs(collection(db, "accounts"));
      setAccounts(accSnap.docs.map((doc) => ({ id: doc.id, name: doc.data().name })));

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
          accountName: data.accountName || "",
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
    if (!form.accountName && !form.newAccount.trim()) {
      newErrors.account = "Account is required";
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

  // Generate next order ID using system settings
  const generateOrderId = async (orderType) => {
    const counterRef = doc(db, "counters", orderType);
    const counterSnap = await getDoc(counterRef);

    let nextNumber = 1;

    if (counterSnap.exists()) {
      nextNumber = counterSnap.data().lastNumber + 1;
      await updateDoc(counterRef, { lastNumber: increment(1) });
    } else {
      await setDoc(counterRef, { lastNumber: 1 });
    }

    // Use prefix from system settings
    const prefix = orderType === "B" 
      ? systemSettings.orderCodePrefixBarry || "B"
      : systemSettings.orderCodePrefixGawy || "G";
    
    return `${prefix}${nextNumber}`;
  };

  // Generate customer code using system settings
  const generateCustomerCode = async (type) => {
    const prefix = type === "Wholesale" 
      ? systemSettings.customerCodePrefixWholesale || "WS"
      : systemSettings.customerCodePrefixRetail || "RE";
    
    const q = query(collection(db, "customers"), where("clientType", "==", type));
    const snap = await getDocs(q);
    const existingCodes = snap.docs
      .map((doc) => doc.data().customerCode)
      .filter((code) => code?.startsWith(prefix))
      .map((code) => parseInt(code.split("-")[1], 10))
      .filter((n) => !isNaN(n));
    const nextNumber = existingCodes.length ? Math.max(...existingCodes) + 1 : 1;
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
      const newCustomer = { id: docRef.id, ...newCust };
      setCustomers([...customers, newCustomer]);
      setForm((prev) => ({ ...prev, customerId: docRef.id }));
      setNewCustomerMode(false);
      setMessage(`✅ Customer added successfully! Code: ${customerCode}`);
      setErrors({});
    } catch (err) {
      setMessage("❌ Failed to add customer.");
    }
  };

  // Calculate totals using system settings
  useEffect(() => {
    if (settingsLoading || !systemSettings) return;

    const totalSR = Number(form.totalSR || 0);
    const extraSR = Number(form.extraSR || 0);
    const couponSR = Number(form.couponSR || 0);
    const depositEGP = Number(form.depositEGP || 0);
    const discountSR = Number(form.discountSR || 0);
    const paidToWebsite = Number(form.paidToWebsite || 0);

    const extraEGP = extraSR * 2;

    // Calculate net SR after coupon deduction
    const netSR = totalSR - couponSR - discountSR;

    let orderEGP = 0;
    let paidToWebsiteEGP = 0;
    const threshold = systemSettings.wholesaleThreshold || 1500;

    if (form.clientType === "Wholesale") {
      if (form.orderType === "B") {
        orderEGP = netSR > threshold 
          ? (netSR * (systemSettings.barryWholesaleAbove1500 || 12.25))
          : netSR * (systemSettings.barryWholesaleBelow1500 || 12.5);
      } else if (form.orderType === "G") {
        orderEGP = netSR > threshold
          ? netSR * (systemSettings.gawyWholesaleAbove1500 || 13.5)
          : netSR * (systemSettings.gawyWholesaleBelow1500 || 14);
      }
    } else if (form.clientType === "Retail") {
      orderEGP = form.orderType === "B" 
        ? netSR * (systemSettings.barryRetail || 14.5)
        : netSR * (systemSettings.gawyRetail || 15.5);
    }

     if (form.clientType === "Wholesale") {
      if (form.orderType === "B") {
        paidToWebsiteEGP = paidToWebsite > threshold 
          ? (paidToWebsite * (systemSettings.barryWholesaleAbove1500 || 12.25))
          : paidToWebsite * (systemSettings.barryWholesaleBelow1500 || 12.5);
      } else if (form.orderType === "G") {
        paidToWebsiteEGP = paidToWebsite > threshold
          ? paidToWebsite * (systemSettings.gawyWholesaleAbove1500 || 13.5)
          : paidToWebsite * (systemSettings.gawyWholesaleBelow1500 || 14);
      }
    } else if (form.clientType === "Retail") {
      paidToWebsiteEGP = form.orderType === "B" 
        ? paidToWebsite * (systemSettings.barryRetail || 14.5)
        : paidToWebsite * (systemSettings.gawyRetail || 15.5);
    }

    const totalOrderEGP = orderEGP + extraEGP;
    const outstandingEGP = totalOrderEGP - (depositEGP)-paidToWebsiteEGP;
    setTotals({ extraEGP, totalOrderEGP, outstandingEGP });
  }, [
    form.totalSR, form.extraSR, form.couponSR, form.depositEGP, 
    form.discountSR, form.paidToWebsite, form.clientType, form.orderType,
    systemSettings, settingsLoading
  ]);

  // Handle order submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateMandatoryFields()) {
      setMessage("⚠️ Please fill all required fields");
      return;
    }

    const finalAccountName = form.newAccount.trim() || form.accountName;
    if (!finalAccountName) {
      setErrors(prev => ({ ...prev, account: "Account is required" }));
      setMessage("⚠️ Please select or enter an account name");
      return;
    }

    try {
      if (form.newAccount.trim()) {
        const accDocRef = await addDoc(collection(db, "accounts"), { name: form.newAccount.trim() });
        setAccounts([...accounts, { id: accDocRef.id, name: form.newAccount.trim() }]);
      }

      const prefilledData = sessionStorage.getItem('prefilledOrderData');
      const existingOrderData = prefilledData ? JSON.parse(prefilledData) : null;
      const existingOrderId = existingOrderData?.existingOrderId;

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
          accountName: finalAccountName,
          status: "Requested",
          trackingNumbers: trackingNumbers.filter((t) => t),
          totalEGP: totals.totalOrderEGP,
          outstanding: totals.outstandingEGP,
          extraEGP: totals.extraEGP,
          paidToWebsite: Number(form.paidToWebsite || 0),
          couponSR: Number(form.couponSR || 0),
          updatedAt: serverTimestamp(),
        });

        orderDocRef = orderRef;
      } else {
        orderId = await generateOrderId(form.orderType);
        firestoreOrderId = null;

        const newOrder = {
          ...form,
          accountName: finalAccountName,
          orderId,
          createdAt: serverTimestamp(),
          status: "Requested",
          trackingNumbers: trackingNumbers.filter((t) => t),
          totalEGP: totals.totalOrderEGP,
          outstanding: totals.outstandingEGP,
          extraEGP: totals.extraEGP,
          paidToWebsite: Number(form.paidToWebsite || 0),
          couponSR: Number(form.couponSR || 0),
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
        accountName: "",
        newAccount: "",
        extraSR: "",
        couponSR: "",
        discountSR: "",
        pieces: "",
        paidToWebsite: "",
      });
      setTrackingNumbers([""]);
      setSelectedCustomer(null);
      setTotals({ extraEGP: 0, totalOrderEGP: 0, outstandingEGP: 0 });
      setErrors({});
    } catch (err) {
      setMessage("❌ Error " + (existingOrderId ? 'updating' : 'adding') + " order.");
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
              options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.customerCode})` }))}
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

      {/* Account */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-gray-700 font-medium mb-2">
            Select Account <span className="text-red-500">*</span>
          </label>
          <select
            value={form.accountName}
            onChange={(e) => {
              setForm({ ...form, accountName: e.target.value, newAccount: "" });
              if (errors.account) {
                setErrors(prev => ({ ...prev, account: "" }));
              }
            }}
            className={`border border-gray-300 rounded-lg p-2 w-full focus:ring focus:ring-blue-200 ${errors.account ? "border-red-500" : ""}`}
          >
            <option value="">Select Account</option>
            {accounts.map((acc) => <option key={acc.id} value={acc.name}>{acc.name}</option>)}
          </select>
          {errors.account && <p className="text-red-500 text-sm mt-1">{errors.account}</p>}
        </div>
        <div>
          <Input
            label="Or Add New Account"
            value={form.newAccount}
            onChange={(e) => {
              setForm({ ...form, newAccount: e.target.value, accountName: "" });
              if (errors.account) {
                setErrors(prev => ({ ...prev, account: "" }));
              }
            }}
            placeholder="Enter new account name"
            className={errors.account ? "border-red-500" : ""}
          />
          {errors.account && <p className="text-red-500 text-sm mt-1">{errors.account}</p>}
        </div>
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

      {/* Extra / Coupon / Discount / Paid To Website */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
        <Input label="Extra (SR)" type="number" value={form.extraSR} onChange={(e) => setForm({ ...form, extraSR: e.target.value })} />
        <Input
          label="Coupon (SR)"
          type="number"
          value={form.couponSR}
          onChange={(e) => setForm({ ...form, couponSR: e.target.value })}
        />
        <Input label="Discount (SR)" type="number" value={form.discountSR} onChange={(e) => setForm({ ...form, discountSR: e.target.value })} />
        <Input
          label="Paid To Website (SR)"
          type="number"
          value={form.paidToWebsite}
          onChange={(e) => setForm({ ...form, paidToWebsite: e.target.value })}
        />
      </div>

      {/* Totals */}
      <div className="mb-4 text-gray-700">
        <p>Extra (EGP): {totals.extraEGP.toFixed(2)}</p>
        <p>Total Order (EGP): {totals.totalOrderEGP.toFixed(2)}</p>
        <p>Outstanding Amount (EGP): {totals.outstandingEGP.toFixed(2)}</p>
      </div>

      {/* Tracking Numbers */}
      <div className="mb-6">
        <label className="block text-gray-700 font-medium mb-2">Tracking Numbers</label>
        {trackingNumbers.map((tracking, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              type="text"
              value={tracking}
              onChange={(e) => {
                const updated = [...trackingNumbers];
                updated[index] = e.target.value;
                setTrackingNumbers(updated);
              }}
              placeholder={`Tracking Number ${index + 1}`}
              className="border border-gray-300 rounded-lg p-2 w-full focus:ring focus:ring-blue-200"
            />
            {index === trackingNumbers.length - 1 && (
              <button type="button" onClick={() => setTrackingNumbers([...trackingNumbers, ""])} className="bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600">+</button>
            )}
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="text-center">
        <Button onClick={handleSubmit}>Add Order</Button>
        {message && <p className={`mt-3 ${message.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{message}</p>}
      </div>
    </div>
  );
}