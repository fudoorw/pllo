const { createClient } = require('@supabase/supabase-js');

const url = 'https://jjjdzpmxyifubbnvktwn.supabase.co';
const key = 'sb_publishable_MOCc6fvCuOl0vQLenQ6-KQ_ZOOmMYre';
const supabase = createClient(url, key);

async function testFetchPL() {
    console.log('Fetching transactions with nested items and product cost...');
    const { data, error } = await supabase.from('transactions')
        .select('*, transaction_items(product_id, quantity, price, products(cost))')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Transaction Data:');
    console.dir(data, { depth: null });

    if (data && data[0] && data[0].transaction_items) {
        data[0].transaction_items.forEach(item => {
            console.log('Item:', item.product_id);
            console.log('Products:', item.products);
        });
    }
}

testFetchPL();
