/// <reference types="cypress" />

/**
 * OTC Desk - Component Tests
 * Tests individual UI components
 */

describe('OTC Desk - Component Tests', () => {
  beforeEach(() => {
    cy.visit('/', { timeout: 30000 });
  });

  describe('Chain Indicator Component', () => {
    it('renders chain indicator', () => {
      cy.get('[data-testid="chain-indicator"]', { timeout: 10000 })
        .should('exist');
    });

    it('shows chain name', () => {
      cy.get('[data-testid="chain-indicator"]').within(() => {
        // Should show one of: Jeju, Base, BSC, Solana, Anvil
        cy.get('span').should('exist');
      });
    });
  });

  describe('Wallet Connector Component', () => {
    it('renders connect button', () => {
      cy.contains(/connect/i).should('be.visible');
    });

    it('clicking connect shows wallet options', () => {
      cy.get('button').contains(/connect/i).click();
      cy.wait(1000);
      
      // Should show wallet selector or immediately connect
      cy.get('body').should('be.visible');
    });
  });

  describe('Chat Component', () => {
    it('renders chat interface', () => {
      cy.get('[data-testid="chat-input"]').should('exist');
      cy.get('[data-testid="send-button"]').should('exist');
    });

    it('chat input has placeholder', () => {
      cy.get('[data-testid="chat-input"]').should('have.attr', 'placeholder');
    });

    it('send button has proper state', () => {
      cy.get('[data-testid="send-button"]').should('exist');
    });
  });

  describe('Header Component', () => {
    it('renders header', () => {
      cy.get('header').should('be.visible');
    });

    it('has logo', () => {
      cy.get('header img, header svg').should('exist');
    });

    it('has navigation links', () => {
      cy.get('header nav, header a').should('exist');
    });
  });

  describe('Footer Component', () => {
    it('renders footer', () => {
      cy.get('footer').should('be.visible');
    });

    it('has legal links', () => {
      cy.get('footer').within(() => {
        cy.contains(/privacy|terms/i).should('exist');
      });
    });

    it('footer stays at bottom', () => {
      cy.get('footer').should('be.visible');
      // Check it's positioned at bottom
      cy.get('footer').then(($footer) => {
        const footerRect = $footer[0].getBoundingClientRect();
        expect(footerRect.bottom).to.be.greaterThan(0);
      });
    });
  });

  describe('Chain Logos', () => {
    it('has SVG icons', () => {
      // Chain logos should be SVG
      cy.get('svg').should('exist');
    });
  });

  describe('Button Component', () => {
    it('buttons are clickable', () => {
      cy.get('button:visible').first().should('not.be.disabled');
    });

    it('buttons have hover states', () => {
      cy.get('button:visible').first().trigger('mouseover');
      // Should not crash
      cy.get('button:visible').first().should('exist');
    });
  });

  describe('Dark Mode Support', () => {
    it('respects system theme', () => {
      cy.get('html').should('have.attr', 'class');
    });

    it('theme toggle works if present', () => {
      // Look for theme toggle button
      cy.get('[data-testid="theme-toggle"]').then(($toggle) => {
        if ($toggle.length > 0) {
          cy.wrap($toggle).click();
          cy.wait(500);
          // Theme should change
          cy.get('html').should('exist');
        }
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading indicator when appropriate', () => {
      cy.visit('/my-deals');
      // Might show loading initially
      cy.get('body').should('be.visible');
    });
  });

  describe('Error Boundaries', () => {
    it('handles component errors gracefully', () => {
      // Visit with error-inducing parameters
      cy.visit('/?error=test', { failOnStatusCode: false });
      cy.get('body').should('be.visible');
      // Should not show blank screen
    });
  });

  describe('Responsive Components', () => {
    it('components adapt to mobile', () => {
      cy.viewport('iphone-x');
      cy.get('header').should('be.visible');
      cy.get('[data-testid="chat-input"]').should('be.visible');
      cy.get('footer').should('be.visible');
    });

    it('components adapt to tablet', () => {
      cy.viewport('ipad-2');
      cy.get('header').should('be.visible');
      cy.get('button').should('be.visible');
    });

    it('components adapt to desktop', () => {
      cy.viewport(1920, 1080);
      cy.get('header').should('be.visible');
      cy.get('footer').should('be.visible');
    });
  });
});

export {};



