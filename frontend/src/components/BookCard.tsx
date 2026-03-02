import Link from "next/link";
import { Book } from "@/lib/api";

export default function BookCard({ book }: { book: Book }) {
  return (
    <Link
      href={`/books/${book.id}`}
      className="block bg-gray-900 rounded-lg p-5 hover:bg-gray-800 transition"
    >
      <h3 className="font-semibold text-lg truncate">{book.title}</h3>
      <p className="text-gray-400 text-sm mt-1">{book.author}</p>
      <p className="text-gray-500 text-xs mt-2">
        {book.chapter_count} chapters
      </p>
    </Link>
  );
}
