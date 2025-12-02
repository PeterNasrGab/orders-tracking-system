import React, { useState, useRef } from "react";

export default function FilePicker({ onFilesChange, label = "Choose files", accept = "image/*", multiple = true }) {
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = (fileList) => {
    const arr = Array.from(fileList);
    setFiles(arr);
    if (onFilesChange) onFilesChange(arr);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 cursor-pointer ${
        dragging ? "bg-blue-50 border-blue-400" : "bg-white border-gray-300"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      <p className="font-semibold text-gray-700">📁 {label}</p>
      <p className="text-sm text-gray-500 mt-1">Drag and drop or click to browse</p>

      {files.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {files.map((file, idx) => (
            <div key={idx} className="w-20 h-20 rounded-lg border flex items-center justify-center bg-gray-100 overflow-hidden">
              {file.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt="preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-gray-600 px-1">{file.name}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
