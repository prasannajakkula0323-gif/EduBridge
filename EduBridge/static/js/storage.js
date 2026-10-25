/**
 * EduBridge AI — Local Storage & Progress Persistence Manager
 * Ensures 100% privacy: all student data stays local to the user's browser.
 */

const STORAGE_KEYS = {
  PROFILE: 'edubridge_student_profile',
  PLANS: 'edubridge_saved_plans',
  BOOKMARKS: 'edubridge_bookmarked_opps'
};

const StorageManager = {
  // --- Profile Methods ---
  getProfile() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
      return data ? JSON.parse(data) : {
        studyLevel: '1st-year',
        stream: 'all',
        interest: 'all',
        oppType: 'all',
        skills: ['writing', 'finance', 'problem-solving']
      };
    } catch (e) {
      console.warn('[StorageManager] Error reading profile:', e);
      return {
        studyLevel: '1st-year',
        stream: 'all',
        interest: 'all',
        oppType: 'all',
        skills: ['writing', 'finance', 'problem-solving']
      };
    }
  },

  saveProfile(profile) {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
      return true;
    } catch (e) {
      console.error('[StorageManager] Failed to save profile:', e);
      return false;
    }
  },

  // --- Plans Methods ---
  getSavedPlans() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PLANS);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('[StorageManager] Error reading plans:', e);
      return {};
    }
  },

  getSavedPlan(oppId) {
    const plans = this.getSavedPlans();
    return plans[oppId] || null;
  },

  savePlan(oppId, plan) {
    try {
      const plans = this.getSavedPlans();
      plan.updated_at = new Date().toISOString();
      plans[oppId] = plan;
      localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));
      this.updateBadgesAndStats();
      return true;
    } catch (e) {
      console.error('[StorageManager] Failed to save plan:', e);
      return false;
    }
  },

  deletePlan(oppId) {
    try {
      const plans = this.getSavedPlans();
      if (plans[oppId]) {
        delete plans[oppId];
        localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));
        this.updateBadgesAndStats();
      }
      return true;
    } catch (e) {
      console.error('[StorageManager] Failed to delete plan:', e);
      return false;
    }
  },

  // --- Bookmarks Methods ---
  getBookmarks() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('[StorageManager] Error reading bookmarks:', e);
      return [];
    }
  },

  toggleBookmark(oppId) {
    const bookmarks = this.getBookmarks();
    const index = bookmarks.indexOf(oppId);
    let isBookmarked = false;

    if (index > -1) {
      bookmarks.splice(index, 1);
      isBookmarked = false;
    } else {
      bookmarks.push(oppId);
      isBookmarked = true;
    }

    localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(bookmarks));
    return isBookmarked;
  },

  isBookmarked(oppId) {
    const bookmarks = this.getBookmarks();
    return bookmarks.includes(oppId);
  },

  // --- Aggregated Stats ---
  getOverallStats() {
    const plans = this.getSavedPlans();
    const planKeys = Object.keys(plans);
    let totalTasks = 0;
    let completedTasks = 0;

    planKeys.forEach(key => {
      const p = plans[key];
      // Criteria checklist items
      if (p.criteria_checklist && Array.isArray(p.criteria_checklist)) {
        totalTasks += p.criteria_checklist.length;
        completedTasks += p.criteria_checklist.filter(c => c.state === 'met').length;
      }
      // Documents checklist items
      if (p.documents_checklist && Array.isArray(p.documents_checklist)) {
        totalTasks += p.documents_checklist.length;
        completedTasks += p.documents_checklist.filter(d => d.completed || d.status === 'ready').length;
      }
      // Action tasks
      if (p.action_tasks && Array.isArray(p.action_tasks)) {
        totalTasks += p.action_tasks.length;
        completedTasks += p.action_tasks.filter(t => t.completed).length;
      }
    });

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      totalPlans: planKeys.length,
      totalTasks,
      completedTasks,
      completionRate
    };
  },

  updateBadgesAndStats() {
    const stats = this.getOverallStats();
    
    // Header badge
    const badge = document.getElementById('saved-plans-badge');
    if (badge) {
      badge.textContent = stats.totalPlans;
      badge.style.display = stats.totalPlans > 0 ? 'inline-block' : 'none';
    }

    // Modal metrics
    const totalCountEl = document.getElementById('total-saved-count');
    const tasksCountEl = document.getElementById('total-tasks-completed-count');
    const rateEl = document.getElementById('overall-completion-rate');

    if (totalCountEl) totalCountEl.textContent = stats.totalPlans;
    if (tasksCountEl) tasksCountEl.textContent = stats.completedTasks;
    if (rateEl) rateEl.textContent = `${stats.completionRate}%`;
  }
};

// Initialize badges on load
document.addEventListener('DOMContentLoaded', () => {
  StorageManager.updateBadgesAndStats();
});
