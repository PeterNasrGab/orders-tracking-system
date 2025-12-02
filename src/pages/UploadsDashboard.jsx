import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase";
import { useSystemSettings } from "../hooks/useSystemSettings";

export default function UploadsDashboard() {
  const { settings: systemSettings } = useSystemSettings();
  const [uploads, setUploads] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Under Approval");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUploads = async () => {
    try {
      setLoading(true);
      setError("");
      
      const { data: uploadData, error: supabaseError } = await supabase
        .from('uploads')
        .select('*')
        .order('created_at', { ascending: false });

      if (supabaseError) {
        throw supabaseError;
      }

      setUploads(uploadData || []);
      
    } catch (error) {
      setError(`Failed to load uploads: ${error.message}`);
      setUploads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  // Use upload statuses from system settings
  const statusOptions = ["All", ...(systemSettings.uploadStatuses || ["Under Approval", "Approved", "Rejected"])];

  const filteredUploads = uploads.filter((u) => {
    const matchesSearch = 
      u.client_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.order_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const currentStatus = u.status || "Under Approval";
    
    const matchesStatus = 
      statusFilter === "All" || 
      currentStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    const currentStatus = status || "Under Approval";
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    
    switch (currentStatus) {
      case "Approved":
        return `${baseClasses} bg-green-100 text-green-800`;
      case "Rejected":
        return `${baseClasses} bg-red-100 text-red-800`;
      case "Under Approval":
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const getStatusCount = (status) => {
    if (status === "Under Approval") {
      return uploads.filter(u => !u.status || u.status === "Under Approval").length;
    }
    return uploads.filter(u => u.status === status).length;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 text-center">
        Customer Uploads
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by client code, order ID, or client name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border rounded p-2 flex-1 min-w-[200px]"
        />
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded p-2"
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{uploads.length}</div>
          <div className="text-sm text-gray-600">Total</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">
            {getStatusCount("Under Approval")}
          </div>
          <div className="text-sm text-gray-600">Under Approval</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {getStatusCount("Approved")}
          </div>
          <div className="text-sm text-gray-600">Approved</div>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-600">
            {getStatusCount("Rejected")}
          </div>
          <div className="text-sm text-gray-600">Rejected</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border border-gray-200 rounded-lg text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-2 text-left">Client Code</th>
              <th className="p-2 text-left">Client Name</th>
              <th className="p-2 text-left">Order ID</th>
              <th className="p-2 text-left">Payment Amount (EGP)</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Uploaded At</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredUploads.map((u) => (
              <tr key={u.id} className="border-t hover:bg-gray-50">
                <td className="p-2">{u.client_code}</td> {/* ⭐ UPDATED: snake_case */}
                <td className="p-2">{u.client_name}</td> {/* ⭐ UPDATED: snake_case */}
                <td className="p-2 font-mono">{u.order_id}</td> {/* ⭐ UPDATED: snake_case */}
                <td className="p-2">{u.payment_amount}</td> {/* ⭐ UPDATED: snake_case */}
                <td className="p-2">
                  <span className={getStatusBadge(u.status)}>
                    {u.status || "Under Approval"}
                  </span>
                </td>
                <td className="p-2">
                  {u.created_at ? new Date(u.created_at).toLocaleString() : "—"} {/* ⭐ UPDATED: snake_case */}
                </td>
                <td className="p-2">
                  <Link
                    to={`/upload/${u.id}`}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                  >
                    View Details
                  </Link>
                </td>
              </tr>
            ))}

            {!filteredUploads.length && (
              <tr>
                <td colSpan="7" className="text-center py-4 text-gray-500">
                  No uploads found matching the current filters.
                  {statusFilter === "Under Approval" && (
                    <div className="mt-2 text-sm">
                      This includes uploads with no status set.
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}