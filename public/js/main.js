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
    // Initialize main app
    const app = new CardCutterApp();
    app.loadCards();
    app.renderCuts();

    // Make app available globally for color persistence
    window.cardCutterApp = app;

    // Initialize editing panel globally
    window.editingPanel = new EditingPanel();

    // Initialize onboarding tutorial (but don't start it yet)
    window.onboarding = new OnboardingTutorial();

    // Initialize What's New tutorial for recent features
    window.whatsNewTutorial = new WhatsNewTutorial(app);

    // Make EvaluationService available globally
    window.EvaluationService = EvaluationService;

    // Add utility to reset onboarding for testing (can be called from console)
    window.resetOnboarding = () => {
        localStorage.removeItem('evidex_onboarding_completed');
        window.onboarding.start();
    };
});
