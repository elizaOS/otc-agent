/// <reference types="cypress" />

describe('ElizaOS OTC System - End-to-End Test', () => {
  // Test configuration
  const TEST_WALLET_ADDRESS = Cypress.env('TEST_WALLET_ADDRESS') || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const deal_CONTRACT_ADDRESS = Cypress.env('deal_ADDRESS');
  
  before(() => {
    // Ensure the system is running
    cy.visit('/');
    
    // Check if the application is ready
    cy.get('body', { timeout: 30000 }).should('be.visible');
  });

  describe('1. Initial Setup & Navigation', () => {
    it('should load the home page', () => {
      cy.visit('/');
      cy.contains('ElizaOS').should('be.visible');
      cy.get('[data-testid="chat-input"]').should('be.visible');
    });

    it('should display agent greeting', () => {
      cy.get('[data-testid="chat-messages"]').should('contain', 'Hello');
    });
  });

  describe('2. Quote Negotiation Flow', () => {
    it('should request a quote', () => {
      // Type quote request
      cy.get('[data-testid="chat-input"]')
        .type('I want to buy 10,000 ElizaOS tokens with a 15% discount for 3 months lockup');
      
      cy.get('[data-testid="send-button"]').click();
      
      // Wait for agent response
      cy.get('[data-testid="chat-messages"]', { timeout: 10000 })
        .should('contain', 'quote');
    });

    it('should display quote details', () => {
      // Check for quote display component
      cy.get('[data-testid="quote-display"]', { timeout: 10000 })
        .should('be.visible')
        .within(() => {
          cy.contains('10,000').should('be.visible');
          cy.contains('15%').should('be.visible');
          cy.contains('3 months').should('be.visible');
          cy.get('[data-testid="accept-quote-button"]').should('be.visible');
        });
    });
  });

  describe('3. Wallet Connection', () => {
    it('should prompt for wallet connection', () => {
      // Click accept quote (should trigger wallet connection)
      cy.get('[data-testid="accept-quote-button"]').click();
      
      // Check for wallet connection prompt
      cy.get('button').contains('Connect').should('be.visible');
    });

    it('should connect wallet successfully', () => {
      // Mock wallet connection (for testing purposes)
      cy.window().then((win) => {
        // Inject mock ethereum provider
        (win as any).ethereum = {
          isMetaMask: true,
          request: async ({ method, params }: any) => {
            if (method === 'eth_requestAccounts') {
              return [TEST_WALLET_ADDRESS];
            }
            if (method === 'eth_accounts') {
              return [TEST_WALLET_ADDRESS];
            }
            if (method === 'eth_chainId') {
              return '0x7a69'; // Hardhat chain ID
            }
            return null;
          },
          on: () => {},
          removeListener: () => {}
        };
      });
      
      // Click connect wallet
      cy.get('button').contains('Connect').click();
      
      // Verify wallet connected
      cy.contains(TEST_WALLET_ADDRESS.slice(0, 6), { timeout: 5000 }).should('be.visible');
    });
  });

  describe('4. OTC Offer Creation', () => {
    it('should create deal offer on-chain', () => {
      // Re-click accept quote after wallet connection
      cy.get('[data-testid="accept-quote-button"]').click();
      
      // Wait for transaction to process
      cy.get('[data-testid="processing-modal"]', { timeout: 10000 })
        .should('be.visible')
        .should('contain', 'Creating deal offer');
      
      // Wait for offer creation confirmation
      cy.get('[data-testid="offer-created-notification"]', { timeout: 20000 })
        .should('be.visible')
        .should('contain', 'Offer created');
    });
  });

  describe('5. Agent Approval', () => {
    it('should receive approval notification', () => {
      // Wait for agent to approve the offer
      cy.get('[data-testid="approval-notification"]', { timeout: 15000 })
        .should('be.visible')
        .should('contain', 'approved');
      
      // Check for payment button
      cy.get('[data-testid="complete-payment-button"]')
        .should('be.visible')
        .should('not.be.disabled');
    });
  });

  describe('6. Payment Fulfillment', () => {
    it('should complete USDC payment', () => {
      // Click complete payment
      cy.get('[data-testid="complete-payment-button"]').click();
      
      // Confirm in modal
      cy.get('[data-testid="payment-modal"]')
        .should('be.visible')
        .within(() => {
          cy.contains('USDC').should('be.visible');
          cy.get('[data-testid="confirm-payment-button"]').click();
        });
      
      // Wait for transaction
      cy.get('[data-testid="processing-payment"]', { timeout: 10000 })
        .should('be.visible');
      
      // Wait for payment confirmation
      cy.get('[data-testid="payment-success"]', { timeout: 20000 })
        .should('be.visible')
        .should('contain', 'Payment successful');
    });
  });

  describe('7. Deal Completion & Celebration', () => {
    it('should show deal completion screen', () => {
      // Should automatically navigate to completion page
      cy.url({ timeout: 10000 }).should('include', '/deal/complete');
      
      // Check for completion elements
      cy.get('[data-testid="deal-completion"]')
        .should('be.visible')
        .within(() => {
          cy.contains('Deal Executed Successfully').should('be.visible');
          cy.contains('10,000 ElizaOS').should('be.visible');
          cy.contains('P&L Summary').should('be.visible');
        });
    });

    it('should display P&L metrics', () => {
      cy.get('[data-testid="deal-completion"]').within(() => {
        // Check for savings
        cy.contains('Instant Savings').should('be.visible');
        cy.contains('$').should('be.visible');
        
        // Check for Discount ROI
        cy.contains('Discount ROI').should('be.visible');
        cy.contains('%').should('be.visible');
        
        // Check for Discount & Lockup info
        cy.contains('Discount').should('be.visible');
        cy.contains('Lockup').should('be.visible');
      });
    });

    it('should show share options', () => {
      cy.get('[data-testid="deal-completion"]').within(() => {
        cy.contains('Share Your Success').should('be.visible');
        cy.get('button').contains('Share on X').should('be.visible');
        cy.get('button').contains('Download P&L Card').should('be.visible');
      });
    });

    it('should allow starting a new deal', () => {
      cy.get('button').contains('Negotiate Another Deal').should('be.visible').click();
      
      // Should navigate back to home
      cy.url().should('eq', 'http://localhost:3000/');
      cy.get('[data-testid="chat-input"]').should('be.visible');
    });
  });

  describe('8. Token Claim (Time-locked)', () => {
    it('should check token unlock status', () => {
      // Navigate to portfolio or status page
      cy.visit('/portfolio');
      
      cy.get('[data-testid="active-otc"]', { timeout: 5000 })
        .should('be.visible')
        .within(() => {
          cy.contains('10,000 ElizaOS').should('be.visible');
          cy.contains('Locked').should('be.visible');
          cy.contains('3 months').should('be.visible');
        });
    });

    it('should simulate time passage and claim tokens', () => {
      // For testing, we can trigger time manipulation
      cy.window().then((win) => {
        // Call contract method to advance time (only works in test environment)
        (win as any).testAdvanceTime?.(90 * 24 * 60 * 60); // 90 days
      });
      
      // Refresh to check unlock status
      cy.reload();
      
      cy.get('[data-testid="active-otc"]').within(() => {
        cy.get('[data-testid="claim-button"]')
          .should('be.visible')
          .should('not.be.disabled')
          .click();
      });
      
      // Wait for claim transaction
      cy.get('[data-testid="claiming-tokens"]', { timeout: 10000 })
        .should('be.visible');
      
      // Verify tokens claimed
      cy.get('[data-testid="tokens-claimed"]', { timeout: 20000 })
        .should('be.visible')
        .should('contain', '10,000 ElizaOS tokens claimed');
    });
  });

  describe('9. System Health Checks', () => {
    it('should verify all services are running', () => {
      // Check API health
      cy.request('GET', '/api/health').then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('status', 'healthy');
      });
      
      // Check WebSocket connection
      cy.window().then((win) => {
        const socket = (win as any).__socket;
        expect(socket?.connected).to.be.true;
      });
      
      // Check contract connectivity
      cy.request('GET', '/api/devnet/address').then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('otcAddress');
      });
    });
  });

  // Cleanup after tests
  after(() => {
    // Disconnect wallet
    cy.window().then((win) => {
      if ((win as any).ethereum) {
        (win as any).ethereum.request({ method: 'wallet_disconnect' });
      }
    });
    
    // Clear local storage
    cy.clearLocalStorage();
  });
});

// Helper commands
Cypress.Commands.add('mockWalletConnection', (address: string) => {
  cy.window().then((win) => {
    (win as any).ethereum = {
      isMetaMask: true,
      selectedAddress: address,
      request: async ({ method }: any) => {
        if (method === 'eth_requestAccounts') return [address];
        if (method === 'eth_accounts') return [address];
        return null;
      },
      on: () => {},
      removeListener: () => {}
    };
  });
});

// Type declarations
declare global {
  namespace Cypress {
    interface Chainable {
      mockWalletConnection(address: string): Chainable<void>;
    }
  }
}

export {};
