const API_BASE = 'http://localhost:5157/chat';

let sessionId = localStorage.getItem('vkusvill_session_id');
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('vkusvill_session_id', sessionId);
}

let cart = JSON.parse(localStorage.getItem('vkusvill_cart') || '[]');

const chatArea = document.getElementById('chatArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newCartBtn = document.getElementById('newCartBtn');
const cartBtn = document.getElementById('cartBtn');
const cartPanel = document.getElementById('cartPanel');
const cartItems = document.getElementById('cartItems');
const cartEmpty = document.getElementById('cartEmpty');
const cartCount = document.getElementById('cartCount');
const closeCartBtn = document.getElementById('closeCartBtn');

let isProcessing = false;

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
newCartBtn.addEventListener('click', resetCart);
cartBtn.addEventListener('click', toggleCart);
closeCartBtn.addEventListener('click', () => cartPanel.classList.add('hidden'));

updateCartUI();

function setProcessing(value) {
    isProcessing = value;
    messageInput.disabled = value;
    sendBtn.disabled = value;
    sendBtn.classList.toggle('disabled', value);
}

function addMessage(type, html) {
    const div = document.createElement('div');
    div.className = `message message-${type}`;
    div.innerHTML = html;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    return div;
}

function removeWelcome() {
    const welcome = chatArea.querySelector('.welcome');
    if (welcome) welcome.remove();
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isProcessing) return;

    removeWelcome();
    messageInput.value = '';
    addMessage('user', escapeHtml(text));
    setProcessing(true);

    try {
        const response = await fetch(`${API_BASE}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Id': sessionId
            },
            body: JSON.stringify({ message: text })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    try {
                        const evt = JSON.parse(jsonStr);
                        const data = JSON.parse(evt.data);
                        handleEvent(evt.type, data);
                    } catch { /* skip malformed */ }
                }
            }
        }
    } catch (err) {
        addMessage('error', `Ошибка: ${escapeHtml(err.message)}`);
    } finally {
        setProcessing(false);
    }
}

function handleEvent(type, data) {
    switch (type) {
        case 'assistant_message': {
            let html = '';
            if (data.text) {
                html += `<div class="assistant-text">${escapeHtml(data.text)}</div>`;
            }
            if (data.toolCalls && data.toolCalls.length > 0) {
                html += `<div class="tool-calls">`;
                for (const tc of data.toolCalls) {
                    html += `<div class="tool-call">
                        <span class="tool-badge">tool</span> ${escapeHtml(tc.name)}
                    </div>`;
                }
                html += `</div>`;
            }
            if (html) {
                addMessage('assistant', html);
            }
            break;
        }
        case 'final_answer': {
            const { text, productsHtml } = parseFinalAnswer(data.text);
            let html = `<div class="final-text">${text}</div>`;
            if (productsHtml) {
                html += productsHtml;
            }
            addMessage('assistant final', html);
            break;
        }
        case 'error': {
            addMessage('error', `Ошибка: ${escapeHtml(data.message)}`);
            break;
        }
    }
}

function parseFinalAnswer(text) {
    const jsonBlockRegex = /```json\s*([\s\S]*?)```/;
    const match = text.match(jsonBlockRegex);

    if (!match) {
        return { text: escapeHtml(text), productsHtml: null };
    }

    try {
        const parsed = JSON.parse(match[1]);

        if (parsed.products && Array.isArray(parsed.products) && parsed.products.length > 0) {
            const productsHtml = renderProducts(parsed.products);
            return { text: '', productsHtml };
        }
    } catch { /* not valid JSON, show as text */ }

    return { text: escapeHtml(text), productsHtml: null };
}

function renderProducts(products) {
    let html = '<div class="products-grid">';
    for (const p of products) {
        const name = escapeHtml(p.name || 'Без названия');
        const price = p.price != null ? `${Number(p.price).toFixed(0)} ₽` : '';
        const rating = p.rating != null ? Number(p.rating).toFixed(1) : '';
        const img = p.imgUrl ? `<img src="${escapeHtml(p.imgUrl)}" alt="${name}" loading="lazy" onerror="this.style.display='none'">` : '<div class="no-image">🛒</div>';

        const productData = escapeHtml(JSON.stringify(p));

        html += `<div class="product-card" data-product='${productData}'>
            <div class="product-img">${img}</div>
            <div class="product-info">
                <div class="product-name">${name}</div>
                <div class="product-meta">
                    ${price ? `<span class="product-price">${price}</span>` : ''}
                    ${rating ? `<span class="product-rating">${rating} ★</span>` : ''}
                </div>
                <button class="btn-add-to-cart" onclick="addToCart(this)">В корзину</button>
            </div>
        </div>`;
    }
    html += '</div>';
    return html;
}

function addToCart(btn) {
    const card = btn.closest('.product-card');
    const productData = JSON.parse(card.dataset.product);
    cart.push(productData);
    saveCart();
    updateCartUI();

    btn.textContent = 'Добавлено ✓';
    btn.classList.add('added');
    setTimeout(() => {
        btn.textContent = 'В корзину';
        btn.classList.remove('added');
    }, 1500);
}

function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    updateCartUI();
}

function saveCart() {
    localStorage.setItem('vkusvill_cart', JSON.stringify(cart));
}

function updateCartUI() {
    cartCount.textContent = cart.length;
    cartItems.innerHTML = '';

    if (cart.length === 0) {
        cartEmpty.style.display = 'block';
        return;
    }

    cartEmpty.style.display = 'none';

    cart.forEach((item, index) => {
        const name = escapeHtml(item.name || 'Без названия');
        const price = item.price != null ? `${Number(item.price).toFixed(0)} ₽` : '';

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-name">${name}</div>
                ${price ? `<div class="cart-item-price">${price}</div>` : ''}
            </div>
            <button class="btn-remove-item" onclick="removeFromCart(${index})">&times;</button>
        `;
        cartItems.appendChild(div);
    });
}

function toggleCart() {
    cartPanel.classList.toggle('hidden');
}

async function resetCart() {
    if (isProcessing) return;

    try {
        await fetch(`${API_BASE}/reset`, {
            method: 'POST',
            headers: { 'X-Session-Id': sessionId }
        });
    } catch { /* ignore */ }

    sessionId = crypto.randomUUID();
    localStorage.setItem('vkusvill_session_id', sessionId);

    cart = [];
    saveCart();
    updateCartUI();
    cartPanel.classList.add('hidden');

    chatArea.innerHTML = '<div class="welcome">Корзина сброшена. Начнём заново!</div>';
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
