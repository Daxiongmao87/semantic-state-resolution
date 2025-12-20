/**
 * Class Generation UI - Phase 1 Demo
 */

import { getClassGenerator, ABILITY_UNLOCK_LEVELS, MAX_LEVEL, type AbilityOption } from '../class/ClassGenerator';
import { getEventLog } from '../engine/EventLog';

export class ClassGeneratorUI {
  private container: HTMLElement;
  private generator = getClassGenerator();
  private eventLog = getEventLog();

  private currentAbilityPool: AbilityOption[] = [];
  private pendingAbilityLevel: number | null = null;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container ${containerId} not found`);
    this.container = el;
    this.render();
  }

  private render(): void {
    const classEntity = this.generator.getClassEntity();

    if (!classEntity) {
      this.renderClassCreation();
    } else {
      this.renderCharacterSheet();
    }
  }

  private renderClassCreation(): void {
    this.container.innerHTML = `
      <div class="panel">
        <h2>Create Your Character</h2>
        <p class="subtitle">Describe your character concept and the LLM will generate class suggestions.</p>
        
        <div class="form-group">
          <label for="class-description">Character Concept</label>
          <textarea id="class-description" placeholder="e.g., A warrior who controls lightning" rows="3"></textarea>
        </div>
        
        <button id="generate-names-btn" class="btn primary">
          Generate Class Names
        </button>
        
        <div id="class-names-container" class="hidden">
          <h3>Select Your Class</h3>
          <div id="class-names-list" class="selection-list"></div>
        </div>
        
        <div id="loading" class="hidden">
          <div class="spinner"></div>
          <span>Consulting the Oracle...</span>
        </div>
      </div>
    `;

    this.bindClassCreationEvents();
  }

  private bindClassCreationEvents(): void {
    const descInput = document.getElementById('class-description') as HTMLTextAreaElement;
    const generateBtn = document.getElementById('generate-names-btn')!;
    const namesContainer = document.getElementById('class-names-container')!;
    const namesList = document.getElementById('class-names-list')!;
    const loading = document.getElementById('loading')!;

    generateBtn.addEventListener('click', async () => {
      const description = descInput.value.trim();
      if (!description) {
        alert('Please describe your character concept');
        return;
      }

      generateBtn.classList.add('hidden');
      loading.classList.remove('hidden');

      try {
        const names = await this.generator.generateClassNames(description);

        loading.classList.add('hidden');
        namesContainer.classList.remove('hidden');

        namesList.innerHTML = names.map(name => `
          <button class="selection-item" data-name="${name}">
            <span class="name">${name}</span>
          </button>
        `).join('');

        namesList.querySelectorAll('.selection-item').forEach(btn => {
          btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-name')!;
            this.generator.selectClassName(description, name);
            this.render();
          });
        });
      } catch (error) {
        loading.classList.add('hidden');
        generateBtn.classList.remove('hidden');
        console.error('Failed to generate names:', error);
        alert('Failed to generate class names. Check console.');
      }
    });
  }

  private renderCharacterSheet(): void {
    const classEntity = this.generator.getClassEntity()!;
    const abilities = this.generator.getAbilities();
    const level = classEntity.components.level || 1;
    const canUnlock = this.generator.canUnlockAbility();

    this.container.innerHTML = `
      <div class="panel character-sheet">
        <div class="header">
          <div class="class-info">
            <h2>${classEntity.components.name}</h2>
            <p class="description">"${classEntity.components.description}"</p>
          </div>
          <div class="level-badge">
            <span class="level">Lv ${level}</span>
            <span class="max">/ ${MAX_LEVEL}</span>
          </div>
        </div>
        
        <div class="actions">
          <button id="level-up-btn" class="btn ${level >= MAX_LEVEL ? 'disabled' : 'secondary'}">
            ⬆ Level Up
          </button>
          <button id="reset-btn" class="btn danger">
            Reset Character
          </button>
        </div>
        
        ${canUnlock ? `
          <div class="ability-unlock panel-inset">
            <h3>🎉 New Ability Available!</h3>
            <p>You've reached level ${level}! Choose a new ability.</p>
            ${this.generator.isAbilityPoolReady(level) ? `
              <button id="generate-abilities-btn" class="btn primary">
                ⚡ Show Ability Choices (Cached)
              </button>
            ` : `
              <button id="generate-abilities-btn" class="btn primary">
                Generate Ability Choices
              </button>
            `}
          </div>
        ` : ''}
        
        <div id="ability-pool-container" class="hidden">
          <h3>Choose Your Ability</h3>
          <div id="ability-pool-list" class="selection-list"></div>
        </div>
        
