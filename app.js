const API_BASE = 'http://localhost:5000/api/chat';

let sessionId = localStorage.getItem('vkusvill_session_id');
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('vkusvill_session_id', sessionId);
}

const chatArea = document.getElementById('chatArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newCartBtn = document.getElementById('newCartBtn');

let isProcessing = false;

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
newCartBtn.addEventListener('click', resetCart);

function setProcessing(value) {
    isProcessing = value;
    messageInput.disabled = value;
    sendBtn.disabled = value;
    if (value) {
        sendBtn.classList.add('disabled');
    } else {
        sendBtn.classList.remove('disabled');
    }
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

    let assistantDiv = null;

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
                        handleEvent(evt.type, data, ref => { assistantDiv = ref; }, assistantDiv);
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

function handleEvent(type, data, setAssistant, currentAssistant) {
    switch (type) {
        case 'assistant_message': {
            let html = '';
            if (data.text) {
                html += `<div class="assistant-text">${escapeHtml(data.text)}</div>`;
            }
            if (data.toolCalls && data.toolCalls.length > 0) {
                for (const tc of data.toolCalls) {
                    html += `<div class="tool-call">
                        <span class="tool-badge">tool</span> ${escapeHtml(tc.name)}
                    </div>`;
                }
            }
            if (html) {
                setAssistant(addMessage('assistant', html));
            }
            break;
        }
        case 'tool_result': {
            const truncated = data.result.length > 500
                ? data.result.substring(0, 500) + '...'
                : data.result;
            addMessage('tool-result', `
                <div class="tool-result-header">
                    <span class="tool-badge result">result</span> ${escapeHtml(data.toolName)}
                </div>
                <div class="tool-result-body">${escapeHtml(truncated)}</div>
            `);
            break;
        }
        case 'final_answer': {
            addMessage('assistant final', `
                <div class="final-text">${escapeHtml(data.text)}</div>
            `);
            break;
        }
        case 'error': {
            addMessage('error', `Ошибка: ${escapeHtml(data.message)}`);
            break;
        }
    }
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

    chatArea.innerHTML = '<div class="welcome">Корзина сброшена. Начнём заново!</div>';
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
