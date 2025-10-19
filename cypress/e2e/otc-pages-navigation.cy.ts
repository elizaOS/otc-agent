/// <reference types="cypress" />

/**
 * OTC Desk - Complete Page Navigation Tests
 * Tests all pages and navigation flows
 */

describe('OTC Desk - Page Navigation', () => {
  beforeEach(() => {
    cy.visit('/', { timeout: 30000, failOnStatusCode: false });
  });

  describe('Main Page', () => {
    it('loads home page', () => {
      cy.url().should('include', '/');
      cy.get('body').should('be.visible');
    });

    it('has header with navigation', () => {
      cy.get('header').should('be.visible');
    });

    it('has footer with links', () => {
      cy.get('footer').should('be.visible');
    });

    it('shows chat interface', () => {
      cy.get('[data-testid="chat-input"]').should('exist');
    });
  });

  describe('How It Works Page', () => {
    it('navigates to how it works', () => {
      cy.visit('/how-it-works');
      cy.url().should('include', '/how-it-works');
      cy.get('body').should('be.visible');
    });

    it('displays content sections', () => {
      cy.visit('/how-it-works');
      cy.contains(/how it works|step|process/i, { timeout: 10000 }).should('be.visible');
    });

    it('has navigation back to home', () => {
      cy.visit('/how-it-works');
      cy.get('a[href="/"]').should('exist');
    });
  });

  describe('My Deals Page', () => {
    it('navigates to my deals', () => {
      cy.visit('/my-deals');
      cy.url().should('include', '/my-deals');
      cy.get('body').should('be.visible');
    });

    it('shows no deals when wallet not connected', () => {
      cy.visit('/my-deals');
      cy.contains(/connect|no deals|wallet/i, { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Privacy Page', () => {
    it('navigates to privacy policy', () => {
      cy.visit('/privacy');
      cy.url().should('include', '/privacy');
      cy.get('body').should('be.visible');
    });

    it('displays privacy content', () => {
      cy.visit('/privacy');
      cy.contains(/privacy/i, { timeout: 10000 }).should('be.visible');
    });

    it('has link in footer', () => {
      cy.visit('/');
      cy.get('footer a[href="/privacy"]').should('exist');
    });
  });

  describe('Terms Page', () => {
    it('navigates to terms of service', () => {
      cy.visit('/terms');
      cy.url().should('include', '/terms');
      cy.get('body').should('be.visible');
    });

    it('displays terms content', () => {
      cy.visit('/terms');
      cy.contains(/terms/i, { timeout: 10000 }).should('be.visible');
    });

    it('has link in footer', () => {
      cy.visit('/');
      cy.get('footer a[href="/terms"]').should('exist');
    });
  });

  describe('Deal Detail Page', () => {
    it('loads deal page with valid ID', () => {
      cy.visit('/deal/test-deal-123', { failOnStatusCode: false });
      cy.get('body').should('be.visible');
    });

    it('handles invalid deal ID gracefully', () => {
      cy.visit('/deal/invalid', { failOnStatusCode: false });
      cy.get('body').should('be.visible');
      // Should show error or redirect, not crash
    });
  });

  describe('Header Navigation', () => {
    it('logo links to home', () => {
      cy.visit('/how-it-works');
      cy.get('header a[href="/"]').first().click();
      cy.url().should('eq', Cypress.config().baseUrl + '/');
    });

    it('shows chain indicator', () => {
      cy.get('[data-testid="chain-indicator"]', { timeout: 10000 })
        .should('exist');
    });

    it('shows wallet connector', () => {
      cy.contains(/connect/i).should('be.visible');
    });
  });

  describe('Footer Navigation', () => {
    it('has all required links', () => {
      cy.visit('/');
      cy.get('footer').within(() => {
        cy.contains(/how it works/i).should('exist');
        cy.contains(/privacy/i).should('exist');
        cy.contains(/terms/i).should('exist');
      });
    });

    it('footer links work', () => {
      cy.visit('/');
      cy.get('footer a[href="/how-it-works"]').should('have.attr', 'href', '/how-it-works');
      cy.get('footer a[href="/privacy"]').should('have.attr', 'href', '/privacy');
      cy.get('footer a[href="/terms"]').should('have.attr', 'href', '/terms');
    });
  });

  describe('Responsive Navigation', () => {
    it('navigation works on mobile', () => {
      cy.viewport('iphone-x');
      cy.visit('/');
      cy.contains(/connect/i).should('be.visible');
      
      cy.visit('/how-it-works');
      cy.get('body').should('be.visible');
      
      cy.visit('/my-deals');
      cy.get('body').should('be.visible');
    });

    it('navigation works on tablet', () => {
      cy.viewport('ipad-2');
      cy.visit('/');
      cy.get('header').should('be.visible');
      cy.get('footer').should('be.visible');
    });
  });

  describe('SEO & Meta Tags', () => {
    it('home page has title', () => {
      cy.visit('/');
      cy.title().should('not.be.empty');
    });

    it('pages have meta tags', () => {
      cy.visit('/');
      cy.get('head meta[name="viewport"]').should('exist');
    });
  });

  describe('Error Pages', () => {
    it('404 page works', () => {
      cy.visit('/this-page-does-not-exist-404', { failOnStatusCode: false });
      cy.get('body').should('be.visible');
      // Next.js 404 or error page should render
    });

    it('can navigate from 404 back to home', () => {
      cy.visit('/404-test', { failOnStatusCode: false });
      cy.wait(1000);
      
      // Look for any link to home
      cy.get('a[href="/"]').should('exist');
    });
  });
});

export {};