        <div class="abilities-section">
          <h3>Abilities</h3>
          ${abilities.length === 0 ? '<p class="empty">No abilities yet. Level up to unlock!</p>' : ''}
          <div class="abilities-list">
            ${abilities.map(a => `
              <div class="ability-card ${a.components.properties ? 'collapsed' : 'shallow'}">
                <div class="ability-header">
                  <span class="name">${a.components.name}</span>
                  <span class="category tag-${a.components.category}">${a.components.category}</span>
                  <span class="level">Lv${a.components.unlockLevel}</span>
                </div>
                ${a.components.properties ? `
                  <div class="ability-properties">
                    ${Object.entries(a.components.properties).map(([k, v]) =>
      `<span class="prop"><b>${k}:</b> ${v}</span>`
    ).join('')}
                  </div>
                ` : `
                  <button class="btn small collapse-btn" data-ability-id="${a.id}">
                    Reveal Properties
                  </button>
                `}
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="progression">
          <h3>Ability Progression</h3>
          <div class="progression-track">
            ${ABILITY_UNLOCK_LEVELS.map(unlockLevel => {
      const slot = classEntity.components.abilitySlots?.find(s => s.unlockLevel === unlockLevel);
      const ability = slot?.abilityId ? abilities.find(a => a.id === slot.abilityId) : null;
      const unlocked = level >= unlockLevel;
      const current = level === unlockLevel && canUnlock;

      return `
                <div class="progression-node ${unlocked ? 'unlocked' : ''} ${current ? 'current' : ''}">
                  <span class="node-level">Lv${unlockLevel}</span>
                  <span class="node-ability">${ability?.components.name || (unlocked ? '?' : '🔒')}</span>
                </div>
              `;
    }).join('')}
          </div>
        </div>
        
        <div id="loading" class="hidden">
          <div class="spinner"></div>
          <span>Consulting the Oracle...</span>
        </div>
      </div>
      
      <div class="panel event-log">
        <h3>Event Log</h3>
        <div id="event-log-content" class="log-content">
          ${this.eventLog.tail(10).map(e => `
            <div class="log-entry">
              <span class="type">${e.type}</span>
              <span class="id">${'entityId' in e ? e.entityId : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.bindCharacterSheetEvents();
  }

  private bindCharacterSheetEvents(): void {
    const levelUpBtn = document.getElementById('level-up-btn');
    const resetBtn = document.getElementById('reset-btn');
    const generateAbilitiesBtn = document.getElementById('generate-abilities-btn');
    const loading = document.getElementById('loading')!;
    const poolContainer = document.getElementById('ability-pool-container');
    const poolList = document.getElementById('ability-pool-list');

    levelUpBtn?.addEventListener('click', () => {
      const classEntity = this.generator.getClassEntity();
      if (classEntity && (classEntity.components.level || 1) < MAX_LEVEL) {
        this.generator.levelUp();
        this.render();
      }
    });

    resetBtn?.addEventListener('click', () => {
      if (confirm('Reset character? This cannot be undone.')) {
        this.generator.reset();
        this.render();
      }
    });

    generateAbilitiesBtn?.addEventListener('click', async () => {
      const level = this.generator.getClassEntity()?.components.level || 1;

      generateAbilitiesBtn.classList.add('hidden');
      loading.classList.remove('hidden');

      try {
        this.currentAbilityPool = await this.generator.generateAbilityPool(level);
        this.pendingAbilityLevel = level;

        loading.classList.add('hidden');
        if (poolContainer && poolList) {
          poolContainer.classList.remove('hidden');
          poolList.innerHTML = this.currentAbilityPool.map((option, i) => `
            <button class="selection-item ability-option" data-index="${i}">
              <span class="name">${option.name}</span>
              <span class="category tag-${option.category}">${option.category}</span>
              <span class="description">${option.description}</span>
            </button>
          `).join('');

          poolList.querySelectorAll('.ability-option').forEach(btn => {
            btn.addEventListener('click', async () => {
              const index = parseInt(btn.getAttribute('data-index')!, 10);
              const option = this.currentAbilityPool[index];

              poolContainer.classList.add('hidden');
              loading.classList.remove('hidden');

              await this.generator.selectAbility(this.pendingAbilityLevel!, option);
              this.pendingAbilityLevel = null;
              this.currentAbilityPool = [];

              this.render();
            });
          });
        }
      } catch (error) {
        loading.classList.add('hidden');
        generateAbilitiesBtn.classList.remove('hidden');
        console.error('Failed to generate abilities:', error);
        alert('Failed to generate abilities. Check console.');
      }
    });

    // Collapse ability properties buttons
    document.querySelectorAll('.collapse-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const abilityId = btn.getAttribute('data-ability-id')!;
        btn.textContent = 'Collapsing...';
        (btn as HTMLButtonElement).disabled = true;

        try {
          await this.generator.collapseAbilityProperties(abilityId);
          this.render();
        } catch (error) {
          console.error('Failed to collapse properties:', error);
          btn.textContent = 'Failed - Retry';
          (btn as HTMLButtonElement).disabled = false;
        }
      });
    });
  }
}
