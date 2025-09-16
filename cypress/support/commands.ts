/// <reference types="cypress" />

// Custom commands for OTC desk testing

Cypress.Commands.add('createQuote', (tokenAmount: string, userId = 'cypress-test-user') => {
  return cy.request({
    method: 'POST',
    url: '/api/eliza/message',
    timeout: 60000,
    body: {
      message: `I want to buy ${tokenAmount} ElizaOS tokens`,
      userId,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  }).then((response) => {
    expect(response.status).to.be.oneOf([200]);
    return response.body;
  });
});

Cypress.Commands.add('startWorker', () => {
  return cy.request({
    method: 'POST',
    url: '/api/worker/quote-approval',
    body: {
      action: 'start',
    },
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Cypress.env('API_SECRET_KEY')}`,
    },
  }).then((response) => {
    expect(response.status).to.equal(200);
    expect(response.body.success).to.be.true;
  });
});

Cypress.Commands.add('stopWorker', () => {
  return cy.request({
    method: 'POST',
    url: '/api/worker/quote-approval',
    body: {
      action: 'stop',
    },
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Cypress.env('API_SECRET_KEY')}`,
    },
  }).then((response) => {
    expect(response.status).to.equal(200);
    expect(response.body.success).to.be.true;
  });
});

Cypress.Commands.add('sendAgentMessage', (message: string, userId = 'cypress-test-user') => {
  return cy.request({
    method: 'POST',
    url: '/api/eliza/message',
    timeout: 60000,
    body: {
      message,
      userId,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  }).then((response) => {
    expect(response.status).to.be.oneOf([200]);
    return response.body;
  });
});

Cypress.Commands.add('waitForQuote', () => {
  // Wait for the quote display to appear
  cy.get('[data-testid="quote-display"]', { timeout: 15000 }).should('be.visible');
});

Cypress.Commands.add('connectWallet', () => {
  // This is a simplified wallet connection for testing
  // In real tests, you'd need to handle MetaMask or use a test wallet provider
  cy.window().then((win) => {
    // Mock wallet connection
    (win as any).ethereum = {
      isMetaMask: true,
      request: ({ method }: { method: string }) => {
        if (method === 'eth_requestAccounts') {
          return Promise.resolve([Cypress.env('TEST_WALLET_ADDRESS')]);
        }
        if (method === 'eth_accounts') {
          return Promise.resolve([Cypress.env('TEST_WALLET_ADDRESS')]);
        }
        return Promise.resolve(null);
      },
    };
  });
  
  // Click connect button if visible
  cy.get('button').contains(/connect/i).click({ force: true });
});

export {};










