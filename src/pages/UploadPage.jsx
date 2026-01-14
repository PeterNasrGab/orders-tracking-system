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
  setDoc,
  orderBy
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

  // Search results for client
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

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
      setClientCode(createdCustomer.customerCode);
      setNewCustomerMode(false);
      setShowSearchResults(false);
      setNewCustomer({ name: "", phone: "", type: "" });
      setCustomerErrors({});
      setSearchResults([]);
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
      setMessage("⚠️ Please enter a client code or name");
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setSearching(true);
    try {
      const searchTerm = clientCode.trim().toLowerCase();
      
      // Query all customers for search
      const q = query(
        collection(db, "customers"),
        orderBy("name")
      );
      const snap = await getDocs(q);
      
      const results = [];
      
      snap.docs.forEach(doc => {
        const data = doc.data();
        const docId = doc.id;
        
        // Check multiple fields for matches
        const name = data.name?.toLowerCase() || "";
        const customerCode = data.customerCode?.toLowerCase() || "";
        const phone = data.phone || "";
        
        // Search in multiple fields (partial matches allowed)
        const matchesName = name.includes(searchTerm);
        const matchesCode = customerCode.includes(searchTerm);
        const matchesPhone = phone.includes(searchTerm);
        const matchesId = docId.toLowerCase() === searchTerm; // Exact match for document ID
        
        if (matchesName || matchesCode || matchesPhone || matchesId) {
          results.push({
            id: docId,
            ...data,
            matchType: matchesCode ? "Code" : 
                      matchesName ? "Name" : 
                      matchesPhone ? "Phone" : "ID"
          });
        }
      });

      setSearchResults(results);
      setShowSearchResults(true);
      
      if (results.length === 0) {
        setMessage("❌ No clients found. You can add a new customer below.");
        setClient(null);
        setNewCustomerMode(true);
        setOrderOptions([]);
        setSelectedOrder("new");
        setOrderType("");
      } else {
        // ALWAYS show results for selection, even if only one
        setMessage(`🔍 Found ${results.length} client(s). Please select one from the list below:`);
        setClient(null); // Clear any previously selected client
        setNewCustomerMode(false);
      }
    } catch (error) {
      console.error("Search error:", error);
      setMessage("❌ Error searching for client.");
      setSearchResults([]);
      setShowSearchResults(false);
      setClient(null);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectClient = (selectedClient) => {
    setClient(selectedClient);
    setClientCode(selectedClient.customerCode);
    setSearchResults([]);
    setShowSearchResults(false);
    setMessage(`✅ Customer selected: ${selectedClient.name} (${selectedClient.customerCode})`);
    setNewCustomerMode(false);
  };

  // Clear search and selection
  const handleClearSearch = () => {
    setClient(null);
    setClientCode("");
    setSearchResults([]);
    setShowSearchResults(false);
    setOrderOptions([]);
    setSelectedOrder("new");
    setOrderType("");
    setNewCustomerMode(false);
    setMessage("Search cleared");
  };

  // Upload payment files to payments bucket
  const uploadPaymentFile = async (file) => {
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${client.id}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('payments')
        .upload(filePath, file);

      if (error) {
        throw error;
      }

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
        .from('items')
        .upload(filePath, file);

      if (error) {
        throw error;
      }

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

    if (!client) {
      setMessage("⚠️ Please select a customer from the search results.");
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

    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setMessage("⚠️ Payment amount is required and must be greater than 0.");
      return;
    }

    setUploading(true);
    try {
      const paymentUrls = await Promise.all(
        paymentFiles.map((file) => uploadPaymentFile(file))
      );
      
      const orderUrls = await Promise.all(
        orderFiles.map((file) => uploadOrderFile(file))
      );

      let displayOrderId = "NEW_ORDER";
      let actualOrderId = selectedOrder;
      let newCreatedOrderId = null;

      if (selectedOrder === "new") {
        const generatedOrderId = await generateOrderId(orderType);

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
          totalSR: 0,
          pieces: 0,
          accountName: "Upload System",
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
        const selectedOrderData = orderOptions.find(o => o.id === selectedOrder);
        displayOrderId = selectedOrderData?.orderId || "UNKNOWN_ORDER";
        actualOrderId = selectedOrderData?.id || selectedOrder;
      }

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
        {/* Client Search */}
        <div>
          <label className="font-semibold">Search Client</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              className="border rounded-md p-2 w-full"
              value={clientCode}
              onChange={(e) => {
                setClientCode(e.target.value);
                // Clear search results when user types
                if (showSearchResults) {
                  setShowSearchResults(false);
                  setSearchResults([]);
                }
              }}
              placeholder="Search by name, code, or phone (e.g. 'john', 're-001', '01012345678')"
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleClientLookup())}
            />
            <button
              type="button"
              className="bg-blue-500 text-white px-3 rounded hover:bg-blue-600 disabled:bg-blue-300"
              onClick={handleClientLookup}
              disabled={searching}
            >
              {searching ? "..." : "Search"}
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Search by: Name (partial), Customer Code (RE-001, WS-001), or Phone
          </p>
        </div>

        {/* Search Results - ALWAYS shown when there are results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="border border-gray-300 rounded-md overflow-hidden">
            <div className="bg-gray-100 p-3 border-b">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Select a Customer ({searchResults.length} found)</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowSearchResults(false);
                    setSearchResults([]);
                    setMessage("");
                  }}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  ✕ Close
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Click on a customer to select them for upload
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {searchResults.map((result) => (
                <div 
                  key={result.id}
                  className="p-3 border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => handleSelectClient(result)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold">{result.name}</p>
                        <span className={`text-xs px-2 py-1 rounded ${
                          result.clientType === "Wholesale" 
                            ? "bg-purple-100 text-purple-800" 
                            : "bg-green-100 text-green-800"
                        }`}>
                          {result.clientType}
                        </span>
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                          {result.matchType}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div>
                          <span className="text-gray-600">Code:</span>
                          <span className="font-mono ml-1">{result.customerCode}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Phone:</span>
                          <span className="ml-1">{result.phone}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-blue-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected Customer Info Display */}
        {client && !showSearchResults && (
          <div className="bg-green-50 border border-green-200 p-4 rounded-md">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-green-800 mb-2">Selected Customer</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <span className="text-gray-600">Name:</span>
                    <span className="ml-2 font-semibold">{client.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Code:</span>
                    <span className="ml-2 font-mono font-semibold">{client.customerCode}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Type:</span>
                    <span className={`ml-2 px-2 py-1 text-xs rounded ${
                      client.clientType === "Wholesale" 
                        ? "bg-purple-100 text-purple-800" 
                        : "bg-green-100 text-green-800"
                    }`}>
                      {client.clientType}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Phone:</span>
                    <span className="ml-2 font-semibold">{client.phone}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={handleClearSearch}
                title="Clear selection"
              >
                ✕ Clear
              </button>
            </div>
          </div>
        )}

        {/* New Customer Form */}
        {newCustomerMode && !client && !showSearchResults && (
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

              <div className="flex gap-2">
                <button
                  type="button"
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                  onClick={handleAddNewCustomer}
                >
                  Save Customer
                </button>
                <button
                  type="button"
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                  onClick={() => {
                    setNewCustomerMode(false);
                    setClientCode("");
                    setMessage("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rest of the form - Payment, Order Selection, etc. */}
        {client && !showSearchResults && (
          <>
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
                min="1"
                step="0.01"
              />
            </div>

            <FilePicker
              label="Upload Payment Photos"
              onFilesChange={setPaymentFiles}
            />

            {/* Order Selection */}
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

            <FilePicker label="Upload Order Photos" onFilesChange={setOrderFiles} />
          </>
        )}

        {/* Submit Button - Only show if customer is selected and search results are not showing */}
        {client && !showSearchResults && (
          <button
            type="submit"
            disabled={uploading}
            className={`w-full py-2 rounded-md text-white ${uploading ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"}`}
          >
            {uploading ? "Uploading..." : "Submit Uploads"}
          </button>
        )}

        {/* Message Display */}
        {message && (
          <p className={`text-center text-sm mt-3 ${
            message.startsWith("✅") ? "text-green-600" :
            message.startsWith("⚠️") ? "text-yellow-600" :
            message.startsWith("🔍") ? "text-blue-600" : 
            message.startsWith("❌") ? "text-red-600" : "text-gray-600"
          }`}>
            {message}
          </p>
        )}
      </form>
    </div>
  );
}