// API contract for Utpost.
// Types mirror what the database actually returns (snake_case from raw SQL).

export type Difficulty = 'lätt' | 'medel' | 'svår'

export interface Guide {
  id: number
  slug: string
  title: string
  region: string
  difficulty: string // Free text in the DB, but should be one of the Difficulty union values
  length_km: number
  body_html: string
  hero_image: string | null
  published: boolean
  author_id: number | null
  updated_at: string
}

export interface User {
  id: number
  email: string
  display_name: string
  role: string
  created_at: string
}

export interface Tour {
  id: number
  user_id: number
  guide_id: number | null
  title: string
  started_at: string
  distance_m: number
  notes: string | null
}

export interface TourLog {
  id: number
  tour_id: number
  recorded_at: string
  lat: number
  lon: number
  elevation_m: number | null
  heart_rate: number | null
  note: string | null
}

/** GET /api/tours/:id */
export interface TourDetail extends Tour {
  logs: TourLog[]
  photos: Photo[]
}

export interface Photo {
  id: number
  tour_id: number
  filename: string
  width: number
  height: number
  created_at: string
}

export type TourWithRelations = Tour & {
  user: User
  guide: Guide | null
  photos: Photo[]
  logs: TourLog[]
}

/** POST /api/auth/login */
export interface LoginRequest {
  email: string
  password: string
}
export interface LoginResponse {
  token: string
  user: User
}

export interface ApiError {
  error: string
}


export interface PhotoUploadRequest {
  tourId: number
  filename: string
  width: number
  height: number
}

export interface PhotoVariant {
  size: number
  signature: string
}

export interface PhotoUploadResponse {
  variants: PhotoVariant[]
  processingMs: number
  coldStart: boolean
  instance: string
  apiMs: number
}
