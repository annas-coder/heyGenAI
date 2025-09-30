import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskMode,
  TaskType
} from "@heygen/streaming-avatar";

import { OpenAIAssistant } from "./openai-assistant";

let openaiAssistant: OpenAIAssistant | null = null;

// DOM elements
const videoElement = document.getElementById("avatarVideo") as HTMLVideoElement;
const startButton = document.getElementById(
  "startSession"
) as HTMLButtonElement;
const endButton = document.getElementById("endSession") as HTMLButtonElement;
const speakButton = document.getElementById("speakButton") as HTMLButtonElement;
const userInput = document.getElementById("userInput") as HTMLInputElement;
const progressSection = document.getElementById("progressSection") as HTMLElement;
const progressFill = document.getElementById("progressFill") as HTMLElement;
const progressText = document.getElementById("progressText") as HTMLElement;

let avatar: StreamingAvatar | null = null;
let sessionData: any = null;

// Helper function to fetch access token
async function fetchAccessToken(): Promise<string> {
  const apiKey = import.meta.env.VITE_HEYGEN_API_KEY;
  
  if (!apiKey) {
    throw new Error("HeyGen API key not found. Please set VITE_HEYGEN_API_KEY in your .env file.");
  }

  const response = await fetch(
    "https://api.heygen.com/v1/streaming.create_token",
    {
      method: "POST",
      headers: { "x-api-key": apiKey },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch access token: ${response.status} ${response.statusText}`);
  }

  const { data } = await response.json();
  
  if (!data || !data.token) {
    throw new Error("Invalid response from HeyGen API");
  }
  
  return data.token;
}


// Initialize streaming avatar session
async function initializeAvatarSession() {
  // Disable start button immediately to prevent double clicks
  startButton.disabled = true;
  startButton.textContent = "Starting...";

  try {
    const token = await fetchAccessToken();
    avatar = new StreamingAvatar({ token });` `

    // Initialize OpenAI Assistant
    const openaiApiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error("OpenAI API key not found. Please set VITE_OPENAI_API_KEY in your .env file.");
    }
    
    // openaiAssistant = new OpenAIAssistant(openaiApiKey);
    // await openaiAssistant.initialize();
    
    avatar.on(StreamingEvents.STREAM_READY, handleStreamReady);
    avatar.on(StreamingEvents.STREAM_DISCONNECTED, handleStreamDisconnected);
    avatar.on(StreamingEvents.AVATAR_START_TALKING, (data) => {
      console.log("▶️ Avatar started talking", data);
    });

    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (data) => {
      console.log("⏹️ Avatar stopped talking", data);
    });
    
    sessionData = await avatar.createStartAvatar({
      quality: AvatarQuality.High,
      avatarName: "Wayne_20240711",
      language: "English",
    });

    console.log("Session data:", sessionData);

    // Enable end button
    endButton.disabled = false;
    startButton.textContent = "Start Session";

  } catch (error) {
    console.error("Failed to initialize avatar session:", error);
    alert(`Failed to initialize avatar session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    // Re-enable start button if initialization fails
    startButton.disabled = false;
    startButton.textContent = "Start Session";
  }
}

// Handle speaking event with streaming (HeyGen recommended approach)
async function handleSpeak() {
  if (avatar && userInput.value) {
    // Disable speak button and show loading state
    speakButton.disabled = true;
    speakButton.textContent = "Processing...";
    
    // Show progress indicator
    progressSection.style.display = "block";
    progressFill.style.width = "0%";
    progressText.textContent = "Processing...";
    
    const userMessage = userInput.value;
    // userInput.value = ""; // Clear input immediately
    
    
    try {
      
      const llmResponse = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      console.log(llmResponse)
      const { output } = await llmResponse.json();
      
      // First, let the avatar acknowledge the user input
      if (avatar ) {
        await avatar.speak({
          text: output,
          task_type: TaskType.TALK,
          taskMode: TaskMode.SYNC
        });
      }

    } catch (error) {
      console.error("Error getting streaming response:", error);
      alert(`Error getting response: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Hide progress indicator and reset button state
      progressSection.style.display = "none";
      speakButton.disabled = false;
      speakButton.textContent = "Speak";
    }
  }
}

// Handle when avatar stream is ready
function handleStreamReady(event: any) {
  if (event.detail && videoElement) {
    videoElement.srcObject = event.detail;
    videoElement.onloadedmetadata = () => {
      videoElement.play().catch(console.error);
    };
  } else {
    console.error("Stream is not available");
  }
}

// Handle stream disconnection
function handleStreamDisconnected() {
  console.log("Stream disconnected");
  if (videoElement) {
    videoElement.srcObject = null;
  }

  // Enable start button and disable end button
  startButton.disabled = false;
  endButton.disabled = true;
}

// End the avatar session
async function terminateAvatarSession() {
  if (!avatar || !sessionData) return;

  await avatar.stopAvatar();
  videoElement.srcObject = null;
  avatar = null;
}


// Event listeners for buttons
startButton.addEventListener("click", initializeAvatarSession);
endButton.addEventListener("click", terminateAvatarSession);
speakButton.addEventListener("click", handleSpeak);