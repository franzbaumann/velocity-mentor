import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''https://nhxwjaqhlbkdnageyavu.supabase.c
const supabaseKey = process.env.SUPABASE_ANON_KEY || ''eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeHdqYXFobGJrZG5hZ2V5YXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NzI5NzMsImV4cCI6MjA4NzI0ODk3M30.i7YEsLDUwD2jyCOk8J-QooMPSJd-Sezuw5b9ZfuQKbM

export const supabase = createClient(supabaseUrl, supabaseKey)
