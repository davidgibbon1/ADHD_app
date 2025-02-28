# ADHD Task Management and Scheduling App

A comprehensive application designed to help users with ADHD manage tasks, schedule events, and integrate with productivity tools like Google Calendar and Notion.

## Features

- **Task Management**: Create, organize, and track tasks with priority levels and due dates
- **Google Calendar Integration**: Seamlessly sync and manage events with Google Calendar
- **Notion Integration**: Import tasks and notes from Notion databases
- **15-Minute Scheduling**: Create and manage calendar events with 15-minute precision
- **Voice Input**: Use voice recognition for hands-free task creation
- **AI-Powered Assistance**: Get help organizing tasks and scheduling

## Technologies Used

- React with Next.js 14 App Router
- TailwindCSS with Shadcn UI components
- Firebase Auth, Storage, and Database
- Google Calendar API integration
- Notion API integration
- Deepgram for voice recognition
- Replicate for AI image generation

## Setup Instructions

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Google Cloud Platform account (for Google Calendar API)
- Notion account and API key (for Notion integration)
- Firebase account (for authentication and database)
- Deepgram account (for voice recognition)
- Replicate account (for AI image generation)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd ADHD_app_cursor/template-2
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env.local`
   ```bash
   cp .env.example .env.local
   ```
   - Fill in your API keys and credentials in `.env.local`

4. Set up Google OAuth credentials:
   - Create a project in Google Cloud Console
   - Enable the Google Calendar API
   - Create OAuth credentials (Web application type)
   - Download the credentials JSON file and save it as `credentials.json` in the project root
   - Add authorized redirect URIs (e.g., `http://localhost:3000/api/auth/google/callback`)

5. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Environment Variables

The following environment variables are required:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: Google OAuth credentials
- `NEXT_PUBLIC_FIREBASE_*`: Firebase configuration variables
- `NOTION_AUTH_TOKEN` and `NOTION_DATABASE_IDS`: Notion API credentials
- `DEEPGRAM_API_KEY`: Deepgram API key for voice recognition
- `REPLICATE_API_TOKEN`: Replicate API token for AI image generation

See `.env.example` for a complete list of required variables.

## Deployment

This application can be deployed to Vercel or any other Next.js-compatible hosting service.

1. Set up environment variables in your hosting provider
2. Deploy the application following the hosting provider's instructions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.