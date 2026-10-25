/**
 * EduBridge AI — Main Application Coordinator
 * Handles opportunities fetching, profile matching, filtering, modals,
 * and the Guided Demo Journey.
 */

// Global state
let allOpportunities = [];
let currentCategory = 'all';

// Toast Utility
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✓</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 300ms ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load initial profile from storage
  initProfileForm();

  // 2. Fetch opportunities from API
  await fetchAndRenderOpportunities();

  // 3. Setup Navigation & Modals
  initModalsAndNavigation();

  // 4. Setup Guided Demo Journey
  initGuidedDemoJourney();
});

/**
 * Initializes Profile Form controls from localStorage
 */
function initProfileForm() {
  const profile = StorageManager.getProfile();
  const levelSelect = document.getElementById('study-level-select');
  const streamSelect = document.getElementById('stream-select');
  const interestSelect = document.getElementById('interest-select');
  const oppTypeSelect = document.getElementById('opp-type-select');
  const sectorFilter = document.getElementById('sector-filter');
  const modeFilter = document.getElementById('mode-filter');
  const saveBtn = document.getElementById('save-profile-btn');

  if (levelSelect) levelSelect.value = profile.studyLevel || '1st-year';
  if (streamSelect) streamSelect.value = profile.stream || 'all';
  if (interestSelect) interestSelect.value = profile.interest || 'all';
  if (oppTypeSelect) oppTypeSelect.value = profile.oppType || 'all';

  // Checkboxes
  const skillCheckboxes = document.querySelectorAll('input[name="skill"]');
  skillCheckboxes.forEach(chk => {
    chk.checked = (profile.skills || []).includes(chk.value);
    chk.addEventListener('change', () => filterAndRenderOpportunities());
  });

  // Event Listeners for live filtering
  if (levelSelect) levelSelect.addEventListener('change', () => filterAndRenderOpportunities());
  if (streamSelect) streamSelect.addEventListener('change', () => filterAndRenderOpportunities());
  if (interestSelect) interestSelect.addEventListener('change', () => filterAndRenderOpportunities());
  if (sectorFilter) sectorFilter.addEventListener('change', () => filterAndRenderOpportunities());
  if (modeFilter) modeFilter.addEventListener('change', () => filterAndRenderOpportunities());

  if (oppTypeSelect) oppTypeSelect.addEventListener('change', () => {
    currentCategory = oppTypeSelect.value === 'all' ? 'all' : oppTypeSelect.value;
    updateCategoryTabsActive(currentCategory);
    filterAndRenderOpportunities();
  });

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveCurrentProfileFromForm();
      showToast('Profile preferences saved to your device!');
    });
  }
}

function saveCurrentProfileFromForm() {
  const levelSelect = document.getElementById('study-level-select');
  const streamSelect = document.getElementById('stream-select');
  const interestSelect = document.getElementById('interest-select');
  const oppTypeSelect = document.getElementById('opp-type-select');
  const skillCheckboxes = document.querySelectorAll('input[name="skill"]:checked');

  const selectedSkills = Array.from(skillCheckboxes).map(c => c.value);

  const profile = {
    studyLevel: levelSelect ? levelSelect.value : 'all',
    stream: streamSelect ? streamSelect.value : 'all',
    interest: interestSelect ? interestSelect.value : 'all',
    oppType: oppTypeSelect ? oppTypeSelect.value : 'all',
    skills: selectedSkills
  };

  StorageManager.saveProfile(profile);
  filterAndRenderOpportunities();
}

/**
 * Fetch opportunities from backend API
 */
