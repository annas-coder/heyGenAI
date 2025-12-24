# HeyGen Streaming Avatar Demo

A Vite + TypeScript project that integrates the HeyGen Streaming Avatar SDK with OpenAI Assistant for interactive avatar conversations.

## Features

- 🤖 Interactive AI Avatar powered by HeyGen
- 🧠 OpenAI Assistant integration for intelligent responses
- 🎥 High-quality streaming avatar video
- 💬 Text-to-speech conversation interface
- ⚡ Real-time streaming with LiveKit
- 🎨 Modern UI with Pico CSS

## Prerequisites

- Node.js (v20.19.0 or higher recommended)
- HeyGen API key
- OpenAI API key

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the root directory with your API keys:
   ```env
   # HeyGen API Configuration
   VITE_HEYGEN_API_KEY=your_heygen_api_key_here

   # OpenAI API Configuration
   VITE_OPENAI_API_KEY=your_openai_api_key_here

   # ElevenLabs API Configuration
   VITE_ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

   # Inactivity Auto-Disconnect Configuration (Optional)
   # Timeout in minutes (0 = disabled, default = 5)
   VITE_INACTIVITY_TIMEOUT_MINUTES=5

   # Warning time in seconds before disconnect (default = 30)
   VITE_INACTIVITY_WARNING_SECONDS=30
   ```

3. **Get your API keys:**
   - **HeyGen API Key**: Sign up at [HeyGen](https://heygen.com) and get your API key from the dashboard
   - **OpenAI API Key**: Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - **ElevenLabs API Key**: Get your API key from [ElevenLabs](https://elevenlabs.io) for speech-to-text

4. **Configure inactivity timeout (Optional):**
   The app automatically disconnects inactive sessions to save resources. Configure these settings:

   - **`VITE_INACTIVITY_TIMEOUT_MINUTES`**: Minutes of inactivity before disconnect (default: 5)
     - Set to `0` to disable auto-disconnect
     - Recommended: 5-15 minutes for production

   - **`VITE_INACTIVITY_WARNING_SECONDS`**: Warning time before disconnect (default: 30)
     - Must be less than the timeout duration

   **Examples:**
   ```env
   # Quick demo sessions (2 minutes)
   VITE_INACTIVITY_TIMEOUT_MINUTES=2
   VITE_INACTIVITY_WARNING_SECONDS=15

   # Long training sessions (15 minutes)
   VITE_INACTIVITY_TIMEOUT_MINUTES=15
   VITE_INACTIVITY_WARNING_SECONDS=60

   # Disabled (no auto-disconnect)
   VITE_INACTIVITY_TIMEOUT_MINUTES=0
   ```

## Usage

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. **Open your browser:**
   Navigate to `http://localhost:5173`

7. **Interact with the avatar:**
   - Click "Start Session" to initialize the avatar
   - Type your message in the input field
   - Click "Speak" to send your message to the avatar
   - The avatar will respond using OpenAI Assistant and speak the response

## Project Structure

```
src/
├── main.ts              # Main application logic with HeyGen SDK integration
├── openai-assistant.ts  # OpenAI Assistant wrapper class
├── style.css           # Application styles
└── counter.ts          # Example counter component (unused)

index.html              # Main HTML template
package.json            # Dependencies and scripts
tsconfig.json          # TypeScript configuration
.env                   # Environment variables (create this)
```

## Key Components

### Main Application (`src/main.ts`)
- Manages HeyGen streaming avatar session
- Handles user interactions and speech synthesis
- Integrates with OpenAI Assistant for responses
- Provides error handling and loading states

### OpenAI Assistant (`src/openai-assistant.ts`)
- Wraps OpenAI Assistant API
- Manages conversation threads
- Provides English tutoring functionality
- Handles API communication securely

## API Integration

### HeyGen Streaming Avatar SDK
- Uses `@heygen/streaming-avatar` package
- Integrates with LiveKit for real-time streaming
- Supports high-quality avatar rendering
- Handles session management and token authentication

### OpenAI Assistant API
- Uses OpenAI's Assistant API for intelligent responses
- Configured as an English tutor
- Manages conversation context
- Provides structured responses

## Security Best Practices

⚠️ **Important**: The current implementation exposes API keys in the frontend. For production use, consider:

1. **Backend API Endpoint**: Move token generation to a backend service
2. **Environment Variables**: Never commit API keys to version control
3. **Rate Limiting**: Implement rate limiting for API calls
4. **CORS Configuration**: Configure proper CORS settings

## Troubleshooting

### Common Issues

1. **"API key not found" error:**
   - Ensure your `.env` file exists and contains valid API keys
   - Restart the development server after adding environment variables

2. **Avatar not loading:**
   - Check your HeyGen API key validity
   - Verify network connectivity
   - Check browser console for error messages

3. **OpenAI responses not working:**
   - Verify your OpenAI API key has sufficient credits
   - Check if the API key has proper permissions

### Debug Mode

Enable debug logging by opening browser developer tools and checking the console for detailed error messages.

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Dependencies

- `@heygen/streaming-avatar` - HeyGen streaming avatar SDK
- `livekit-client` - LiveKit client for real-time communication
- `openai` - OpenAI JavaScript SDK
- `vite` - Build tool and development server
- `typescript` - TypeScript support

## License

This project is for demonstration purposes. Please ensure you comply with HeyGen and OpenAI's terms of service when using their APIs.

## Support

For issues related to:
- **HeyGen SDK**: Check [HeyGen Documentation](https://docs.heygen.com)
- **OpenAI API**: Check [OpenAI Documentation](https://platform.openai.com/docs)
- **This Demo**: Create an issue in this repository

