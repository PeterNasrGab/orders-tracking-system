import React from "react";

export default function Input({ label, name, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div className="flex flex-col mb-4">
      {label && <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}