async function fetchAndRenderOpportunities() {
  const grid = document.getElementById('opportunities-grid');
  try {
    const res = await fetch('/api/opportunities');
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    allOpportunities = data.opportunities || [];
    filterAndRenderOpportunities();
  } catch (err) {
    console.error('[App] Failed to load opportunities:', err);
    if (grid) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>Unable to load opportunities from the backend server. Please make sure Flask is running.</p>
        </div>
      `;
    }
  }
}

/**
 * Filter and render opportunities based on active category, search, sector, mode, and profile
 */
function filterAndRenderOpportunities() {
  const grid = document.getElementById('opportunities-grid');
  const emptyState = document.getElementById('empty-opportunities-state');
  const searchInput = document.getElementById('opportunity-search');
  const levelSelect = document.getElementById('study-level-select');
  const streamSelect = document.getElementById('stream-select');
  const interestSelect = document.getElementById('interest-select');
  const sectorFilter = document.getElementById('sector-filter');
  const modeFilter = document.getElementById('mode-filter');
  const matchCountEl = document.getElementById('profile-match-count');

  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const selectedLevel = levelSelect ? levelSelect.value : 'all';
  const selectedStream = streamSelect ? streamSelect.value : 'all';
  const selectedInterest = interestSelect ? interestSelect.value : 'all';
  const selectedSector = sectorFilter ? sectorFilter.value.toLowerCase() : 'all';
  const selectedMode = modeFilter ? modeFilter.value.toLowerCase() : 'all';

  let filtered = allOpportunities;

  // 1. Category Filter
  if (currentCategory && currentCategory !== 'all') {
    filtered = filtered.filter(o => {
      const cat = o.category.toLowerCase();
      const target = currentCategory.toLowerCase();
      if (target === 'scholarship') return cat.includes('scholarship');
      if (target === 'internship') return cat.includes('internship');
      if (target.includes('fellowship') || target.includes('job')) return cat.includes('fellowship') || cat.includes('job');
      if (target.includes('entrepreneurship') || target.includes('grant')) return cat.includes('entrepreneur') || cat.includes('grant');
      if (target === 'competition') return cat.includes('competition');
      if (target === 'course') return cat.includes('course');
      return cat === target;
    });
  }

  // 2. Sector Filter (Government vs Private/Corporate vs NGO/Foundation)
  if (selectedSector && selectedSector !== 'all') {
    filtered = filtered.filter(o => {
      const sec = (o.sector || '').toLowerCase();
      if (selectedSector === 'government') return sec.includes('gov') || sec.includes('aicte') || sec.includes('bank');
      if (selectedSector === 'private') return sec.includes('priv') || sec.includes('corp') || sec.includes('deloitte') || sec.includes('google') || sec.includes('microsoft');
      if (selectedSector === 'ngo') return sec.includes('ngo') || sec.includes('foundation') || sec.includes('un');
      return true;
    });
  }

  // 3. Work/Study Mode Filter (Remote vs Hybrid vs On-site)
  if (selectedMode && selectedMode !== 'all') {
    filtered = filtered.filter(o => {
      const m = (o.mode || '').toLowerCase();
      if (selectedMode === 'remote') return m.includes('remote') || m.includes('online');
      if (selectedMode === 'hybrid') return m.includes('hybrid');
      if (selectedMode === 'on-site') return m.includes('on-site') || m.includes('delhi') || m.includes('mumbai');
      return true;
    });
  }

  // 4. Stream / Discipline Filter (Technical vs Non-Technical)
  if (selectedStream && selectedStream !== 'all') {
    filtered = filtered.filter(o => {
      const streams = (o.target_streams || []).map(s => s.toLowerCase());
      return streams.includes('all') || streams.includes('any') || streams.includes(selectedStream);
    });
  }

  // 5. Search Query Filter
  if (query) {
    filtered = filtered.filter(o => 
      o.title.toLowerCase().includes(query) ||
      o.provider.toLowerCase().includes(query) ||
      o.summary.toLowerCase().includes(query) ||
      o.category.toLowerCase().includes(query) ||
      (o.sector && o.sector.toLowerCase().includes(query)) ||
      (o.mode && o.mode.toLowerCase().includes(query)) ||
      (o.target_streams && o.target_streams.join(' ').toLowerCase().includes(query))
    );
  }

  // 6. Study Level / Role Match
  if (selectedLevel && selectedLevel !== 'all') {
    filtered = filtered.filter(o => {
      const levels = (o.target_levels || []).map(l => l.toLowerCase());
      const roles = (o.target_roles || []).map(r => r.toLowerCase());

      if (selectedLevel === 'professional') return roles.includes('professional') || levels.includes('professional');
      if (selectedLevel === 'entrepreneur') return roles.includes('entrepreneur') || levels.includes('entrepreneur');
      if (selectedLevel === 'fresh-grad') return roles.includes('fresh-grad') || levels.includes('fresh-grad');
      return levels.includes(selectedLevel) || levels.includes('undergrad') || levels.includes('all');
    });
  }

  // 7. Update count badges
  if (matchCountEl) {
    matchCountEl.textContent = `Matching with ${filtered.length} opportunity${filtered.length === 1 ? '' : 'ies'}`;
  }

  const allCountEl = document.getElementById('count-all');
  if (allCountEl) allCountEl.textContent = allOpportunities.length;

  // Render cards
  if (filtered.length === 0) {
    if (grid) grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  if (grid) {
    grid.innerHTML = filtered.map(opp => createOpportunityCardHtml(opp)).join('');
    attachOpportunityCardEvents();
  }
}

function createOpportunityCardHtml(opp) {
  const isBookmarked = StorageManager.isBookmarked(opp.id);
  const isUrgent = (opp.days_left || 30) <= 10;
  
  // Category styling
  const catLower = opp.category.toLowerCase();
  let catClass = 'badge-cat-scholarship';
  if (catLower.includes('internship')) catClass = 'badge-cat-internship';
  else if (catLower.includes('competition')) catClass = 'badge-cat-competition';
  else if (catLower.includes('course')) catClass = 'badge-cat-course';
  else if (catLower.includes('fellowship') || catLower.includes('job')) catClass = 'badge-cat-fellowship';
  else if (catLower.includes('entrepreneur')) catClass = 'badge-cat-entrepreneurship';

  // Sector styling
  const secLower = (opp.sector || '').toLowerCase();
  let sectorClass = 'badge-sector-private';
  let sectorIcon = '🏢';
  if (secLower.includes('gov') || secLower.includes('aicte') || secLower.includes('bank')) {
    sectorClass = 'badge-sector-govt';
    sectorIcon = '🏛️';
  } else if (secLower.includes('ngo') || secLower.includes('foundation') || secLower.includes('un')) {
    sectorClass = 'badge-sector-ngo';
    sectorIcon = '🤝';
  }

  // Work Mode styling
  const modeText = opp.mode || 'Online';
  const modeIcon = modeText.toLowerCase().includes('remote') ? '🌐' : (modeText.toLowerCase().includes('hybrid') ? '🔄' : '📍');

  // Compensation / Funding
  const fundingText = opp.funding_type || opp.award_summary;

  // Criteria preview
  const criteriaPreview = (opp.eligibility_criteria || []).slice(0, 2).map(c => `<li>${c.simple_en}</li>`).join('');

  return `
    <article class="opp-card" data-opp-id="${opp.id}">
      <header class="opp-card-header">
        <div class="opp-badge-group">
          <span class="badge-opp-category ${catClass}">${opp.category}</span>
          <span class="badge badge-sector ${sectorClass}">${sectorIcon} ${opp.sector || 'Opportunity'}</span>
          <span class="badge badge-mode">${modeIcon} ${modeText}</span>
          <span class="badge-verified-demo">Verified Demo Data</span>
        </div>
        <span class="opp-deadline-tag ${isUrgent ? 'urgent' : ''}">
          ${isUrgent ? '⏰' : '📅'} ${opp.days_left || '30'} days left
        </span>
      </header>

      <h3 class="opp-title">${opp.title}</h3>
      <div class="opp-provider">By ${opp.provider}</div>

      <div class="opp-award-highlight">
        🏆 ${opp.award_summary}
      </div>

      <div style="margin-bottom: 12px;">
        <span class="badge badge-funding">💰 ${fundingText}</span>
      </div>

      <p class="opp-summary">${opp.summary}</p>

      <div class="opp-criteria-preview">
        <div class="opp-criteria-title">Eligibility Highlights:</div>
        <ul class="opp-criteria-list">
          ${criteriaPreview}
        </ul>
      </div>

      <div class="opp-actions">
        <button class="btn-solve-barriers" data-action="open-engine">
          <span>💡 Solve Barriers &amp; Action Plan</span>
        </button>

        <div class="opp-secondary-actions">
          <a href="${opp.official_url}" target="_blank" rel="noopener noreferrer" class="btn-card-secondary">
            <span>Official Portal ↗</span>
          </a>
          <button class="btn-card-secondary" data-action="ask-ai">
            <span>💬 AI Explain</span>
          </button>
          <button class="btn-bookmark-star ${isBookmarked ? 'bookmarked' : ''}" data-action="toggle-bookmark" title="Save Opportunity" aria-label="Bookmark this opportunity">
            ${isBookmarked ? '★' : '☆'}
          </button>
        </div>
      </div>
    </article>
  `;
}

function attachOpportunityCardEvents() {
  document.querySelectorAll('.opp-card').forEach(card => {
    const oppId = card.getAttribute('data-opp-id');
    const opp = allOpportunities.find(o => o.id === oppId);
    if (!opp) return;

    // Primary: Solve Barriers Button
    const engineBtn = card.querySelector('[data-action="open-engine"]');
    if (engineBtn) {
      engineBtn.addEventListener('click', () => {
        BarrierEngine.openEngineForOpportunity(opp);
      });
    }

    // Secondary: AI Explain Button
    const aiBtn = card.querySelector('[data-action="ask-ai"]');
    if (aiBtn) {
      aiBtn.addEventListener('click', () => {
        AIAssistant.openForOpportunity(opp);
        AIAssistant.submitQuery(`Explain the key eligibility rules for ${opp.title} in simple terms.`);
      });
    }

    // Secondary: Bookmark Star
    const starBtn = card.querySelector('[data-action="toggle-bookmark"]');
    if (starBtn) {
      starBtn.addEventListener('click', () => {
        const bookmarked = StorageManager.toggleBookmark(oppId);
        starBtn.classList.toggle('bookmarked', bookmarked);
        starBtn.innerHTML = bookmarked ? '★' : '☆';
        showToast(bookmarked ? `Saved "${opp.title}" to bookmarks` : `Removed from bookmarks`);
      });
    }
  });
}

function updateCategoryTabsActive(cat) {
  document.querySelectorAll('.cat-tab').forEach(tab => {
    const isTarget = tab.getAttribute('data-category').toLowerCase() === cat.toLowerCase();
    tab.classList.toggle('active', isTarget);
    tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });
}

/**
 * Navigation, Search, and Modal setup
 */
function initModalsAndNavigation() {
  // Category tabs click
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentCategory = tab.getAttribute('data-category');
      updateCategoryTabsActive(currentCategory);
      filterAndRenderOpportunities();
    });
  });

  // Search input with debounce
  const searchInput = document.getElementById('opportunity-search');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
      }
      filterAndRenderOpportunities();
    });
  }
  if (clearSearchBtn && searchInput) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      filterAndRenderOpportunities();
      searchInput.focus();
    });
  }

  // Reset filters button
  const resetBtn = document.getElementById('reset-filters-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentCategory = 'all';
      if (searchInput) searchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.style.display = 'none';
      updateCategoryTabsActive('all');
      const levelSelect = document.getElementById('study-level-select');
      const interestSelect = document.getElementById('interest-select');
      if (levelSelect) levelSelect.value = 'all';
      if (interestSelect) interestSelect.value = 'all';
      filterAndRenderOpportunities();
    });
  }

  // Header AI Assistant Button
  const headerAiBtn = document.getElementById('open-ai-chat-btn');
  if (headerAiBtn) {
    headerAiBtn.addEventListener('click', () => {
      // Pick first opportunity as default context if none selected
      const defaultOpp = BarrierEngine.currentOpportunity || allOpportunities[0] || null;
      AIAssistant.openForOpportunity(defaultOpp);
    });
  }

  // Header Saved Plans Button
  const navSavedBtn = document.getElementById('nav-saved-btn');
  const savedModal = document.getElementById('saved-plans-modal');
  const closeSavedBtn = document.getElementById('close-saved-modal-btn');

  if (navSavedBtn && savedModal) {
    navSavedBtn.addEventListener('click', () => {
      renderSavedPlansModal();
      savedModal.showModal();
    });
  }
  if (closeSavedBtn && savedModal) {
    closeSavedBtn.addEventListener('click', () => savedModal.close());
  }

  // Barrier Engine Modal Close & Action Buttons
  const engineModal = document.getElementById('barrier-engine-modal');
  const closeEngineBtn = document.getElementById('close-engine-modal-btn');
  const switchBarrierBtn = document.getElementById('switch-barrier-btn');
  const savePlanBtn = document.getElementById('save-current-plan-btn');
  const askAiFromPlanBtn = document.getElementById('ask-ai-from-plan-btn');

  if (closeEngineBtn && engineModal) {
    closeEngineBtn.addEventListener('click', () => engineModal.close());
  }

  if (switchBarrierBtn) {
    switchBarrierBtn.addEventListener('click', () => {
      BarrierEngine.showSelectionView();
    });
  }

  if (savePlanBtn) {
    savePlanBtn.addEventListener('click', () => {
      if (BarrierEngine.currentOpportunity && BarrierEngine.currentPlan) {
        StorageManager.savePlan(BarrierEngine.currentOpportunity.id, BarrierEngine.currentPlan);
        showToast('✓ Progress saved successfully to your device!');
      }
    });
  }

  if (askAiFromPlanBtn) {
    askAiFromPlanBtn.addEventListener('click', () => {
      if (BarrierEngine.currentOpportunity) {
        AIAssistant.openForOpportunity(BarrierEngine.currentOpportunity);
      }
    });
  }

  // Barrier Selection Cards click inside modal
  const barrierCards = document.querySelectorAll('.barrier-select-option');
  barrierCards.forEach(card => {
    card.addEventListener('click', () => {
      const bId = card.getAttribute('data-barrier-id');
      BarrierEngine.generateAndRenderPlan(bId);
    });
    // Keyboard support (Enter/Space)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const bId = card.getAttribute('data-barrier-id');
        BarrierEngine.generateAndRenderPlan(bId);
      }
    });
  });

  // Showcase section barrier cards (on homepage)
  document.querySelectorAll('.barrier-card').forEach(card => {
    card.addEventListener('click', () => {
      const bId = card.getAttribute('data-barrier');
      const targetOpp = allOpportunities[0] || null;
      if (targetOpp) {
        BarrierEngine.openEngineForOpportunity(targetOpp, bId);
      }
    });
  });

  // Close modals on backdrop click
  [engineModal, savedModal, document.getElementById('ai-assistant-modal'), document.getElementById('demo-tour-modal')].forEach(m => {
    if (m) {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.close();
      });
    }
  });
}

/**
 * Render Saved Plans List inside the Saved Plans Modal
 */
function renderSavedPlansModal() {
  const listEl = document.getElementById('saved-plans-list');
  const emptyEl = document.getElementById('empty-saved-state');
  const plans = StorageManager.getSavedPlans();
  const planKeys = Object.keys(plans);

  StorageManager.updateBadgesAndStats();

  if (!listEl) return;

  if (planKeys.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = planKeys.map(oppId => {
    const p = plans[oppId];
    const opp = allOpportunities.find(o => o.id === oppId);
    const oppTitle = p.opportunity_title || (opp ? opp.title : 'Saved Opportunity');
    const barrierName = p.barrier_title || 'Action Plan';
    const barrierIcon = p.barrier_icon || '📋';

    // Count progress
    let total = 0;
    let completed = 0;
    if (p.criteria_checklist) {
      total += p.criteria_checklist.length;
      completed += p.criteria_checklist.filter(c => c.state === 'met').length;
    }
    if (p.documents_checklist) {
      total += p.documents_checklist.length;
      completed += p.documents_checklist.filter(d => d.completed || d.status === 'ready').length;
    }
    if (p.action_tasks) {
      total += p.action_tasks.length;
      completed += p.action_tasks.filter(t => t.completed).length;
    }
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return `
      <div class="saved-plan-item" data-opp-id="${oppId}">
        <div class="saved-plan-info">
          <h4>${oppTitle}</h4>
          <div style="font-size: 0.82rem; color: var(--teal-primary); font-weight: 700;">
            ${barrierIcon} Barrier: ${barrierName}
          </div>
          <div style="margin-top: 6px; font-size: 0.8rem; color: var(--text-muted);">
            Progress: ${completed} / ${total} tasks (${percent}%)
          </div>
          <div class="progress-bar-track" style="margin-top: 6px; height: 6px;">
            <div class="progress-bar-fill" style="width: ${percent}%;"></div>
          </div>
        </div>

        <div class="saved-plan-actions">
          <button class="btn btn-teal btn-sm" data-action="resume-plan">Resume &rarr;</button>
          <button class="btn btn-outline-navy btn-sm" data-action="delete-plan" style="color: #ef4444; border-color: #fca5a5;">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach handlers
  listEl.querySelectorAll('.saved-plan-item').forEach(item => {
    const oppId = item.getAttribute('data-opp-id');
    const opp = allOpportunities.find(o => o.id === oppId) || { id: oppId, title: "Saved Opportunity" };

    const resumeBtn = item.querySelector('[data-action="resume-plan"]');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        const savedModal = document.getElementById('saved-plans-modal');
        if (savedModal) savedModal.close();
        BarrierEngine.openEngineForOpportunity(opp);
      });
    }

    const delBtn = item.querySelector('[data-action="delete-plan"]');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this saved plan?')) {
          StorageManager.deletePlan(oppId);
          renderSavedPlansModal();
          showToast('Plan deleted.');
        }
      });
    }
  });
}

