import { createClient } from '@supabase/supabase-js';

// @ts-ignore
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xqaufutccvoeaxrmuuof.supabase.co';
// @ts-ignore
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxYXVmdXRjY3ZvZWF4cm11dW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MDYzODMsImV4cCI6MjA5MDI4MjM4M30.CLJ2m6rF76y9nx-ZCqE9MguAEa9vjAoHzygB5bfL5Sk';

export const supabase = createClient(supabaseUrl, supabaseKey);
