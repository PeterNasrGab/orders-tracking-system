import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  increment,
  setDoc
} from "firebase/firestore";
import { supabase } from "../supabase";
import FilePicker from "../components/FilePicker";

export default function UploadPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("id");
  const token = searchParams.get("token");

  const [clientCode, setClientCode] = useState("");
  const [client, setClient] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [orderOptions, setOrderOptions] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(orderId || "");
  const [orderType, setOrderType] = useState("");
  const [paymentFiles, setPaymentFiles] = useState([]);
  const [orderFiles, setOrderFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  // New customer fields
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    type: "",
  });
  const [customerErrors, setCustomerErrors] = useState({});

  // Generate next order ID (same as in AddOrder page)
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

    return `${orderType}-${nextNumber}`;
  };

  useEffect(() => {
    const loadOrders = async () => {
      if (!client?.id) return;

      try {
        const q = query(collection(db, "orders"), where("customerId", "==", client.id));
        const snap = await getDocs(q);
        const orders = snap.docs.map((d) => ({
          id: d.id,
          orderId: d.data().orderId,
          orderType: d.data().orderType
        }));
        setOrderOptions(orders);

        // If customer has orders, auto-select first one and its type
        if (orders.length > 0) {
          setSelectedOrder(orders[0].id);
          setOrderType(orders[0].orderType);
        } else {
          // If no orders, set to new order
          setSelectedOrder("new");
          setOrderType("");
        }
      } catch (error) {
        setOrderOptions([]);
        setSelectedOrder("new");
        setOrderType("");
      }
    };

    loadOrders();
  }, [client]);

  const validateNewCustomer = () => {
    const errors = {};
    if (!newCustomer.name.trim()) errors.name = "Name is required";
    if (!newCustomer.phone.trim()) errors.phone = "Phone is required";
    else if (!/^[0-9]{10,15}$/.test(newCustomer.phone)) errors.phone = "Invalid phone number";
    if (!newCustomer.type.trim()) errors.type = "Type is required";
    setCustomerErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddNewCustomer = async () => {
    if (!validateNewCustomer()) {
      setMessage("⚠️ Please fix customer details before saving.");
      return;
    }

    try {
      // Generate customer code
      const prefix = newCustomer.type === "Wholesale" ? "WS" : "RE";
      const q = query(collection(db, "customers"), where("clientType", "==", newCustomer.type));
      const snap = await getDocs(q);
      const existingCodes = snap.docs
        .map((doc) => doc.data().customerCode)
        .filter((code) => code?.startsWith(prefix))
        .map((code) => parseInt(code.split("-")[1], 10))
        .filter((n) => !isNaN(n));
      const nextNumber = existingCodes.length ? Math.max(...existingCodes) + 1 : 1;
      const customerCode = `${prefix}-${nextNumber}`;

      const newCust = {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        clientType: newCustomer.type,
        customerCode,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "customers"), newCust);
      const createdCustomer = {
        id: docRef.id,
        ...newCust
      };

      setClient(createdCustomer);
      setClientCode(docRef.id);
      setNewCustomerMode(false);
      setNewCustomer({ name: "", phone: "", type: "" });
      setCustomerErrors({});
      setMessage(`✅ Customer added successfully! Code: ${customerCode}`);

      // Set to new order mode since this is a new customer
      setSelectedOrder("new");
      setOrderType("");
    } catch (err) {
      setMessage("❌ Failed to add customer.");
    }
  };

  const handleClientLookup = async () => {
    if (!clientCode.trim()) {
      setMessage("⚠️ Please enter a client code");
      return;
    }

    try {
      // Convert search term to uppercase for case-insensitive matching
      const searchTerm = clientCode.trim().toUpperCase();
      
      // First try to find by customerCode (case-insensitive)
      let q = query(collection(db, "customers"));
      let snap = await getDocs(q);
      
      let customerDoc = null;
      let customerData = null;

      // Manual filtering for case-insensitive search
      snap.docs.forEach(doc => {
        const data = doc.data();
        // Check if customerCode matches case-insensitively
        if (data.customerCode && data.customerCode.toUpperCase() === searchTerm) {
          customerDoc = doc;
          customerData = data;
        }
      });

      // If not found by customerCode, try by document ID (exact match)
      if (!customerDoc) {
        const docRef = doc(db, "customers", clientCode);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          customerDoc = docSnap;
          customerData = docSnap.data();
        }
      }

      if (customerDoc && customerData) {
        setClient({
          id: customerDoc.id,
          ...customerData
        });
        setMessage(`✅ Customer found: ${customerData.name}`);
        setNewCustomerMode(false);
      } else {
        setClient(null);
        setMessage("❌ Client not found. You can add a new customer below.");
        setNewCustomerMode(true);
        setOrderOptions([]);
        setSelectedOrder("new");
        setOrderType("");
      }
    } catch (error) {
      setMessage("❌ Error searching for client.");
      setClient(null);
    }
  };

  // Upload payment files to payments bucket
  const uploadPaymentFile = async (file) => {
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${client.id}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('payments') // Separate bucket for payments
        .upload(filePath, file);

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('payments')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      throw error;
    }
  };

  // Upload order files to items bucket
  const uploadOrderFile = async (file) => {
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${client.id}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('items') // Separate bucket for order items
        .upload(filePath, file);

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('items')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!client) {
      setMessage("⚠️ Please search for or add a customer first.");
      return;
    }

    if (selectedOrder === "new" && !orderType) {
      setMessage("⚠️ Please select order type for new order.");
      return;
    }

    if (!selectedOrder) {
      setMessage("⚠️ Please select an order.");
      return;
    }

    // Validate payment amount is mandatory
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setMessage("⚠️ Payment amount is required and must be greater than 0.");
      return;
    }

    setUploading(true);
    try {
      // Upload files to separate buckets
      const paymentUrls = await Promise.all(
        paymentFiles.map((file) => uploadPaymentFile(file))
      );
      
      const orderUrls = await Promise.all(
        orderFiles.map((file) => uploadOrderFile(file))
      );

      let displayOrderId = "NEW_ORDER";
      let actualOrderId = selectedOrder;
      let newCreatedOrderId = null;

      // If it's a new order, create it in the orders collection
      if (selectedOrder === "new") {
        // Generate order ID
        const generatedOrderId = await generateOrderId(orderType);

        // Create the new order in orders collection
        const newOrderData = {
          customerId: client.id,
          customerName: client.name,
          customerCode: client.customerCode,
          phone: client.phone,
          clientType: client.clientType,
          orderId: generatedOrderId,
          orderType: orderType,
          status: "Requested",
          depositEGP: Number(paymentAmount) || 0,
          totalSR: 0, // These can be updated later
          pieces: 0,
          accountName: "Upload System", // Default account
          trackingNumbers: [],
          totalEGP: 0,
          outstanding: 0,
          extraEGP: 0,
          createdAt: serverTimestamp(),
        };

        const orderDocRef = await addDoc(collection(db, "orders"), newOrderData);
        newCreatedOrderId = orderDocRef.id;
        displayOrderId = generatedOrderId;
        actualOrderId = orderDocRef.id;
      } else {
        // For existing orders, get the order ID
        const selectedOrderData = orderOptions.find(o => o.id === selectedOrder);
        displayOrderId = selectedOrderData?.orderId || "UNKNOWN_ORDER";
        actualOrderId = selectedOrderData?.id || selectedOrder;
      }

      // ⭐ UPDATED: Create the upload record in Supabase with snake_case column names
      const uploadData = {
        client_id: client.id,
        client_code: client.customerCode,
        client_name: client.name,
        client_type: client.clientType,
        client_phone: client.phone,
        payment_amount: paymentAmount || 0,
        payment_images: paymentUrls,
        order_images: orderUrls,
        order_id: displayOrderId,
        firestore_order_id: actualOrderId,
        order_type: selectedOrder === "new" ? orderType : orderOptions.find(o => o.id === selectedOrder)?.orderType,
        is_new_order: selectedOrder === "new",
       // new_order_created: selectedOrder === "new",
        new_order_id: newCreatedOrderId,
        status: "Under Approval",
        token: token,
        created_at: new Date().toISOString(),
      };

      const { data: uploadRecord, error: uploadError } = await supabase
        .from('uploads')
        .insert([uploadData])
        .select();

      if (uploadError) {
        throw uploadError;
      }
      setMessage(`✅ Upload successful! ${selectedOrder === "new" ? `New order created: ${displayOrderId}` : ''}`);
      setUploading(false);
      setPaymentFiles([]);
      setOrderFiles([]);
      setPaymentAmount("");

      // Refresh order options if we created a new order
      if (selectedOrder === "new") {
        const q = query(collection(db, "orders"), where("customerId", "==", client.id));
        const snap = await getDocs(q);
        const orders = snap.docs.map((d) => ({
          id: d.id,
          orderId: d.data().orderId,
          orderType: d.data().orderType
        }));
        setOrderOptions(orders);
      }
    } catch (err) {
      setMessage(`❌ Upload failed: ${err.message}`);
      setUploading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto bg-white p-6 rounded-xl shadow-md mt-10">
      <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
        Upload Files
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Client Code Search */}
        <div>
          <label className="font-semibold">Client Code</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              className="border rounded-md p-2 w-full"
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value)}
              placeholder="Enter client code (e.g. RE-001, re-001, ws-001) or customer ID"
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleClientLookup())}
            />
            <button
              type="button"
              className="bg-blue-500 text-white px-3 rounded hover:bg-blue-600"
              onClick={handleClientLookup}
            >
              Search
            </button>
          </div>
        </div>

        {/* Customer Info Display */}
        {client && (
          <div className="bg-green-50 border border-green-200 p-3 rounded-md">
            <p><strong>Name:</strong> {client.name}</p>
            <p><strong>Code:</strong> {client.customerCode}</p>
            <p><strong>Type:</strong> {client.clientType}</p>
            <p><strong>Phone:</strong> {client.phone}</p>
          </div>
        )}

        {/* New Customer Form */}
        {newCustomerMode && !client && (
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md">
            <h3 className="font-semibold mb-3">Add New Customer</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  className={`border rounded-md p-2 w-full ${customerErrors.name ? "border-red-500" : ""}`}
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  placeholder="Enter customer name"
                />
                {customerErrors.name && <p className="text-red-500 text-sm mt-1">{customerErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Phone *</label>
                <input
                  type="text"
                  className={`border rounded-md p-2 w-full ${customerErrors.phone ? "border-red-500" : ""}`}
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  placeholder="Enter phone number"
                />
                {customerErrors.phone && <p className="text-red-500 text-sm mt-1">{customerErrors.phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Type *</label>
                <select
                  className={`border rounded-md p-2 w-full ${customerErrors.type ? "border-red-500" : ""}`}
                  value={newCustomer.type}
                  onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })}
                >
                  <option value="">Select Type</option>
                  <option value="Retail">Retail</option>
                  <option value="Wholesale">Wholesale</option>
                </select>
                {customerErrors.type && <p className="text-red-500 text-sm mt-1">{customerErrors.type}</p>}
              </div>

              <button
                type="button"
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                onClick={handleAddNewCustomer}
              >
                Save Customer
              </button>
            </div>
          </div>
        )}

        {/* Payment upload */}
        <div>
          <label className="font-semibold">
            Payment Amount (EGP) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            className="border rounded-md p-2 w-full"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder="Enter amount"
            required
          />
        </div>

        <FilePicker
          label="Upload Payment Photos"
          onFilesChange={setPaymentFiles}
        />

        {/* Order Selection */}
        {client && (
          <div className="space-y-4">
            <div>
              <label className="font-semibold">Order</label>
              <select
                className="border rounded-md p-2 w-full"
                value={selectedOrder}
                onChange={(e) => {
                  setSelectedOrder(e.target.value);
                  if (e.target.value !== "new") {
                    const selected = orderOptions.find(o => o.id === e.target.value);
                    setOrderType(selected?.orderType || "");
                  } else {
                    setOrderType("");
                  }
                }}
              >
                <option value="">-- Select Order --</option>
                {orderOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderId} ({o.orderType === "B" ? "Barry" : "Gawy"})
                  </option>
                ))}
                <option value="new">New Order</option>
              </select>
            </div>

            {/* Order Type for New Orders */}
            {selectedOrder === "new" && (
              <div>
                <label className="font-semibold">Order Type *</label>
                <select
                  className="border rounded-md p-2 w-full"
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  required
                >
                  <option value="">Select Order Type</option>
                  <option value="B">Barry</option>
                  <option value="G">Gawy</option>
                </select>
              </div>
            )}

            {/* Order Type Display for Existing Orders */}
            {selectedOrder && selectedOrder !== "new" && orderType && (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-md">
                <p><strong>Order Type:</strong> {orderType === "B" ? "Barry" : "Gawy"}</p>
              </div>
            )}
          </div>
        )}

        <FilePicker label="Upload Order Photos" onFilesChange={setOrderFiles} />

        <button
          type="submit"
          disabled={uploading || !client}
          className={`w-full py-2 rounded-md text-white ${uploading || !client ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"
            }`}
        >
          {uploading ? "Uploading..." : "Submit Uploads"}
        </button>

        {message && (
          <p className={`text-center text-sm mt-3 ${message.startsWith("✅") ? "text-green-600" :
              message.startsWith("⚠️") ? "text-yellow-600" : "text-red-600"
            }`}>
            {message}
          </p>
        )}
      </form>
    </div>
  );
}