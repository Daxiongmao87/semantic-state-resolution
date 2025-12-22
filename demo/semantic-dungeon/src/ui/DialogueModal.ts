
import { NPC, Rumor } from '../town/TownTypes';
import { getTownManager } from '../town/TownManager';

export class DialogueModal {
    private container: HTMLElement;
    private npc: NPC;
    private onClose: () => void;
    private townManager = getTownManager();

    constructor(npc: NPC, onClose: () => void) {
        this.npc = npc;
        this.onClose = onClose;
        this.container = document.createElement('div');
        this.container.className = 'modal-overlay';
        this.render();
        document.body.appendChild(this.container);
        this.setupEvents();
    }

    private render() {
        this.container.innerHTML = `
            <div class="modal-content dialogue-modal">
                <div class="modal-header">
                    <h3>${this.npc.collapsedFacts.name?.value || 'Unknown'} <span class="npc-archetype">(${this.npc.archetype})</span></h3>
                    <button class="modal-close" id="close-dialogue">&times;</button>
                </div>
                <div class="npc-description">
                    <p>${this.npc.collapsedFacts.description?.value || 'A mysterious figure.'}</p>
                    <p class="npc-personality"><em>${this.npc.collapsedFacts.personality?.value || 'Neutral'}</em></p>
                </div>
                
                <div class="chat-history" id="chat-history">
                    <!-- History Injected Here -->
                </div>

                <div class="chat-input-area">
                    <input type="text" id="chat-input" placeholder="Ask about rumors, news, or their life..." autocomplete="off">
                    <button id="chat-send" class="btn primary">Say</button>
                </div>
            </div>
        `;
        this.renderHistory();
    }

    private renderHistory() {
        const historyEl = this.container.querySelector('#chat-history');
        if (!historyEl) return;

        historyEl.innerHTML = this.npc.history.map(msg => `
            <div class="chat-message ${msg.sender}">
                <span class="sender">${msg.sender === 'player' ? 'You' : this.npc.collapsedFacts.name?.value || 'NPC'}:</span>
                <span class="text">${msg.text}</span>
            </div>
        `).join('');

        // Scroll to bottom
        historyEl.scrollTop = historyEl.scrollHeight;
    }

    private setupEvents() {
        this.container.querySelector('#close-dialogue')?.addEventListener('click', () => {
            this.close();
        });

        const input = this.container.querySelector('#chat-input') as HTMLInputElement;
        const sendBtn = this.container.querySelector('#chat-send');

        const send = () => {
            const text = input.value.trim();
            if (text) {
                this.handleSendMessage(text);
                input.value = '';
            }
        };

        sendBtn?.addEventListener('click', send);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') send();
        });

        // Focus input
        setTimeout(() => input.focus(), 100);
    }

    private async handleSendMessage(text: string) {
        // Optimistic render (handled by re-render after logic, but could be instant)
        // Show loading state?
        const historyEl = this.container.querySelector('#chat-history');
        if (historyEl) {
            historyEl.innerHTML += `
                <div class="chat-message player">
                     <span class="sender">You:</span>
                     <span class="text">${text}</span>
                </div>
                <div class="chat-message npc loading">
                    <span class="sender">${this.npc.collapsedFacts.name || 'NPC'}:</span>
                    <span class="text">...</span>
                </div>
            `;
            historyEl.scrollTop = historyEl.scrollHeight;
        }

        try {
            const result = await this.townManager.chatWithNPC(this.npc.id, text);

            // Re-render full history (which now includes the real response)
            this.renderHistory();

            if (result.newRumor) {
                this.showRumorNotification(result.newRumor);
            }
        } catch (e) {
            console.error('Chat failed:', e);
            // Handle error in UI
        }
    }

    private showRumorNotification(rumor: Rumor) {
        const notif = document.createElement('div');
        notif.className = 'rumor-notification';
        notif.innerHTML = `
            <h4>New Rumor Discovered!</h4>
            <p><strong>${rumor.title}</strong></p>
            <p>${rumor.description}</p>
        `;
        this.container.querySelector('.modal-content')?.appendChild(notif);

        // Auto-fade
        setTimeout(() => notif.remove(), 5000);
    }

    private close() {
        this.container.remove();
        this.onClose();
    }
}
