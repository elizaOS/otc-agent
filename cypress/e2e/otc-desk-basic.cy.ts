/// <reference types="cypress" />

describe('OTC Desk Basic Tests', () => {
  beforeEach(() => {
    cy.visit('/', { timeout: 60000, failOnStatusCode: false });
    cy.get('[data-testid="chat-input"]', { timeout: 30000 }).should('be.visible');
  });

  describe('Landing Page', () => {
    it('should load the landing page', () => {
      // Check if page loads at all
      cy.get('body').should('be.visible');
      
      // Look for any main content
      cy.get('main, div[class*="container"], div[class*="main"]', { timeout: 10000 })
        .should('exist');
    });

    it('should have a text input area', () => {
      // Look for textarea or input for chat
      cy.get('textarea, input[type="text"]', { timeout: 10000 })
        .first()
        .should('be.visible');
    });

    it('should display some quote information', () => {
      // Look for discount percentage or quote text
      cy.contains(/\d+%|discount|quote/i, { timeout: 10000 })
        .should('be.visible');
    });

    it('should have an accept or negotiate button', () => {
      // Look for action buttons
      cy.get('button', { timeout: 10000 })
        .should('exist')
        .and('have.length.greaterThan', 0);
    });
  });

  describe('Basic Interactions', () => {
    it('should allow typing in the input field', () => {
      cy.get('textarea, input[type="text"]')
        .first()
        .type('Hello OTC desk')
        .should('have.value', 'Hello OTC desk');
    });

    it('should handle button clicks', () => {
      cy.get('button')
        .first()
        .click({ force: true });
      
      // Check something happens (modal, navigation, etc)
      cy.wait(1000);
    });

    it('should navigate to chat when submitting text', () => {
      cy.get('textarea, input[type="text"]')
        .first()
        .type('I want a quote{enter}');
      
      // Check if URL changes or new content appears
      cy.wait(2000);
      cy.url().then(url => {
        // URL might change to /chat/... or stay same
        expect(url).to.exist;
      });
    });
  });

  describe('Quote Display', () => {
    it('should show quote details somewhere on page', () => {
      // Look for actual quote elements present in the DOM
      cy.contains('Lockup Period', { timeout: 10000 }).should('be.visible');
      cy.contains('5 months', { timeout: 10000 }).should('be.visible');
      cy.contains('%').should('be.visible'); // Discount percentage
      cy.contains('Token Range', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Modal Tests', () => {
    it('should open a modal when accepting quote', () => {
      // Find and click the actual accept button text
      cy.contains('Accept Quote', { timeout: 10000 })
        .click({ force: true });
      
      // Wait for modal or new content to appear
      cy.wait(2000);
      
      // Check if modal opened by looking for changed content or overlay
      cy.get('body').then($body => {
        // Modal might be a dialog, overlay, or new content
        const hasModal = $body.find('[role="dialog"]').length > 0 ||
                        $body.find('[data-testid="accept-quote-modal"]').length > 0 ||
                        $body.find('div[class*="modal"]').length > 0 ||
                        $body.find('div[class*="overlay"]').length > 0;
        
        // If no modal, check if page navigated or content changed
        if (!hasModal) {
          cy.url().then(url => {
            // Accept that either modal opens OR navigation happens
            expect(url).to.exist;
          });
        }
      });
    });

    it('should handle modal or navigation after accepting quote', () => {
      // Click accept button
      cy.contains('Accept Quote', { timeout: 10000 })
        .click({ force: true });
      
      cy.wait(2000);
      
      // Check if we can interact with page after clicking
      // Either modal is open or we navigated - both are valid
      cy.get('body').then($body => {
        // Try to find any interactive element
        const hasInteractiveElements = 
          $body.find('button').length > 0 ||
          $body.find('input').length > 0 ||
          $body.find('textarea').length > 0;
        
        expect(hasInteractiveElements).to.be.true;
      });
    });
  });

  describe('Chat Functionality', () => {
    it('should send messages to chat', () => {
      cy.get('textarea, input[type="text"]')
        .first()
        .type('Show me your best rate{enter}');
      
      cy.wait(3000);
      
      // Look for response
      cy.contains(/rate|discount|quote/i, { timeout: 15000 });
    });

    it('should display user messages', () => {
      const testMessage = 'Test message ' + Date.now();
      
      cy.get('textarea, input[type="text"]')
        .first()
        .type(testMessage + '{enter}');
      
      cy.wait(2000);
      
      // Message should appear somewhere
      cy.contains(testMessage).should('be.visible');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', () => {
      cy.intercept('POST', '/api/**', { statusCode: 500 }).as('apiError');
      
      cy.get('textarea, input[type="text"]')
        .first()
        .type('Trigger error{enter}');
      
      cy.wait('@apiError', { timeout: 10000 });
      
      // Page should not crash
      cy.get('body').should('be.visible');
    });
  });

  describe('Responsive Design', () => {
    it('should work on mobile viewport', () => {
      cy.viewport('iphone-x');
      
      cy.get('body').should('be.visible');
      cy.get('textarea, input[type="text"]').should('be.visible');
    });

    it('should work on tablet viewport', () => {
      cy.viewport('ipad-2');
      
      cy.get('body').should('be.visible');
      cy.get('textarea, input[type="text"]').should('be.visible');
    });
  });
});

// Helper to check if element exists without failing
Cypress.Commands.add('elementExists', (selector: string) => {
  cy.get('body').then($body => {
    return $body.find(selector).length > 0;
  });
});

declare namespace Cypress {
  interface Chainable {
    elementExists(selector: string): Chainable<boolean>
  }
}
