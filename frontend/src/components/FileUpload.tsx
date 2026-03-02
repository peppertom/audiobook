"use client";
import { useCallback, useState } from "react";
import { uploadBook, Book } from "@/lib/api";

export default function FileUpload({
  onUpload,
}: {
  onUpload: (book: Book) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".epub")) {
        alert("Only EPUB files are supported");
        return;
      }
      setUploading(true);
      try {
        const book = await uploadBook(file);
        onUpload(book);
      } catch {
        alert("Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [onUpload]
  );

  return (
    <label
      className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition ${
        dragging
          ? "border-blue-500 bg-blue-500/10"
          : "border-gray-700 hover:border-gray-500"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        type="file"
        accept=".epub"
        className="hidden"
        onChange={(e) =>
          e.target.files?.[0] && handleFile(e.target.files[0])
        }
      />
      {uploading ? (
        <p className="text-gray-400">Uploading...</p>
      ) : (
        <>
          <p className="text-gray-400">
            Drop an EPUB here or click to upload
          </p>
          <p className="text-gray-600 text-sm mt-1">EPUB format only</p>
        </>
      )}
    </label>
  );
}
