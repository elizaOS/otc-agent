import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';

let neynarClient: any = null;

async function getNeynarClient() {
  if (!neynarClient) {
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) throw new Error('NEYNAR_API_KEY not configured');
    
    const config = new Configuration({ apiKey });
    neynarClient = new NeynarAPIClient(config);
  }
  return neynarClient;
}

export async function POST(request: NextRequest) {
  try {
    const { fid, title, body } = await request.json();
    
    if (!fid || !title || !body) {
      return NextResponse.json(
        { error: 'Missing required parameters: fid, title, body' },
        { status: 400 }
      );
    }
    
    // Dev mode simulation when API key is not configured
    if (!process.env.NEYNAR_API_KEY) {
      console.log('[Dev] Simulating notification:', { fid, title, body });
      return NextResponse.json({ state: "success", simulated: true });
    }
    
    const client = await getNeynarClient();
    const result = await client.sendFrameNotification({
      fid: Number(fid),
      title,
      body,
    });
    
    if (result.success) {
      return NextResponse.json({ state: "success" });
    }
    
    return NextResponse.json({ 
      state: result.reason || "error",
      message: result.message 
    });
    
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}

