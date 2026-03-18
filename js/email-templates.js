// Use the centralized Supabase client from config.js + supabase-client.js
const db = window.supabase;

let editingId = null;

async function init() {
    if (window.location.search.includes('mode=embedded')) {
        document.body.classList.add('embedded');
    }
    await loadTemplates();
}

async function loadTemplates() {
    const { data } = await db.from('email_templates').select('*').order('created_at', { ascending: false });
    const grid = document.getElementById('templatesGrid');
    grid.innerHTML = '';

    data?.forEach(template => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.innerHTML = `
            <div class="template-header">
                <div>
                    <div class="template-name">${template.name}</div>
                    <div class="template-subject">Subject: ${template.subject}</div>
                </div>
                <div class="template-actions">
                    <button class="btn-icon" onclick="editTemplate('${template.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="deleteTemplate('${template.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="template-content">${template.body.substring(0, 200)}${template.body.length > 200 ? '...' : ''}</div>
        `;
        grid.appendChild(card);
    });
}

function openModal() {
    editingId = null;
    document.getElementById('templateForm').reset();
    document.getElementById('templateModal').classList.add('active');
}

function closeModal() {
    document.getElementById('templateModal').classList.remove('active');
}

async function editTemplate(id) {
    editingId = id;
    const { data } = await db.from('email_templates').select('*').eq('id', id).single();
    document.getElementById('templateName').value = data.name;
    document.getElementById('templateSubject').value = data.subject;
    document.getElementById('templateBody').value = data.body;
    document.getElementById('templateModal').classList.add('active');
}

async function deleteTemplate(id) {
    if (confirm('Delete this template?')) {
        await db.from('email_templates').delete().eq('id', id);
        await loadTemplates();
    }
}

document.getElementById('templateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        name: document.getElementById('templateName').value,
        subject: document.getElementById('templateSubject').value,
        body: document.getElementById('templateBody').value
    };

    if (editingId) {
        await db.from('email_templates').update(payload).eq('id', editingId);
    } else {
        await db.from('email_templates').insert(payload);
    }

    closeModal();
    await loadTemplates();
});

document.addEventListener('DOMContentLoaded', init);
