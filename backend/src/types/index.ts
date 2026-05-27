import type { User } from '@supabase/supabase-js'

// Augment Express Request with auth fields set by middleware
declare global {
  namespace Express {
    interface Request {
      user?: User
      role?: 'ADMIN' | 'TEACHER'
    }
  }
}

export {}
