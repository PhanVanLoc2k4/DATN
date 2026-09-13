/**
 * ASA - AI SECURITY ASSISTANT
 * Logic xử lý Chatbot độc lập
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log("ASA Chatbot Initializing...");
    
    const chatbotToggle = document.getElementById('chatbotToggle');
    const chatbotWindow = document.getElementById('chatbotWindow');
    const closeChat = document.getElementById('closeChat');
    const chatInput = document.getElementById('chatInput');
    const sendChat = document.getElementById('sendChat');
    const chatbotMessages = document.getElementById('chatbotMessages');

    if (chatbotToggle && chatbotWindow) {
        chatbotToggle.onclick = () => {
            chatbotWindow.classList.add('active');
            chatbotToggle.classList.add('active');
            if (chatInput) chatInput.focus();
        };
    }

    if (closeChat && chatbotWindow && chatbotToggle) {
        closeChat.onclick = () => {
            chatbotWindow.classList.remove('active');
            chatbotToggle.classList.remove('active');
        };
    }

    function appendMessage(text, role) {
        if (!chatbotMessages) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = 'msg ' + role;
        
        // Format text: Bold, Italic, Lists
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^-\s+(.*)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n/g, '<br>');
            
        msgDiv.innerHTML = formattedText;
        chatbotMessages.appendChild(msgDiv);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    function showTyping() {
        if (!chatbotMessages) return;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'msg bot typing';
        typingDiv.id = 'typingIndicator';
        typingDiv.innerHTML = '<span></span><span></span><span></span>';
        chatbotMessages.appendChild(typingDiv);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    function hideTyping() {
        const ti = document.getElementById('typingIndicator');
        if (ti) ti.remove();
    }

    async function handleSendMessage() {
        if (!chatInput) return;
        const message = chatInput.value.trim();
        if (!message) return;
        
        chatInput.value = '';
        appendMessage(message, 'user');
        
        showTyping();
        
        try {
            const response = await fetch('/api/chatbot/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });
            
            const data = await response.json();
            hideTyping();
            appendMessage(data.reply || "Xin lỗi, tôi gặp sự cố.", 'bot');
        } catch (err) {
            hideTyping();
            appendMessage("Không thể kết nối tới Hub AI. Vui lòng kiểm tra Server.", 'bot');
        }
    }

    if (sendChat) {
        sendChat.onclick = handleSendMessage;
    }

    if (chatInput) {
        chatInput.onkeypress = (e) => {
            if (e.key === 'Enter') handleSendMessage();
        };
    }

    // Gan vao global window de chip click co the goi
    window.sendQuickPrompt = (text) => {
        if (chatInput) {
            chatInput.value = text;
            handleSendMessage();
        }
    };

    console.log("ASA Chatbot Ready.");
});
