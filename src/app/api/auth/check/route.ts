import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('google_access_token')?.value;
  
  if (!accessToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  
  // In a production app, you would verify the token is still valid
  // by making a test request to the Google API
  
  return NextResponse.json({ authenticated: true });
}