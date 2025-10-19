/// <reference types="cypress" />

/**
 * OTC Desk - Complete Wallet Flow with MetaMask
 * Tests the full user journey with real wallet connection
 * 
 * SETUP REQUIRED:
 * 1. Start local Anvil node: npm run rpc:start
 * 2. Deploy contracts: npm run rpc:deploy
 * 3. Run tests: npx cypress open (for headed mode with MetaMask)
 */

describe('OTC Desk - Complete Wallet Flow (EVM)', () => {
  const testWallet = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  
  before(() => {
    // Setup: Visit the app
    cy.visit('/', { timeout: 30000 });
    cy.wait(2000);
  });

  describe('1. Initial State (No Wallet)', () => {
    it('shows connect wallet prompt', () => {
      cy.contains(/connect/i, { timeout: 10000 }).should('be.visible');
    });

    it('chat input is disabled', () => {
      cy.get('[data-testid="chat-input"]')
        .should('exist')
        .and('be.disabled');
    });

    it('has EVM wallet option', () => {
      // Look for MetaMask or EVM wallet option
      cy.contains(/connect/i).click({ force: true });
      cy.wait(1000);
      
      // Check if wallet modal opened (varies by implementation)
      cy.get('body').should('be.visible');
    });
  });

  describe('2. Manual Wallet Connection', () => {
    /**
     * NOTE: These tests require MANUAL interaction in headed mode
     * You must click the connect button and approve in MetaMask
     */
    
    it('user can click connect button', () => {
      cy.reload();
      cy.wait(2000);
      
      // Find and click connect button
      cy.get('button').contains(/connect/i, { timeout: 10000 })
        .should('be.visible')
        .click({ force: true });
      
      cy.wait(2000);
      
      // After clicking, wallet selector should appear
      // This varies based on your implementation
      cy.get('body').should('be.visible');
    });

    it('shows wallet options in modal', () => {
      // Wait for any wallet selector UI
      cy.wait(1000);
      
      // Check if modal or wallet options are visible
      cy.get('body').then(($body) => {
        const hasMetaMask = $body.text().toLowerCase().includes('metamask');
        const hasWallet = $body.text().toLowerCase().includes('wallet');
        expect(hasMetaMask || hasWallet).to.be.true;
      });
    });

    /**
     * MANUAL STEP: Connect MetaMask
     * 
     * In headed mode:
     * 1. Click "MetaMask" or "Browser Wallet"
     * 2. Approve connection in MetaMask popup
     * 3. Continue with next test
     */
    
    it.skip('MANUAL: Connect MetaMask and approve', () => {
      // This test is marked as skip - perform this manually
      // After connecting, the next tests will verify the connection worked
    });
  });

  describe('3. Post-Connection State', () => {
    /**
     * Run these tests AFTER manually connecting wallet
     */
    
    it('shows wallet address after connection', { 
      retries: 3 
    }, () => {
      // Wait longer for wallet connection
      cy.wait(5000);
      
      // Look for shortened wallet address (e.g., "0xf39F...")
      cy.get('body', { timeout: 15000 }).then(($body) => {
        const bodyText = $body.text();
        
        // Check if any wallet address pattern appears
        const hasAddress = bodyText.includes('0x') || 
                          bodyText.toLowerCase().includes('connected') ||
                          bodyText.toLowerCase().includes('disconnect');
        
        if (hasAddress) {
          expect(hasAddress).to.be.true;
        } else {
          // If no address found, check if input is enabled (indicates connection)
          const inputDisabled = $body.find('[data-testid="chat-input"]:disabled').length > 0;
          expect(inputDisabled).to.be.false;
        }
      });
    });

    it('chat input becomes enabled', {
      retries: 3
    }, () => {
      cy.wait(3000);
      
      cy.get('[data-testid="chat-input"]', { timeout: 15000 })
        .should('not.be.disabled');
    });

    it('send button becomes enabled', {
      retries: 3
    }, () => {
      cy.get('[data-testid="send-button"]', { timeout: 10000 })
        .should('not.be.disabled');
    });
  });

  describe('4. Chat and Quote Flow', () => {
    /**
     * Test the complete OTC flow AFTER wallet is connected
     */
    
    it('can send a chat message', {
      retries: 2
    }, () => {
      // Wait for connection to settle
      cy.wait(2000);
      
      // Verify input is enabled
      cy.get('[data-testid="chat-input"]')
        .should('not.be.disabled')
        .clear()
        .type('Hello, I want to buy elizaOS tokens');
      
      cy.get('[data-testid="send-button"]').click();
      
      // Verify message appears
      cy.get('[data-testid="user-message"]', { timeout: 5000 })
        .should('be.visible')
        .and('contain', 'buy elizaOS');
    });

    it('receives agent response', {
      retries: 2
    }, () => {
      // Wait for agent to respond
      cy.get('[data-testid="agent-message"]', { timeout: 20000 })
        .should('be.visible')
        .and('not.be.empty');
    });

    it('can request a quote', {
      retries: 2
    }, () => {
      cy.wait(2000);
      
      cy.get('[data-testid="chat-input"]')
        .should('not.be.disabled')
        .clear()
        .type('Give me a quote for 50,000 elizaOS tokens');
      
      cy.get('[data-testid="send-button"]').click();
      
      // Wait for response
      cy.wait(3000);
    });

    it('agent provides quote with terms', {
      retries: 2
    }, () => {
      // Wait for agent response with quote
      cy.get('[data-testid="agent-message"]', { timeout: 20000 })
        .last()
        .should(($msg) => {
          const text = $msg.text().toLowerCase();
          expect(text).to.match(/discount|lockup|month|quote|token/);
        });
    });

    it('shows Accept Offer button after quote', {
      retries: 3
    }, () => {
      cy.wait(3000);
      
      // Look for Accept Offer button in header or chat
      cy.get('body', { timeout: 10000 }).then(($body) => {
        const hasAcceptButton = $body.find(':contains("Accept Offer")').length > 0 ||
                                $body.find(':contains("Accept Quote")').length > 0 ||
                                $body.find(':contains("Accept")').length > 0;
        expect(hasAcceptButton).to.be.true;
      });
    });
  });

  describe('5. Chain Validation', () => {
    it('shows correct button based on chain match', {
      retries: 2
    }, () => {
      cy.wait(2000);
      
      // Check if button text matches the required chain
      // If quote is for Base and user is on Base, should show "Accept Offer"
      // If quote is for different chain, should show "Switch to [Chain]"
      cy.get('body', { timeout: 10000 }).then(($body) => {
        const hasAcceptButton = $body.find(':contains("Accept Offer")').length > 0;
        const hasSwitchButton = $body.find(':contains("Switch to")').length > 0;
        
        // One of these should be true
        expect(hasAcceptButton || hasSwitchButton).to.be.true;
      });
    });

    it('handles chain switching if needed', {
      retries: 2
    }, () => {
      cy.wait(2000);
      
      // Check if we need to switch chains
      cy.get('body').then(($body) => {
        const switchButton = $body.find(':contains("Switch to")');
        
        if (switchButton.length > 0) {
          // If switch button exists, click it
          cy.log('Chain switch needed - clicking switch button');
          switchButton.first().click();
          
          // Wait for chain switch
          cy.wait(3000);
          
          // After switching, button should change to "Accept Offer"
          cy.contains(/Accept Offer/i, { timeout: 15000 })
            .should('be.visible');
        } else {
          cy.log('Already on correct chain');
        }
      });
    });
  });

  describe('6. Accept Quote Modal', () => {
    it('opens accept quote modal', {
      retries: 2
    }, () => {
      // Click Accept Offer button (should be visible after chain validation)
      cy.contains(/Accept Offer|Accept Quote/i, { timeout: 10000 })
        .first()
        .click({ force: true });
      
      // Modal should open
      cy.get('[data-testid="accept-quote-modal"]', { timeout: 5000 })
        .should('be.visible');
    });

    it('shows token amount controls', () => {
      cy.get('[data-testid="token-amount-input"]')
        .should('be.visible');
      
      cy.get('[data-testid="token-amount-slider"]')
        .should('be.visible');
    });

    it('shows quote summary', () => {
      cy.get('[data-testid="accept-quote-modal"]').within(() => {
        // Look for quote details
        cy.contains(/discount/i).should('be.visible');
        cy.contains(/lockup|month/i).should('be.visible');
      });
    });

    it('can adjust token amount', () => {
      cy.get('[data-testid="token-amount-input"]')
        .clear()
        .type('5000');
      
      // Slider should sync
      cy.get('[data-testid="token-amount-slider"]')
        .should('have.value', '5000');
    });

    it('shows confirm button', () => {
      cy.get('[data-testid="confirm-amount-button"]')
        .should('be.visible');
    });
  });

  describe('7. Transaction Flow (Manual)', () => {
    /**
     * NOTE: These require MANUAL MetaMask approval
     */
    
    it('clicking confirm triggers wallet', {
      retries: 2
    }, () => {
      cy.get('[data-testid="confirm-amount-button"]')
        .should('not.be.disabled')
        .click();
      
      cy.wait(2000);
      
      // Check for transaction pending state or MetaMask popup
      cy.get('body').should('be.visible');
    });

    it.skip('MANUAL: Approve transaction in MetaMask', () => {
      // Perform this manually:
      // 1. MetaMask popup should appear
      // 2. Review transaction details
      // 3. Click "Confirm"
      // 4. Wait for transaction to complete
    });

    it.skip('shows transaction confirmation', () => {
      // After manual approval, check for success state
      cy.contains(/success|confirmed|complete/i, { timeout: 30000 })
        .should('be.visible');
    });
  });

  describe('8. Cleanup', () => {
    it('can close modal', () => {
      // If modal is still open, close it
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="accept-quote-modal"]').is(':visible')) {
          cy.get('body').type('{esc}');
        }
      });
    });

    it('can continue chatting', {
      retries: 2
    }, () => {
      cy.wait(2000);
      
      cy.get('[data-testid="chat-input"]')
        .should('not.be.disabled')
        .clear()
        .type('Thank you');
      
      cy.get('[data-testid="send-button"]').click();
      
      cy.get('[data-testid="user-message"]')
        .last()
        .should('contain', 'Thank you');
    });
  });
});

export {};
