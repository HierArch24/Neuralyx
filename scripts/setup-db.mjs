import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://phpdxvaowytijhvclljb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocGR4dmFvd3l0aWpodmNsbGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjE4ODksImV4cCI6MjA4OTQ5Nzg4OX0.ClHZrdLj47HKUiDTfh6oolx3zRtD_dO2kidjfqY92nY'
)

// Check which tables exist
const tables = ['sections', 'projects', 'skills', 'tools', 'news', 'contact_messages', 'site_settings']

for (const table of tables) {
  const { data, error } = await supabase.from(table).select('id').limit(1)
  if (error) {
    console.log(`❌ ${table}: ${error.message}`)
  } else {
    console.log(`✅ ${table}: exists (${data.length} rows sampled)`)
  }
}