/**
 * ============================================================
 * Guided Demo Journey (Fulfilling prompt's exact Demo Journey):
 * 1. Opens an opportunity ("Reliance Foundation Undergraduate Scholarship")
 * 2. Selects "Eligibility is confusing"
 * 3. Shows interactive checklist, toggles criteria to Met, saves progress
 * 4. Switches barrier to "Limited internet" -> Shows offline pack & cyber-café plan!
 * ============================================================
 */
function initGuidedDemoJourney() {
  const tourModal = document.getElementById('demo-tour-modal');
  const launchBtn = document.getElementById('demo-tour-btn');
  const heroBtn = document.getElementById('hero-demo-journey-btn');
  const closeBtn = document.getElementById('close-tour-modal-btn');
  const step2Btn = document.getElementById('tour-to-step-2-btn');

  function openTour() {
    if (tourModal && typeof tourModal.showModal === 'function') {
      tourModal.showModal();
    }
  }

  if (launchBtn) launchBtn.addEventListener('click', openTour);
  if (heroBtn) heroBtn.addEventListener('click', openTour);
  if (closeBtn && tourModal) closeBtn.addEventListener('click', () => tourModal.close());

  // Step 2 Button: Selects Opportunity & Chooses "Eligibility is confusing"
  if (step2Btn) {
    step2Btn.addEventListener('click', async () => {
      if (tourModal) tourModal.close();

      const targetOpp = allOpportunities.find(o => o.id === 'reliance-ug-scholarship') || allOpportunities[0];
      if (!targetOpp) return;

      // 1. Open engine for this opportunity with 'confusing_eligibility'
      await BarrierEngine.openEngineForOpportunity(targetOpp, 'confusing_eligibility');
      showToast('🚀 Demo Step: Loaded "Eligibility is Confusing" Action Plan!');

      // Simulate checking off conditions after a short delay to showcase interactive logic
      setTimeout(() => {
        const metButtons = document.querySelectorAll('.criteria-item-card .crit-btn[data-state="met"]');
        if (metButtons.length > 0) {
          metButtons[0].click(); // Check condition 1
          if (metButtons.length > 1) metButtons[1].click(); // Check condition 2
          showToast('✓ Criteria verified as [Met]! Watch the eligibility score recalculate.');
        }
      }, 900);

      // Offer quick switch to "Limited Internet"
      setTimeout(() => {
        showToast('💡 Now click "🔄 Switch Barrier" or select "Limited internet" to see the offline plan!');
      }, 2500);
    });
  }
}
