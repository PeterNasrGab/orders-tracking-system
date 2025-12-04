import React, { useState } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { FiMenu, FiHome, FiPlusCircle, FiX, FiUpload, FiUser, FiLogOut, FiPackage, FiSettings } from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, isAdmin, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { name: "Dashboard", path: "/", icon: <FiHome /> },
    { name: "Barry Dashboard", path: "/barry", icon: <FiHome /> },
    { name: "Gawy Dashboard", path: "/gawy", icon: <FiHome /> },
    { name: "Upload Files", path: "/upload", icon: <FiUpload /> },
    ...(isAdmin ? [
      { name: "Add Order", path: "/add-order", icon: <FiPlusCircle /> },
      { name: "Uploads", path: "/uploads", icon: <FiUpload /> },
      { name: "System Settings", path: "/system-settings", icon: <FiSettings /> }, // Added System Settings
    ] : []),
    { name: "Accounts Dashboard", path: "/accounts-dashboard", icon: <FiHome /> },
    // Show Distribution Dashboard only for admin and manager roles, not for assistant
    ...(currentUser?.role !== 'assistant' ? [
      { name: "Distribution Dashboard", path: "/distribution-dashboard", icon: <FiPackage /> }
    ] : [])
  ];

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full bg-white shadow-lg z-50 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } w-64`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-xl font-bold text-gray-800">Youla's Yards</h1>
          <button
            className="text-gray-800 hover:text-gray-600 transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <FiX size={24} />
          </button>
        </div>

        {/* User Info */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <FiUser className="text-gray-600" />
            <div>
              <p className="font-medium text-sm">{currentUser?.username}</p>
              <p className="text-xs text-gray-600 capitalize">{currentUser?.role}</p>
            </div>
          </div>
        </div>

        <nav className="mt-4 flex flex-col">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className={`flex items-center gap-2 p-3 mx-2 my-1 rounded-lg transition-colors hover:bg-blue-100 ${
                location.pathname === link.path
                  ? "bg-blue-500 text-white"
                  : "text-gray-700"
              }`}
              onClick={() => setSidebarOpen(false)}
            >
              {link.icon} <span className="font-medium">{link.name}</span>
            </Link>
          ))}
          
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 p-3 mx-2 my-1 rounded-lg transition-colors hover:bg-red-100 text-gray-700 mt-4"
          >
            <FiLogOut /> <span className="font-medium">Logout</span>
          </button>
        </nav>
      </aside>

      {/* Overlay - Clicking anywhere on this will close the sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col transition-all duration-300 ml-0">
        
        {/* Floating Hamburger button - Positioned outside content area */}
        {!sidebarOpen && (
          <button
            className="fixed top-6 left-6 z-40 bg-white text-gray-800 p-3 rounded-full shadow-2xl border border-gray-200 hover:shadow-lg transition-all duration-300 hover:scale-110 hover:bg-blue-500 hover:text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <FiMenu size={24} />
          </button>
        )}

        {/* Main content with proper spacing */}
        <main className="p-6 pl-20">
          <Outlet />
        </main>
      </div>
    </div>
  );
}