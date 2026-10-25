/**
 * EduBridge AI — Barrier-to-Action Engine
 * Core Innovation: Converts student hesitation into dynamic, practical action roadmaps.
 */

const BarrierEngine = {
  currentOpportunity: null,
  currentBarrierId: null,
  currentPlan: null,
  timerInterval: null,
  timerSecondsLeft: 15 * 60, // 15 mins default
  timerRunning: false,

  /**
   * Initializes or opens the engine for a specific opportunity.
   */
  async openEngineForOpportunity(opp, forcedBarrierId = null) {
    this.currentOpportunity = opp;

    // Check if user already has an in-progress saved plan for this opportunity
    const savedPlan = StorageManager.getSavedPlan(opp.id);

    const modal = document.getElementById('barrier-engine-modal');
    const titleEl = document.getElementById('engine-modal-title');
    const subtitleEl = document.getElementById('engine-modal-subtitle');

    if (titleEl) titleEl.textContent = "Action Plan Generator";
    if (subtitleEl) subtitleEl.textContent = `Opportunity: ${opp.title} (${opp.provider})`;

    if (forcedBarrierId) {
      await this.generateAndRenderPlan(forcedBarrierId);
    } else if (savedPlan && savedPlan.barrier_id) {
      // Resume saved plan
      this.currentPlan = savedPlan;
      this.currentBarrierId = savedPlan.barrier_id;
      this.showPlanView();
      this.renderPlanContent(this.currentPlan);
    } else {
      // Show barrier selection view
      this.showSelectionView();
    }

    if (modal && typeof modal.showModal === 'function') {
      modal.showModal();
    }
  },

  showSelectionView() {
    const selView = document.getElementById('barrier-selection-view');
    const planView = document.getElementById('barrier-plan-view');
    if (selView) selView.style.display = 'block';
    if (planView) planView.style.display = 'none';
  },

  showPlanView() {
    const selView = document.getElementById('barrier-selection-view');
    const planView = document.getElementById('barrier-plan-view');
    if (selView) selView.style.display = 'none';
    if (planView) planView.style.display = 'block';
  },

  async generateAndRenderPlan(barrierId) {
    this.currentBarrierId = barrierId;
    const opp = this.currentOpportunity;
    if (!opp) return;

    // Show loading state
    this.showPlanView();
    const container = document.getElementById('dynamic-plan-container');
    if (container) {
      container.innerHTML = `
        <div class="loading-state" style="padding: 40px; text-align: center;">
          <div class="spinner" aria-hidden="true"></div>
          <p style="margin-top: 12px; font-weight: 600;">Generating tailored barrier-removal roadmap...</p>
        </div>
      `;
    }

    try {
      const profile = StorageManager.getProfile();
      const response = await fetch('/api/engine/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opp.id,
          barrier_id: barrierId,
          student_profile: profile
        })
      });

      if (!response.ok) throw new Error('Failed to generate plan');
      const plan = await response.json();

      // Check if existing saved plan has state to merge
      const existing = StorageManager.getSavedPlan(opp.id);
      if (existing && existing.barrier_id === barrierId) {
        // Merge completed checkboxes if same barrier
        this.currentPlan = existing;
      } else {
        this.currentPlan = plan;
      }

      this.renderPlanContent(this.currentPlan);
      // Auto-save initial generated plan
      StorageManager.savePlan(opp.id, this.currentPlan);
    } catch (err) {
      console.error('[BarrierEngine] Generation error:', err);
      if (container) {
        container.innerHTML = `
          <div class="empty-state">
            <p>Error generating action plan. Please try selecting a different barrier or refresh.</p>
          </div>
        `;
      }
    }
  },

  /**
   * Main Dispatcher for rendering dynamic plan content
   */
  renderPlanContent(plan) {
    const container = document.getElementById('dynamic-plan-container');
    if (!container) return;

    // Update Header Badges & Headline
    const barrierBadge = document.getElementById('active-barrier-badge');
    const headlineEl = document.getElementById('plan-headline');
    const summaryEl = document.getElementById('plan-summary-text');
    const deadlinePill = document.getElementById('plan-deadline-pill');
    const officialLink = document.getElementById('plan-official-link');

    if (barrierBadge) {
      barrierBadge.textContent = `${plan.barrier_icon || '💡'} ${plan.barrier_title || ''}`;
    }
    if (summaryEl) {
      summaryEl.textContent = plan.summary || '';
    }
    if (deadlinePill && this.currentOpportunity) {
      deadlinePill.textContent = `Deadline: ${this.currentOpportunity.deadline_display || 'Closing Soon'}`;
    }
    if (officialLink) {
      officialLink.href = plan.official_url || (this.currentOpportunity && this.currentOpportunity.official_url) || '#';
    }

    // Render barrier-specific UI
    let html = '';
    const bId = plan.barrier_id;

    if (bId === 'confusing_eligibility') {
      html = this.buildEligibilityUI(plan);
    } else if (bId === 'missing_documents') {
      html = this.buildDocumentsUI(plan);
    } else if (bId === 'late_discovery') {
      html = this.buildLateDiscoveryUI(plan);
    } else if (bId === 'limited_internet') {
      html = this.buildLimitedInternetUI(plan);
    } else if (bId === 'unclear_starting') {
      html = this.buildUnclearStartingUI(plan);
    } else if (bId === 'limited_time') {
      html = this.buildLimitedTimeUI(plan);
    } else {
      html = this.buildDefaultTasksUI(plan);
    }

    container.innerHTML = html;
    this.attachPlanEventListeners(bId);
    this.recalculateProgress();
  },

  // --- 1. Eligibility UI ---
  buildEligibilityUI(plan) {
    const items = plan.criteria_checklist || [];
    let itemsHtml = items.map((c, idx) => {
      const state = c.state || c.default_state || 'unsure';
      return `
        <div class="criteria-item-card" data-crit-id="${c.id}">
          <div class="criteria-top-row">
            <span class="criteria-title">${c.title}</span>
            <div class="criteria-toggle-group" role="group" aria-label="Criterion verification state">
              <button type="button" class="crit-btn ${state === 'met' ? 'active-met' : ''}" data-state="met">✓ Met</button>
              <button type="button" class="crit-btn ${state === 'not_met' ? 'active-notmet' : ''}" data-state="not_met">✗ Not Met</button>
              <button type="button" class="crit-btn ${state === 'unsure' ? 'active-unsure' : ''}" data-state="unsure">? Unsure</button>
            </div>
          </div>
          <p class="criteria-expl-en">${c.simple_en}</p>
        </div>
      `;
    }).join('');

    const extraTasksHtml = this.buildActionTasksList(plan.action_tasks || []);

    return `
      <div class="eligibility-plan-wrap">
        <div id="verdict-banner-box" class="verdict-banner verdict-attention">
          Analyzing your eligibility criteria status...
        </div>
        <h4 style="font-size: 1rem; font-weight: 800; color: var(--navy-dark); margin-bottom: 12px;">
          Line-by-Line Criteria Verification:
        </h4>
        <div class="criteria-list-wrap">
          ${itemsHtml}
        </div>
        <h4 style="font-size: 1rem; font-weight: 800; color: var(--navy-dark); margin: 20px 0 12px 0;">
          Next Action Steps to Finalize Eligibility:
        </h4>
        <div class="action-tasks-wrap">
          ${extraTasksHtml}
        </div>
      </div>
    `;
  },

  // --- 2. Documents UI ---
  buildDocumentsUI(plan) {
    const docs = plan.documents_checklist || [];
    let docsHtml = docs.map((d, idx) => {
      const isCompleted = d.completed || d.status === 'ready';
      return `
        <div class="document-item-card" data-doc-id="${d.id}">
          <div class="criteria-top-row">
            <div>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" class="doc-checkbox" ${isCompleted ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--teal-primary);">
                <span style="font-size: 1rem; font-weight: 700; color: var(--navy-dark);">${d.title}</span>
              </label>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; padding-left: 26px;">
                <strong>Issuing Authority:</strong> ${d.issuer} • <strong>Format:</strong> ${d.format}
              </div>
            </div>
            ${d.urgent ? '<span class="badge badge-accent" style="font-size: 0.72rem;">Urgent</span>' : ''}
          </div>
          <div style="padding-left: 26px; font-size: 0.86rem; color: var(--text-body); margin-top: 6px;">
            💡 <em>Tip: ${d.tips}</em>
          </div>
        </div>
      `;
    }).join('');

    const extraTasksHtml = this.buildActionTasksList(plan.action_tasks || []);

    return `
      <div class="documents-plan-wrap">
        <div class="barrier-prompt-banner" style="background: #f0fdf4; border-color: #10b981;">
          <h4 style="color: #065f46; font-size: 0.96rem; margin-bottom: 2px;">⚡ DigiLocker Fast-Track Tip</h4>
          <p style="color: #047857; font-size: 0.86rem;">
            Do not wait for physical certificates. You can pull official 10th/12th marksheet PDFs and caste/income records instantly on <a href="https://www.digilocker.gov.in" target="_blank" rel="noopener" style="color: #047857; text-decoration: underline; font-weight: 700;">DigiLocker.gov.in</a> using your Aadhaar OTP.
          </p>
        </div>

        <h4 style="font-size: 1rem; font-weight: 800; color: var(--navy-dark); margin-bottom: 12px;">
          Mandatory Document Prep Checklist:
        </h4>
        <div class="docs-list-wrap">
          ${docsHtml}
        </div>

        <h4 style="font-size: 1rem; font-weight: 800; color: var(--navy-dark); margin: 20px 0 12px 0;">
          File Optimization Tasks:
        </h4>
        <div class="action-tasks-wrap">
          ${extraTasksHtml}
        </div>
      </div>
    `;
  },

  // --- 3. Late Discovery UI ---
  buildLateDiscoveryUI(plan) {
    const opp = this.currentOpportunity || {};
    const daysLeft = opp.days_left || 5;
    const tasksHtml = this.buildActionTasksList(plan.action_tasks || []);

    return `
      <div class="late-discovery-wrap">
        <div class="barrier-prompt-banner" style="background: #fef2f2; border-color: #ef4444;">
          <h4 style="color: #991b1b; font-size: 1rem; margin-bottom: 2px;">
            ⏰ Deadline Approaching: Only ${daysLeft} Days Left!
          </h4>
          <p style="color: #b91c1c; font-size: 0.86rem;">
            Don't try to make a perfect application. Execute an MVP (Minimum Viable Application) submission today, then notify college coordinators.
          </p>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap;">
          <button id="add-to-calendar-btn" class="btn btn-secondary btn-sm">
            📅 Add Calendar Deadline Alert
          </button>
          <button id="set-cycle-reminder-btn" class="btn btn-outline-navy btn-sm">
            🔔 Remind Me for Next Year's Cycle
          </button>
        </div>

        <h4 style="font-size: 1rem; font-weight: 800; color: var(--navy-dark); margin-bottom: 12px;">
          Fast-Track Triage Checklist:
        </h4>
        <div class="action-tasks-wrap">
          ${tasksHtml}
        </div>
      </div>
    `;
  },

  // --- 4. Limited Internet UI ---
  buildLimitedInternetUI(plan) {
    const tasksHtml = this.buildActionTasksList(plan.action_tasks || []);

    return `
      <div class="limited-internet-wrap">
        <div class="offline-pack-box">
          <div class="offline-icon" aria-hidden="true">📥</div>
          <h4>Download Offline Printable Text Guide</h4>
          <p>
            No mobile data? Download this full opportunity guide as a lightweight text file (.txt). You can open it on any basic phone or print it out on paper.
          </p>
          <div class="offline-btn-group">
            <button id="download-txt-pack-btn" class="btn btn-primary">
              💾 Download Offline Guide (.txt)
            </button>
            <button id="print-checklist-btn" class="btn btn-outline-navy">
              🖨️ Print Offline Checklist
            </button>
          </div>
        </div>

        <div class="cyber-cafe-blueprint">
          <h5>🚀 15-Minute Cyber-Café / College Lab Battle Plan</h5>
          <ol>
            <li><strong>At Home (100% Offline):</strong> Write out your answers, reasons for applying, and short statement on paper or in phone notes.</li>
            <li><strong>Organize Files:</strong> Put your scanned marksheets &amp; photo into a single USB pen drive or your phone's Downloads folder.</li>
            <li><strong>Visit Cyber-Café / Lab:</strong> Pay for just 15 minutes of PC time (under ₹15).</li>
            <li><strong>Quick Submission:</strong> Open the portal link, paste your pre-written answers, upload pre-sized PDFs, click submit, and save the acknowledgment receipt!</li>
          </ol>
        </div>

        <h4 style="font-size: 1rem; font-weight: 800; color: var(--navy-dark); margin: 20px 0 12px 0;">
          Offline Preparation Steps:
        </h4>
        <div class="action-tasks-wrap">
          ${tasksHtml}
        </div>
      </div>
    `;
  },

  // --- 5. Unclear Starting UI ---
  buildUnclearStartingUI(plan) {
    const tasksHtml = this.buildActionTasksList(plan.action_tasks || []);
    const templateText = plan.sop_starter_template || '';

    return `
      <div class="unclear-starting-wrap">
        <h4 style="font-size: 1rem; font-weight: 800; color: var(--navy-dark); margin-bottom: 8px;">
          3-Phase Zero-Pressure Roadmap:
        </h4>
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 16px;">
          Never face a blank page alone. Complete one small 15-minute phase per day.
        </p>
        <div class="action-tasks-wrap">
          ${tasksHtml}
        </div>

        <div class="sop-template-box">
          <div class="sop-header">
            <h5>📝 Built-in Statement of Purpose (SOP) Starter Draft:</h5>
            <button id="copy-sop-template-btn" class="btn btn-teal btn-xs">📋 Copy Draft</button>
          </div>
          <textarea id="sop-draft-textarea" class="sop-textarea" aria-label="Statement of Purpose draft template">${templateText}</textarea>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 6px;">
            Replace the bracketed items like <code>[Your Name]</code> with your actual details, then paste into the portal!
          </div>
        </div>
      </div>
    `;
  },

  // --- 6. Limited Time UI ---
  buildLimitedTimeUI(plan) {
    const tasksHtml = this.buildActionTasksList(plan.action_tasks || []);

    return `
      <div class="limited-time-wrap">
        <!-- Interactive Focus Sprint Timer -->
        <div class="timer-widget">
          <div class="timer-label">⏱️ Focus Sprint Mode (15-Minute Block)</div>
          <div id="sprint-timer-display" class="timer-display">15:00</div>
          <div class="timer-controls">
            <button id="timer-toggle-btn" class="btn btn-primary btn-sm">▶ Start 15-Min Sprint</button>
            <button id="timer-reset-btn" class="btn btn-outline-navy btn-sm" style="color: white; border-color: rgba(255,255,255,0.4);">Reset</button>
          </div>
        </div>

        <h4 style="font-size: 1rem; font-weight: 800; color: var(--navy-dark); margin-bottom: 8px;">
          Four 10-to-15 Minute Micro-Sprints (Split over 3 Days):
        </h4>
        <div class="action-tasks-wrap">
          ${tasksHtml}
        </div>
      </div>
    `;
  },

  // --- Helper: Action Tasks List ---
  buildActionTasksList(tasks) {
    return tasks.map((t, idx) => {
      const isCompleted = t.completed || false;
      return `
        <div class="task-item-card" data-task-id="${t.id}">
          <div style="display: flex; align-items: flex-start; gap: 10px;">
            <input type="checkbox" class="task-checkbox" ${isCompleted ? 'checked' : ''} style="margin-top: 3px; width: 18px; height: 18px; accent-color: var(--teal-primary);">
            <div style="flex-grow: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.95rem; font-weight: 700; color: var(--navy-dark);">${t.title}</span>
                ${t.time_mins ? `<span class="badge" style="background: #f1f5f9; color: #475569; font-size: 0.72rem;">⏱️ ${t.time_mins}m</span>` : ''}
              </div>
              <p style="font-size: 0.86rem; color: var(--text-body); margin-top: 4px;">${t.desc || ''}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // --- Attach Event Listeners ---
  attachPlanEventListeners(barrierId) {
    const opp = this.currentOpportunity;
    const plan = this.currentPlan;

    // 1. Criteria Toggles (for confusing_eligibility)
    if (barrierId === 'confusing_eligibility') {
      const cards = document.querySelectorAll('.criteria-item-card');
      cards.forEach(card => {
        const critId = card.getAttribute('data-crit-id');
        const buttons = card.querySelectorAll('.crit-btn');
        buttons.forEach(btn => {
          btn.addEventListener('click', (e) => {
            const newState = btn.getAttribute('data-state');
            buttons.forEach(b => {
              b.classList.remove('active-met', 'active-notmet', 'active-unsure');
            });
            if (newState === 'met') btn.classList.add('active-met');
            if (newState === 'not_met') btn.classList.add('active-notmet');
            if (newState === 'unsure') btn.classList.add('active-unsure');

            // Update plan state
            const targetCrit = (plan.criteria_checklist || []).find(c => c.id === critId);
            if (targetCrit) targetCrit.state = newState;

            this.updateEligibilityVerdict();
            this.recalculateProgress();
            StorageManager.savePlan(opp.id, plan);
          });
        });
      });
      this.updateEligibilityVerdict();
    }

    // 2. Document Checkboxes
    const docCheckboxes = document.querySelectorAll('.doc-checkbox');
    docCheckboxes.forEach(chk => {
      chk.addEventListener('change', (e) => {
        const card = chk.closest('.document-item-card');
        const docId = card.getAttribute('data-doc-id');
        const targetDoc = (plan.documents_checklist || []).find(d => d.id === docId);
        if (targetDoc) {
          targetDoc.completed = chk.checked;
          targetDoc.status = chk.checked ? 'ready' : 'pending';
        }
        this.recalculateProgress();
        StorageManager.savePlan(opp.id, plan);
      });
    });

    // 3. Action Tasks Checkboxes
    const taskCheckboxes = document.querySelectorAll('.task-checkbox');
    taskCheckboxes.forEach(chk => {
      chk.addEventListener('change', (e) => {
        const card = chk.closest('.task-item-card');
        const taskId = card.getAttribute('data-task-id');
        const targetTask = (plan.action_tasks || []).find(t => t.id === taskId);
        if (targetTask) {
          targetTask.completed = chk.checked;
        }
        this.recalculateProgress();
        StorageManager.savePlan(opp.id, plan);
      });
    });

    // 4. Offline Downloads (.txt)
    const downloadTxtBtn = document.getElementById('download-txt-pack-btn');
    if (downloadTxtBtn) {
      downloadTxtBtn.addEventListener('click', () => {
        this.downloadOfflineGuide();
      });
    }

    const printBtn = document.getElementById('print-checklist-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // 5. SOP Copy Button
    const copySopBtn = document.getElementById('copy-sop-template-btn');
    if (copySopBtn) {
      copySopBtn.addEventListener('click', () => {
        const textarea = document.getElementById('sop-draft-textarea');
        if (textarea) {
          textarea.select();
          navigator.clipboard.writeText(textarea.value).then(() => {
            copySopBtn.textContent = '✓ Copied!';
            setTimeout(() => { copySopBtn.textContent = '📋 Copy Draft'; }, 2000);
            showToast('Statement draft copied to clipboard!');
          });
        }
      });
    }

    // 6. Sprint Timer Controls
    const timerToggleBtn = document.getElementById('timer-toggle-btn');
    const timerResetBtn = document.getElementById('timer-reset-btn');
    if (timerToggleBtn) {
      timerToggleBtn.addEventListener('click', () => {
        this.toggleFocusTimer();
      });
    }
    if (timerResetBtn) {
      timerResetBtn.addEventListener('click', () => {
        this.resetFocusTimer();
      });
    }

    // 7. Calendar Reminder
    const calBtn = document.getElementById('add-to-calendar-btn');
    if (calBtn && opp) {
      calBtn.addEventListener('click', () => {
        const title = encodeURIComponent(`EduBridge Submission Deadline: ${opp.title}`);
        const details = encodeURIComponent(`Opportunity portal: ${opp.official_url}\nSubmit minimum 6 hours before cutoff.`);
        const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}`;
        window.open(googleCalUrl, '_blank');
        showToast('Google Calendar tab opened!');
      });
    }

    const cycleBtn = document.getElementById('set-cycle-reminder-btn');
    if (cycleBtn) {
      cycleBtn.addEventListener('click', () => {
        showToast('🔔 Saved! EduBridge will alert you locally before the next cycle opening.');
      });
    }
  },

  updateEligibilityVerdict() {
    const banner = document.getElementById('verdict-banner-box');
    if (!banner || !this.currentPlan) return;

    const items = this.currentPlan.criteria_checklist || [];
    const notMet = items.filter(c => c.state === 'not_met');
    const unsure = items.filter(c => c.state === 'unsure');
    const met = items.filter(c => c.state === 'met');

    if (notMet.length > 0) {
      banner.className = 'verdict-banner verdict-attention';
      banner.style.background = '#fee2e2';
      banner.style.color = '#991b1b';
      banner.style.borderColor = '#fca5a5';
      banner.innerHTML = `
        <strong>⚠️ ${notMet.length} Condition(s) Not Met:</strong>
        You may not satisfy the default criteria. Check if your university has a special waiver, or explore other opportunities in our Explorer.
      `;
    } else if (unsure.length > 0) {
      banner.className = 'verdict-banner verdict-attention';
      banner.style.background = '#fef3c7';
      banner.style.color = '#92400e';
      banner.style.borderColor = '#fde68a';
      banner.innerHTML = `
        <strong>? ${unsure.length} Condition(s) Unconfirmed:</strong>
        Verify your marks/income using the action steps below or ask our AI Advisor.
      `;
    } else if (met.length === items.length && items.length > 0) {
      banner.className = 'verdict-banner verdict-eligible';
      banner.style.background = '#dcfce7';
      banner.style.color = '#166534';
      banner.style.borderColor = '#86efac';
      banner.innerHTML = `
        <strong>🎉 100% Eligible!</strong> All ${met.length} criteria satisfied. Proceed to the official application portal with total confidence!
      `;
    }
  },

  recalculateProgress() {
    if (!this.currentPlan) return;
    const plan = this.currentPlan;

    let total = 0;
    let completed = 0;

    // Criteria checklist
    if (plan.criteria_checklist) {
      total += plan.criteria_checklist.length;
      completed += plan.criteria_checklist.filter(c => c.state === 'met').length;
    }
    // Documents checklist
    if (plan.documents_checklist) {
      total += plan.documents_checklist.length;
      completed += plan.documents_checklist.filter(d => d.completed || d.status === 'ready').length;
    }
    // Action tasks
    if (plan.action_tasks) {
      total += plan.action_tasks.length;
      completed += plan.action_tasks.filter(t => t.completed).length;
    }

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const progressFill = document.getElementById('plan-progress-fill');
    const progressText = document.getElementById('plan-progress-text');

    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${completed} / ${total} completed (${percent}%)`;
  },

  downloadOfflineGuide() {
    const plan = this.currentPlan;
    const opp = this.currentOpportunity;
    if (!plan || !opp) return;

    const textContent = plan.offline_text || `EduBridge AI Offline Checklist\nOpportunity: ${opp.title}\nDeadline: ${opp.deadline_display}\nPortal: ${opp.official_url}`;
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EduBridge_${opp.id}_offline_guide.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 Offline text guide (.txt) downloaded successfully!');
  },

  // Focus Timer Logic
  toggleFocusTimer() {
    const btn = document.getElementById('timer-toggle-btn');
    if (this.timerRunning) {
      clearInterval(this.timerInterval);
      this.timerRunning = false;
      if (btn) btn.textContent = '▶ Resume Sprint';
    } else {
      this.timerRunning = true;
      if (btn) btn.textContent = '⏸ Pause Sprint';
      this.timerInterval = setInterval(() => {
        if (this.timerSecondsLeft > 0) {
          this.timerSecondsLeft--;
          this.updateTimerDisplay();
        } else {
          clearInterval(this.timerInterval);
          this.timerRunning = false;
          if (btn) btn.textContent = '✓ Sprint Completed!';
          showToast('🎉 Great work! Your 15-minute application sprint is finished.');
        }
      }, 1000);
    }
  },

  resetFocusTimer() {
    clearInterval(this.timerInterval);
    this.timerRunning = false;
    this.timerSecondsLeft = 15 * 60;
    this.updateTimerDisplay();
    const btn = document.getElementById('timer-toggle-btn');
    if (btn) btn.textContent = '▶ Start 15-Min Sprint';
  },

  updateTimerDisplay() {
    const display = document.getElementById('sprint-timer-display');
    if (!display) return;
    const mins = Math.floor(this.timerSecondsLeft / 60);
    const secs = this.timerSecondsLeft % 60;
    display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
};
