// DynamicOrbs.js - Animated background orbs

export class DynamicOrbs {
    constructor() {
        this.container = document.querySelector('.background-gradient');
        this.colorPalettes = [
            ['#818cf8', '#c084fc'],
            ['#60a5fa', '#34d399'],
            ['#fbbf24', '#fb7185'],
            ['#a78bfa', '#ec4899'],
            ['#f472b6', '#8b5cf6'],
            ['#06b6d4', '#3b82f6'],
            ['#10b981', '#6366f1'],
            ['#f59e0b', '#ef4444'],
            ['#84cc16', '#22d3ee'],
            ['#e879f9', '#7c3aed']
        ];
        this.orbCount = 6;
        this.init();
    }

    init() {
        this.container.innerHTML = '';
        for (let i = 0; i < this.orbCount; i++) {
            this.createOrb(i);
        }
    }

    getRandomValue(min, max) {
        return Math.random() * (max - min) + min;
    }

    createOrb(index) {
        const orb = document.createElement('div');
        orb.className = 'dynamic-orb';

        const size = this.getRandomValue(250, 500);
        const colors = this.colorPalettes[Math.floor(Math.random() * this.colorPalettes.length)];
        const duration = this.getRandomValue(8, 15);
        const delay = this.getRandomValue(0, 5);

        const startX = this.getRandomValue(-20, 100);
        const startY = this.getRandomValue(-20, 100);

        orb.style.width = `${size}px`;
        orb.style.height = `${size}px`;
        orb.style.background = `linear-gradient(${this.getRandomValue(0, 360)}deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
        orb.style.left = `${startX}%`;
        orb.style.top = `${startY}%`;
        orb.style.animationDuration = `${duration}s`;
        orb.style.animationDelay = `${delay}s`;
        orb.style.animationName = `moveOrb${(index % 4) + 1}`;

        this.container.appendChild(orb);
    }
}
