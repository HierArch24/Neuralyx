import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://phpdxvaowytijhvclljb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocGR4dmFvd3l0aWpodmNsbGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjE4ODksImV4cCI6MjA4OTQ5Nzg4OX0.ClHZrdLj47HKUiDTfh6oolx3zRtD_dO2kidjfqY92nY'
)

// Check if is_featured column exists by trying to query it
const { data, error } = await supabase.from('news').select('is_featured').limit(1)

if (error && error.message.includes('is_featured')) {
  console.log('❌ is_featured column does not exist in news table.')
  console.log('')
  console.log('Please run this SQL in your Supabase Dashboard → SQL Editor:')
  console.log('')
  console.log('ALTER TABLE news ADD COLUMN is_featured BOOLEAN DEFAULT false;')
  console.log('UPDATE news SET is_featured = true WHERE sort_order <= 3;')
  console.log('')
  console.log('Or go to: https://supabase.com/dashboard/project/phpdxvaowytijhvclljb/sql/new')
} else {
  console.log('✅ is_featured column exists!')

  // Set first 3 articles as featured
  const { data: allNews } = await supabase.from('news').select('id, sort_order, is_featured').order('sort_order')
  if (allNews) {
    const featured = allNews.filter(n => n.is_featured)
    if (featured.length === 0) {
      console.log('Setting first 3 articles as featured...')
      const top3 = allNews.filter(n => n.sort_order <= 3)
      for (const article of top3) {
        await supabase.from('news').update({ is_featured: true }).eq('id', article.id)
      }
      console.log(`✅ Set ${top3.length} articles as featured`)
    } else {
      console.log(`Already have ${featured.length} featured articles`)
    }
  }
}
