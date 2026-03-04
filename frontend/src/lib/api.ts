const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

// --- Auth helpers ---
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("audiobook_token");
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (extra) Object.assign(headers, extra);
  return headers;
}

function authHeadersMultipart(): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders(options?.headers as Record<string, string>),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: { ...authHeadersMultipart(), ...options?.headers },
  });
}

// Books
export const getBooks = () => fetchApi<Book[]>("/api/books/");
export const getBook = (id: number) => fetchApi<BookDetail>(`/api/books/${id}`);
export const uploadBook = async (file: File) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetchWithAuth(`${API_BASE}/api/books/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json() as Promise<Book>;
};
export const deleteBook = (id: number) =>
  fetchWithAuth(`${API_BASE}/api/books/${id}`, { method: "DELETE" });
export const getChapterText = (bookId: number, chapterId: number) =>
  fetchApi<ChapterText>(`/api/books/${bookId}/chapters/${chapterId}/text`);
export const getBookCostEstimate = (bookId: number) =>
  fetchApi<CostEstimate>(`/api/books/${bookId}/cost-estimate`);

// Voices
export const getVoices = () => fetchApi<Voice[]>("/api/voices/");
export const createVoice = (data: { name: string; language: string; source: string }) =>
  fetchApi<Voice>("/api/voices/", { method: "POST", body: JSON.stringify(data) });
export const uploadReferenceClip = async (voiceId: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetchWithAuth(`${API_BASE}/api/voices/${voiceId}/reference-clip`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Reference clip upload failed");
  return res.json() as Promise<Voice>;
};
export const createVoiceFromYoutube = async (voiceId: number, url: string) =>
  fetchApi<Voice>(`/api/voices/${voiceId}/from-youtube?url=${encodeURIComponent(url)}`, {
    method: "POST",
  });
export const deleteVoice = (id: number) =>
  fetchWithAuth(`${API_BASE}/api/voices/${id}`, { method: "DELETE" });

// Jobs
export const getJobs = () => fetchApi<Job[]>("/api/jobs/");
export const getBookJobs = (bookId: number) => fetchApi<Job[]>(`/api/jobs/?book_id=${bookId}`);
export const generateBook = (bookId: number, voiceId: number, chapterVoices?: Record<number, number>) =>
  fetchApi<Job[]>(`/api/jobs/generate-book/${bookId}`, {
    method: "POST",
    body: JSON.stringify({ voice_id: voiceId, chapter_voices: chapterVoices || {} }),
  });

// Playback
export const getPlaybackState = (bookId: number, voiceId: number) =>
  fetchApi<PlaybackState>(`/api/playback/?book_id=${bookId}&voice_id=${voiceId}`);
export const savePlaybackState = (state: PlaybackStateUpdate) =>
  fetchApi<PlaybackState>("/api/playback/", { method: "PUT", body: JSON.stringify(state) });

// User
export const getCurrentUser = () => fetchApi<UserProfile>("/api/users/me");
export const getUserSettings = () => fetchApi<UserSettings>("/api/users/me/settings");
export const updateUserSettings = (data: Partial<UserSettings>) =>
  fetchApi<UserSettings>("/api/users/me/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const getCreditBalance = () => fetchApi<CreditBalance>("/api/users/me/credits");
export const getCreditHistory = (limit = 50, offset = 0) =>
  fetchApi<CreditTransaction[]>(`/api/users/me/credits/history?limit=${limit}&offset=${offset}`);

// Types
export interface Book {
  id: number; title: string; author: string; language: string;
  original_filename: string; chapter_count: number; created_at: string;
}
export interface Chapter {
  id: number; chapter_number: number; title: string; word_count: number;
}
export interface BookDetail extends Book { chapters: Chapter[]; }
export interface Voice {
  id: number; name: string; description: string; language: string;
  sample_audio_path: string | null; reference_clip_path: string | null;
  source: string; created_at: string;
}
export interface TimingChunk {
  start: number; end: number; text: string;
}
export interface Job {
  id: number; chapter_id: number; voice_id: number; status: string;
  audio_output_path: string | null; duration_seconds: number | null;
  timing_data: string | null;
  error_message: string | null; created_at: string; completed_at: string | null;
  chapter_title?: string; chapter_number?: number;
  book_title?: string; voice_name?: string;
}
export interface ChapterText {
  id: number; title: string; text_content: string;
}
export interface PlaybackState {
  id: number; book_id: number; voice_id: number;
  current_chapter_id: number; position_seconds: number; updated_at: string;
}
export interface PlaybackStateUpdate {
  book_id: number; voice_id: number;
  current_chapter_id: number; position_seconds: number;
}
export interface UserProfile {
  id: string; email: string; name: string | null;
  avatar_url: string | null; locale: string; created_at: string;
}
export interface UserSettings {
  playback_speed: number; audio_quality: string;
  email_notifications: boolean; theme: string; ui_language: string;
}
export interface CreditBalance {
  balance: number;
}
export interface CreditTransaction {
  id: number; amount: number; type: string;
  description: string | null; reference_id: string | null; created_at: string;
}
export interface CostEstimate {
  total_words: number; credits_required: number;
  estimated_cost_usd: number; current_balance: number; sufficient_credits: boolean;
}
