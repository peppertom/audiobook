"use client";
import { useEffect, useState } from "react";
import { getBooks, Book } from "@/lib/api";
import BookCard from "@/components/BookCard";
import FileUpload from "@/components/FileUpload";

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    getBooks().then(setBooks).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Library</h1>
      <FileUpload onUpload={(book) => setBooks((prev) => [book, ...prev])} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {books.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
      {books.length === 0 && (
        <p className="text-gray-500 text-center mt-8">
          No books yet. Upload an EPUB to get started.
        </p>
      )}
    </div>
  );
}
