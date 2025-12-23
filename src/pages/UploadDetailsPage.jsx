import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { supabase } from "../supabase";
import { useSystemSettings } from "../hooks/useSystemSettings";

export default function UploadDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings: systemSettings } = useSystemSettings();
  const [upload, setUpload] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: uploadData, error } = await supabase
          .from('uploads')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          throw error;
        }

        if (uploadData) {
          setUpload(uploadData);

          if (uploadData.firestore_order_id && uploadData.firestore_order_id !== "NEW_ORDER") {
            const orderRef = doc(db, "orders", uploadData.firestore_order_id);
            const orderSnap = await getDoc(orderRef);
            if (orderSnap.exists()) {
              setOrder({ id: orderSnap.id, ...orderSnap.data() });
            }
          }
        } else {
          setMessage("Upload not found");
        }
      } catch (error) {
        setMessage("Error loading upload details");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleAcceptPayment = async () => {
    if (!upload) return;

    setProcessing(true);

    try {
      let orderUpdated = false;
      let redirectToAddOrder = false;

      const isNewOrder = upload.is_new_order === true ||
        upload.firestore_order_id === "NEW_ORDER" ||
        (!upload.firestore_order_id && upload.client_id);

      if (isNewOrder) {
        const orderData = {
          customerId: upload.client_id,
          customerName: upload.client_name,
          phone: upload.client_phone,
          clientType: upload.client_type,
          customerCode: upload.client_code,
          depositEGP: upload.payment_amount,
          orderType: upload.order_type || "B",
          existingOrderId: upload.new_order_id || upload.firestore_order_id,
        };

        sessionStorage.setItem('prefilledOrderData', JSON.stringify(orderData));
        sessionStorage.setItem('uploadId', id);

        redirectToAddOrder = true;
        orderUpdated = true;
      }
      else if (upload.firestore_order_id && upload.firestore_order_id !== "NEW_ORDER" && order) {
        const orderRef = doc(db, "orders", upload.firestore_order_id);

        const currentDeposit = Number(order.depositEGP || 0);
        const currentDiscount = Number(order.discountEGP || 0);
        const currentPaidToWebsite = Number(order.paidToWebsite || 0);
        const currentTotalEGP = Number(order.totalEGP || 0);
        const newPayment = Number(upload.payment_amount || 0);

        const newDeposit = currentDeposit + newPayment;
        const newOutstanding = currentTotalEGP - (newDeposit + currentDiscount + currentPaidToWebsite);

        if (order.status === "Requested") {
          await updateDoc(orderRef, {
            status: "Order Placed",
            depositEGP: newDeposit,
            outstanding: newOutstanding
          });
        } else {
          await updateDoc(orderRef, {
            depositEGP: newDeposit,
            outstanding: newOutstanding
          });
        }

        orderUpdated = true;
      }
      else {
        throw new Error("Invalid order state for this upload");
      }

      const { error: updateError } = await supabase
        .from('uploads')
        .update({
          status: "Approved",
          processed_at: new Date().toISOString(),
          processed_by: "Admin",
          ...(redirectToAddOrder && { requires_order_completion: true })
        })
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }

      setUpload(prev => prev ? { ...prev, status: "Approved" } : null);

      let successMessage = "✅ Payment accepted! ";

      if (orderUpdated) {
        if (redirectToAddOrder) {
          successMessage += "Redirecting to complete order details...";
          setMessage(successMessage);
          setTimeout(() => {
            navigate('/add-order');
          }, 100);
          return;
        } else {
          successMessage += "Order updated successfully.";
        }
      }

      setMessage(successMessage);

    } catch (error) {
      setMessage("❌ Error accepting payment: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectPayment = async () => {
    if (!upload) return;

    setProcessing(true);
    try {
      const customerPhone = upload.client_phone?.replace(/\D/g, "") || "";

      if (!customerPhone) {
        setMessage("❌ Customer phone number not available for WhatsApp message.");
        setProcessing(false);
        return;
      }

      const rejectionMessage = systemSettings.paymentRejectedMessage || 
        "Order not placed as attached deposit photo is inconsistent with the entered payment amount.\n\nKindly re-upload the right deposit amount on the same link";

      const encodedMessage = encodeURIComponent(rejectionMessage);
      window.open(`https://wa.me/${customerPhone}?text=${encodedMessage}`, "_blank");

      const { error: updateError } = await supabase
        .from('uploads')
        .update({
          status: "Rejected",
          processed_at: new Date().toISOString(),
          processed_by: "Admin"
        })
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }

      setUpload(prev => prev ? { ...prev, status: "Rejected" } : null);
      setMessage("❌ Payment rejected. WhatsApp window opened.");
    } catch (error) {
      setMessage("❌ Error rejecting payment");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!upload) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-lg text-red-600">{message}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Upload Details</h1>
        <button
          onClick={() => navigate("/uploads")}
          className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
        >
          Back to Dashboard
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded ${message.startsWith("✅") ? "bg-green-100 text-green-700" :
            message.startsWith("❌") ? "bg-red-100 text-red-700" :
              "bg-yellow-100 text-yellow-700"
          }`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Client Information */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">Client Information</h2>
          <div className="space-y-2">
            <div>
              <label className="font-medium">Client Code:</label>
              <p className="text-gray-700">{upload.client_code}</p>
            </div>
            <div>
              <label className="font-medium">Client Name:</label>
              <p className="text-gray-700">{upload.client_name}</p>
            </div>
            <div>
              <label className="font-medium">Client Type:</label>
              <p className="text-gray-700">{upload.client_type}</p>
            </div>
            <div>
              <label className="font-medium">Client Phone:</label>
              <p className="text-gray-700">{upload.client_phone || "Not provided"}</p>
            </div>
            <div>
              <label className="font-medium">Order ID:</label>
              <p className="text-gray-700 font-mono">{upload.order_id}</p>
            </div>
            {upload.order_type && (
              <div>
                <label className="font-medium">Order Type:</label>
                <p className="text-gray-700">
                  {upload.order_type === "B" ? "Barry" : "Gawy"}
                </p>
              </div>
            )}
            {order && (
              <div>
                <label className="font-medium">Current Order Status:</label>
                <p className="text-gray-700 font-medium">{order.status}</p>
              </div>
            )}
            {upload.is_new_order && (
              <div className="bg-blue-50 p-2 rounded">
                <p className="text-blue-700 text-sm">
                  ⓘ This is a new order. When approved, you'll be redirected to complete order details.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Information */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">Payment Information</h2>
          <div className="space-y-2">
            <div>
              <label className="font-medium">Payment Amount:</label>
              <p className="text-xl font-bold text-green-600">
                {upload.payment_amount} EGP
              </p>
            </div>
            <div>
              <label className="font-medium">Uploaded At:</label>
              <p className="text-gray-700">
                {upload.created_at ? new Date(upload.created_at).toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <label className="font-medium">Status:</label>
              <p className={`font-medium ${upload.status === "Approved" ? "text-green-600" :
                  upload.status === "Rejected" ? "text-red-600" :
                    "text-yellow-600"
                }`}>
                {upload.status || "Under Approval"}
                {upload.processed_at && (
                  <span className="block text-sm text-gray-500">
                    Processed: {new Date(upload.processed_at).toLocaleString() || "—"}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Photos */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Payment Photos</h2>
        {upload.payment_images?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upload.payment_images.map((url, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <img
                  src={url}
                  alt={`Payment receipt ${index + 1}`}
                  className="w-full h-48 object-cover cursor-pointer"
                  onClick={() => window.open(url, "_blank")}
                />
                <div className="p-2 text-center bg-gray-50">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    View Full Size
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic">No payment photos uploaded</p>
        )}
      </div>

      {/* Order Photos */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Order Photos</h2>
        {upload.order_images?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upload.order_images.map((url, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <img
                  src={url}
                  alt={`Order photo ${index + 1}`}
                  className="w-full h-48 object-cover cursor-pointer"
                  onClick={() => window.open(url, "_blank")}
                />
                <div className="p-2 text-center bg-gray-50">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    View Full Size
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic">No order photos uploaded</p>
        )}
      </div>

      {/* Action Buttons - Only show for Under Approval status */}
      {(upload.status === "Under Approval" || !upload.status) && (
        <div className="flex gap-4 justify-end pt-4 border-t">
          <button
            onClick={handleRejectPayment}
            disabled={processing}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded disabled:bg-red-400"
          >
            Reject Payment
          </button>
          <button
            onClick={handleAcceptPayment}
            disabled={processing}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded disabled:bg-green-400"
          >
            {processing ? "Processing..." : "Accept Payment"}
          </button>
        </div>
      )}
    </div>
  );
}