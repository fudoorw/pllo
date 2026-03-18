const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://jjjdzpmxyifubbnvktwn.supabase.co';
const supabaseKey = 'sb_publishable_MOCc6fvCuOl0vQLenQ6-KQ_ZOOmMYre';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    let query = supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(10);
    const { data, error } = await query;
    console.log("Error:", error);
    console.log("Data:", data);
}
run();
