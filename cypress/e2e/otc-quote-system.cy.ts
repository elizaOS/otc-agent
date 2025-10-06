/// <reference types="cypress" />

describe('Quote System Tests', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  describe('Quote Generation', () => {
    it('should generate valid XML quotes', () => {
      cy.get('[data-testid="landing-textarea"]').type('Show me a quote{enter}');
      
      // Intercept the response to check XML structure
      cy.intercept('POST', '/api/eliza/**').as('elizaResponse');
      
      cy.wait('@elizaResponse', { timeout: 15000 }).then((interception) => {
        const responseText = interception.response?.body?.text || '';
        
        // Check for XML markers
        expect(responseText).to.include('<!-- XML_START -->');
        expect(responseText).to.include('<!-- XML_END -->');
        
        // Extract and validate XML
        const xmlMatch = responseText.match(/<!-- XML_START -->([\s\S]*?)<!-- XML_END -->/);
        if (xmlMatch) {
          const xml = xmlMatch[1];
          expect(xml).to.include('<quote>');
          expect(xml).to.include('</quote>');
          expect(xml).to.not.include('<apr>');
          expect(xml).to.include('<lockupMonths>');
          expect(xml).to.include('<discountBps>');
        }
      });
    });

    it('should parse XML quotes correctly in UI', () => {
      cy.get('[data-testid="landing-textarea"]').type('Give me your best offer{enter}');
      
      cy.get('[data-testid="quote-display"]', { timeout: 15000 }).within(() => {
        // Check all required fields are parsed and displayed
        cy.get('[data-testid="quote-discount"]').should('exist').and('not.be.empty');
        cy.get('[data-testid="quote-lockup"]').should('exist').and('not.be.empty');
        cy.get('[data-testid="quote-currency"]').should('exist').and('not.be.empty');
      });
    });

    it('should handle malformed XML gracefully', () => {
      // Mock malformed XML response (missing discount field)
      cy.intercept('POST', '/api/eliza/**', {
        body: {
          text: `
            Here's your quote:
            <!-- XML_START -->
            <quote>
              <lockupMonths>5</lockupMonths>
            </quote>
            <!-- XML_END -->
          `
        }
      }).as('malformedXML');
      
      cy.get('[data-testid="landing-textarea"]').type('Quote please{enter}');
      cy.wait('@malformedXML');
      
      // Should show message but not crash
      cy.get('[data-testid="agent-message"]').should('be.visible');
      // Quote display might not show or show partial data
    });

    it('should update quotes with negotiation', () => {
      // Get initial quote
      cy.get('[data-testid="landing-textarea"]').type('Show me a quote{enter}');
      
      cy.get('[data-testid="quote-display"]', { timeout: 15000 })
        .first()
        .within(() => {
          cy.get('[data-testid="quote-discount"]').invoke('text').as('initialDiscount');
        });
      
      // Negotiate
      cy.get('[data-testid="chat-input"]').type('Can you do better on the discount?{enter}');
      
      // Check for updated quote
      cy.get('[data-testid="quote-display"]')
        .should('have.length', 2)
        .last()
        .within(() => {
          cy.get('[data-testid="quote-discount"]').invoke('text').as('updatedDiscount');
        });
      
      // Verify discount changed
      cy.get('@initialDiscount').then((initial) => {
        cy.get('@updatedDiscount').then((updated) => {
          expect(initial).to.not.equal(updated);
        });
      });
    });
  });

  describe('Quote Validation', () => {
    it('should validate discount ranges', () => {
      cy.get('[data-testid="landing-textarea"]').type('Quote{enter}');
      
      cy.get('[data-testid="quote-display"]', { timeout: 15000 }).within(() => {
        cy.get('[data-testid="quote-discount"]')
          .invoke('text')
          .then((pct) => {
            const value = parseFloat(pct);
            expect(value).to.be.greaterThan(0);
            expect(value).to.be.lessThan(100); // Reasonable max
          });
      });
    });

    it('should validate lockup periods', () => {
      cy.get('[data-testid="landing-textarea"]').type('Show terms{enter}');
      
      cy.get('[data-testid="quote-display"]', { timeout: 15000 }).within(() => {
        cy.get('[data-testid="quote-lockup"]')
          .invoke('text')
          .then((lockup) => {
            const months = parseInt(lockup);
            expect(months).to.be.at.least(1);
            expect(months).to.be.at.most(12);
          });
      });
    });

    it('should validate discount basis points', () => {
      cy.get('[data-testid="landing-textarea"]').type('What discount?{enter}');
      
      cy.get('[data-testid="quote-display"]', { timeout: 15000 }).within(() => {
        cy.get('[data-testid="quote-discount"]')
          .invoke('text')
          .then((discount) => {
            const bps = parseInt(discount);
            expect(bps).to.be.at.least(0);
            expect(bps).to.be.at.most(10000); // Max 100%
          });
      });
    });

    it('should validate payment currencies', () => {
      cy.get('[data-testid="landing-textarea"]').type('Payment options?{enter}');
      
      cy.get('[data-testid="quote-display"]', { timeout: 15000 }).within(() => {
        cy.get('[data-testid="quote-currency"]')
          .invoke('text')
          .then((currency) => {
            expect(currency).to.be.oneOf(['ETH', 'USDC']);
          });
      });
    });
  });


  describe('Quote Persistence', () => {
    it('should store quotes in backend', () => {
      // Create a quote
      cy.get('[data-testid="landing-textarea"]').type('New quote{enter}');
      
      cy.get('[data-testid="quote-display"]', { timeout: 15000 }).should('be.visible');
      
      // Get session ID
      cy.url().then(() => {
        // Validate latest quote endpoint with entityId in local storage (if present)
        cy.window().then((win) => {
          const entityId = win.localStorage.getItem('entityId') || win.localStorage.getItem('otc-desk-user-id');
          if (entityId) {
            cy.request(`/api/quote/latest?entityId=${encodeURIComponent(entityId)}`).then((response) => {
              expect(response.status).to.equal(200);
              // response.body.quote may be null if none active; this is fine
            });
          }
        });
      });
    });

    it('should prevent quote tampering', () => {
      cy.get('[data-testid="landing-textarea"]').type('Secure quote{enter}');
      
      cy.get('[data-testid="quote-display"]', { timeout: 15000 }).should('be.visible');
      
      // Try to modify quote data in localStorage
      cy.window().then((win) => {
        const quote = win.localStorage.getItem('currentQuote');
        if (quote) {
          const modified = JSON.parse(quote);
          modified.discountBps = 10000; // Try to set unrealistic discount
          win.localStorage.setItem('currentQuote', JSON.stringify(modified));
        }
      });
      
      // Reload and check quote is validated
      cy.reload();
      
      // Quote should either be rejected or show original values
      cy.get('[data-testid="quote-display"]').within(() => {
        cy.get('[data-testid="quote-discount"]').invoke('text').then((pct) => {
          const value = parseFloat(pct);
          expect(value).to.be.lessThan(100); // Not the tampered 100%
        });
      });
    });
  });

  describe('Quote Actions', () => {
    beforeEach(() => {
      // Get a quote first
      cy.get('[data-testid="landing-textarea"]').type('Quote please{enter}');
      cy.get('[data-testid="quote-display"]', { timeout: 15000 }).should('be.visible');
    });

    it('should accept quote from display', () => {
      cy.get('[data-testid="quote-display"]').within(() => {
        cy.contains('Accept This Quote').click();
      });
      
      // Should open amount selection modal
      cy.get('[data-testid="accept-quote-modal"]').should('be.visible');
    });

    it('should reject quote and request new one', () => {
      // Check if reject button exists before clicking
      cy.get('[data-testid="quote-display"]').within(() => {
        cy.get('body').then($body => {
          if ($body.find(':contains("Reject")').length > 0) {
            cy.contains('Reject').click();
          }
        });
      });
      
      // Or via chat
      cy.get('[data-testid="chat-input"]').type('No, give me a better quote{enter}');
      
      // Should get new quote
      cy.get('[data-testid="quote-display"]')
        .should('have.length.at.least', 2);
    });

    it('should copy quote details', () => {
      cy.get('[data-testid="quote-display"]').within(() => {
        cy.get('body').then($body => {
          if ($body.find('[data-testid="copy-quote"]').length > 0) {
            cy.get('[data-testid="copy-quote"]').click();
            
            // Check clipboard (if supported)
            cy.window().then((win) => {
              if (win.navigator.clipboard && win.navigator.clipboard.readText) {
                win.navigator.clipboard.readText().then((text) => {
                  expect(text).to.include('Discount');
                  expect(text).to.include('Lockup');
                });
              }
            });
          }
        });
      });
    });
  });

  describe('Multi-Quote Management', () => {
    it('should handle multiple quotes in conversation', () => {
      const requests = [
        'Show me standard quote',
        'What about with 6 month lockup?',
        'How about USDC payment instead?'
      ];
      
      requests.forEach((request, index) => {
        if (index === 0) {
          cy.get('[data-testid="landing-textarea"]').type(request + '{enter}');
        } else {
          cy.get('[data-testid="chat-input"]').type(request + '{enter}');
        }
        cy.wait(3000);
      });
      
      // Should have multiple quote displays
      cy.get('[data-testid="quote-display"]').should('have.length', 3);
      
      // Each should be distinct
      cy.get('[data-testid="quote-display"]').each(($quote, index) => {
        cy.wrap($quote).should('have.attr', 'data-quote-id');
      });
    });

    it('should highlight active/latest quote', () => {
      // Get multiple quotes
      cy.get('[data-testid="landing-textarea"]').type('First quote{enter}');
      cy.wait(3000);
      cy.get('[data-testid="chat-input"]').type('Second quote{enter}');
      cy.wait(3000);
      
      // Latest quote should be highlighted
      cy.get('[data-testid="quote-display"]')
        .last()
        .should('have.class', 'active-quote');
    });

    it('should allow comparing quotes', () => {
      // Get two quotes
      cy.get('[data-testid="landing-textarea"]').type('Quote 1{enter}');
      cy.wait(3000);
      cy.get('[data-testid="chat-input"]').type('Different terms please{enter}');
      cy.wait(3000);
      
      // Check if comparison view is available
      cy.get('body').then($body => {
        if ($body.find(':contains("Compare Quotes")').length > 0) {
          cy.contains('Compare Quotes').click();
          
          // Should show side-by-side comparison
          cy.get('[data-testid="quote-comparison"]').should('be.visible');
        }
      });
    });
  });

  describe('Quote Error Handling', () => {
    it('should handle network errors during quote generation', () => {
      cy.intercept('POST', '/api/eliza/**', { statusCode: 500 }).as('networkError');
      
      cy.get('[data-testid="landing-textarea"]').type('Quote{enter}');
      cy.wait('@networkError');
      
      // Should show error message
      cy.contains(/error|failed|try again/i).should('be.visible');
    });

    it('should handle invalid quote data', () => {
      cy.intercept('POST', '/api/eliza/**', {
        body: {
          text: `
            <!-- XML_START -->
            <quote>
              <apr>not-a-number</apr>
              <lockupMonths>invalid</lockupMonths>
            </quote>
            <!-- XML_END -->
          `
        }
      });
      
      cy.get('[data-testid="landing-textarea"]').type('Bad quote{enter}');
      
      // Should handle gracefully
      cy.get('[data-testid="agent-message"]').should('be.visible');
      cy.contains(/error|invalid/i).should('be.visible');
    });

    it('should retry failed quote requests', () => {
      let attemptCount = 0;
      
      cy.intercept('POST', '/api/eliza/**', (req) => {
        attemptCount++;
        if (attemptCount === 1) {
          req.reply({ statusCode: 500 });
        } else {
          req.reply({
            body: {
              text: `Quote ready <!-- XML_START --><quote><discountBps>800</discountBps></quote><!-- XML_END -->`
            }
          });
        }
      }).as('retryRequest');
      
      cy.get('[data-testid="landing-textarea"]').type('Quote with retry{enter}');
      
      // Should retry and eventually succeed
      cy.get('[data-testid="quote-display"]', { timeout: 20000 }).should('be.visible');
    });
  });
});
