export async function sendWelcomeNotification(fid: number): Promise<boolean> {
  try {
    const response = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fid,
        title: 'Welcome to Eliza OTC Desk',
        body: 'Start trading with AI-powered negotiation on Base, Jeju, and Solana',
      }),
    });
    
    const result = await response.json();
    return result.state === 'success';
  } catch (error) {
    console.error('Failed to send welcome notification:', error);
    return false;
  }
}

