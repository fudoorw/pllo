const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jjjdzpmxyifubbnvktwn.supabase.co';
const supabaseKey = 'sb_publishable_MOCc6fvCuOl0vQLenQ6-KQ_ZOOmMYre';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    console.log('Testing low-stock query...');
    const { data, error } = await supabase
        .from('products')
        .select('*, categories(name), subcategories(name), brands(name)')
        .lte('stock', 10)
        .order('stock', { ascending: true })
        .limit(5);

    if (error) {
        console.error('Query Error:', error);
    } else {
        console.log('Success! Found', data.length, 'low stock items.');
        if (data.length > 0) {
            console.log('Sample item:', JSON.stringify(data[0], null, 2));
        }
    }
}

testQuery();
