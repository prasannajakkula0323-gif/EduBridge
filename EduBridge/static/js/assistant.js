/**
 * EduBridge AI — AI Opportunity Advisor (English Only)
 * Explains opportunity requirements clearly without bureaucratic jargon.
 * Strictly adheres to Trust & Safety rules: Never promises funding, never asks for passwords/Aadhaar.
 */

const AIAssistant = {
  currentOpportunity: null,

  init() {
    this.attachEventListeners();
    this.checkEngineStatus();
  },

  async checkEngineStatus() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        const sourceBadge = document.getElementById('ai-engine-source-pill');
        if (sourceBadge) {
          if (data.gemini_active) {
            sourceBadge.textContent = '● Live Gemini AI';
            sourceBadge.className = 'badge badge-accent';
          } else {
            sourceBadge.textContent = '● Verified Knowledge Base';
            sourceBadge.className = 'badge badge-teal';
          }
        }
      }
    } catch (e) {
      // offline fallback
    }
  },

  openForOpportunity(opp) {
    this.currentOpportunity = opp;
    const modal = document.getElementById('ai-assistant-modal');
    const oppLabel = document.getElementById('ai-current-opp-label');

    if (oppLabel) {
      oppLabel.textContent = opp 
        ? `Discussing: ${opp.title} (${opp.category} • ${(opp.sector || 'Opportunity').toUpperCase()})`
        : "Ask anything about government & private scholarships, internships, non-tech degrees, or startup grants.";
    }

    this.updatePresetChips();
    this.checkEngineStatus();

    if (modal && typeof modal.showModal === 'function') {
      modal.showModal();
    }
  },

  async updatePresetChips() {
    const wrap = document.getElementById('preset-questions-wrap');
    if (!wrap) return;

    let presets = [];
    try {
      const oppId = this.currentOpportunity ? this.currentOpportunity.id : '';
      const res = await fetch(`/api/ai/preset-questions?opp_id=${encodeURIComponent(oppId)}`);
      if (res.ok) {
        const data = await res.json();
        presets = data.presets || [];
      }
    } catch (e) {
      // fallback if network fails
    }

    if (!presets || presets.length === 0) {
      presets = [
        { en: "Are non-technical students (B.Com, BA, LLB) eligible?" },
        { en: "What are the government vs private opportunities?" },
        { en: "Can working professionals and career changers apply?" },
        { en: "Are there grants for aspiring entrepreneurs and startups?" },
        { en: "Which internships offer paid stipends and remote mode?" },
        { en: "What are the exact required documents and proof needed?" }
      ];
    }

    wrap.innerHTML = presets.map(p => {
      const qText = p.en || p;
      return `<button type="button" class="preset-chip" data-q="${this.escapeHtml(qText)}">${this.escapeHtml(qText)}</button>`;
    }).join('');

    // Re-attach click listeners to chips
    wrap.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.getAttribute('data-q');
        this.submitQuery(query);
      });
    });
  },

  attachEventListeners() {
    // Preset chips
    this.updatePresetChips();

    // Form submit
    const form = document.getElementById('ai-chat-form');
    const input = document.getElementById('ai-user-query');

    if (form && input) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
          this.submitQuery(text);
          input.value = '';
        }
      });
    }

    // Close button
    const closeBtn = document.getElementById('close-ai-modal-btn');
    const modal = document.getElementById('ai-assistant-modal');
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.close());
    }
  },

  async submitQuery(question) {
    const opp = this.currentOpportunity;
    const oppId = opp ? opp.id : null;

    // Append User Message to UI
    this.appendMessage('user', question);

    // Show Typing Indicator
    const typingId = this.appendTypingIndicator();

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: oppId,
          question: question
        })
      });

      this.removeTypingIndicator(typingId);

      if (!response.ok) {
        throw new Error('Server returned an error');
      }

      const data = await response.json();
      const botAnswer = data.answer || "No response received. Please try again.";
      
      // Update engine badge
      const sourceBadge = document.getElementById('ai-engine-source-pill');
      if (sourceBadge) {
        if (data.source && data.source.includes('gemini')) {
          sourceBadge.textContent = '● Live Gemini AI';
          sourceBadge.className = 'badge badge-accent';
        } else {
          sourceBadge.textContent = '● Verified Knowledge Base';
          sourceBadge.className = 'badge badge-teal';
        }
      }

      this.appendMessage('bot', botAnswer, data.disclaimer);
    } catch (err) {
      this.removeTypingIndicator(typingId);
      console.error('[AIAssistant] Error:', err);
      this.appendMessage('bot', 'I encountered a brief connection error. Please make sure the EduBridge local server is running, or ask again.', null);
    }
  },

  appendMessage(sender, text, disclaimer = null) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}-message`;

    if (sender === 'bot') {
      msgDiv.innerHTML = `
        <div class="chat-avatar" aria-hidden="true">🤖</div>
        <div class="chat-bubble">
          <p>${this.formatMessageText(text)}</p>
          ${disclaimer ? `<p class="chat-note">🛡️ <em>${disclaimer}</em></p>` : ''}
        </div>
      `;
    } else {
      msgDiv.innerHTML = `
        <div class="chat-avatar" aria-hidden="true">👤</div>
        <div class="chat-bubble">
          <p>${this.escapeHtml(text)}</p>
        </div>
      `;
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  },

  appendTypingIndicator() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return null;

    const id = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.id = id;
    typingDiv.className = 'chat-message bot-message';
    typingDiv.innerHTML = `
      <div class="chat-avatar" aria-hidden="true">🤖</div>
      <div class="chat-bubble" style="color: var(--text-muted); font-style: italic;">
        EduBridge AI is researching the requirements...
      </div>
    `;
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;
    return id;
  },

  removeTypingIndicator(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
  },

  formatMessageText(text) {
    return this.escapeHtml(text)
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/•/g, '&bull;');
  },

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  AIAssistant.init();
});
