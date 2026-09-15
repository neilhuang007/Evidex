// main.js - Application entry point

import {hexToRgba} from './utils.js';
import {EditingPanel} from './EditingPanel.js';
import {OnboardingTutorial} from './OnboardingTutorial.js';
import {EvaluationService} from './EvaluationService.js';
import {WhatsNewTutorial} from './WhatsNewTutorial.js';
import {CardCutterApp} from './CardCutterApp.js';

// Make hexToRgba globally available for backwards compatibility
window.hexToRgba = hexToRgba;

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.cardCutterApp) return;

    // Initialize main app
    const app = new CardCutterApp();
    app.loadCards();
    app.renderCuts();

    // Make app available globally for color persistence
    window.cardCutterApp = app;

    // Initialize editing panel globally
    window.editingPanel = new EditingPanel();

    // Only one tutorial may auto-start in a page lifecycle. New users see
    // onboarding first; the versioned What's New tour is eligible next load.
    window.onboarding = new OnboardingTutorial();
    const onboardingEligible = window.onboarding.isEligible();
    window.onboarding.init();

    // Initialize What's New tutorial for recent features
    window.whatsNewTutorial = new WhatsNewTutorial(app, {
        autoStart: !onboardingEligible
    });

    // Make EvaluationService available globally
    window.EvaluationService = EvaluationService;

    // Add utility to reset onboarding for testing (can be called from console)
    window.resetOnboarding = () => {
        try {
            localStorage.removeItem('evidex_onboarding_completed');
        } catch {
            // Replay still works in storage-restricted browsing contexts.
        }
        window.onboarding.start({force: true});
    };

    window.replayOnboarding = () => window.onboarding.start({force: true});
});
