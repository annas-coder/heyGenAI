import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskMode,
  TaskType
} from "@heygen/streaming-avatar";

// import { OpenAIAssistant } from "./openai-assistant";
import { VoiceRecorder } from "./audio-handler";

// let openaiAssistant: OpenAIAssistant | null = null;

// DOM elements
const videoElement = document.getElementById("avatarVideo") as HTMLVideoElement;
const welcomeScreen = document.getElementById("welcomeScreen") as HTMLElement;
const avatarInterface = document.getElementById("avatarInterface") as HTMLElement;
const getStartedBtn = document.getElementById("getStartedBtn") as HTMLButtonElement;
const endButton = document.getElementById("endSession") as HTMLButtonElement;
const speakButton = document.getElementById("speakButton") as HTMLButtonElement;
const recordButton = document.getElementById("recordButton") as HTMLButtonElement;
const waveformContainer = document.getElementById("waveformContainer") as HTMLElement;
const userInput = document.getElementById("userInput") as HTMLInputElement;
const progressSection = document.getElementById("progressSection") as HTMLElement;
const progressFill = document.getElementById("progressFill") as HTMLElement;
const progressText = document.getElementById("progressText") as HTMLElement;
const recordingStatus = document.getElementById("recordingStatus") as HTMLDivElement;

let avatar: StreamingAvatar | null = null;
let sessionData: any = null;
let voiceRecorder: VoiceRecorder | null = null;
let isRecording = false;

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

// Speech-to-speech functionality
async function speakText(text: string) {
  if (avatar && text.trim()) {
    // Show progress indicator
    progressSection.style.display = "block";
    progressFill.style.width = "0%";
    progressText.textContent = "Getting AI response...";
    
    try {
      console.log('Sending transcribed text to API:', text);
      
      // Send to your API endpoint
      const llmResponse = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      
      console.log('API Response:', llmResponse);
      const { output } = await llmResponse.json();
      
      console.log('AI Response text:', output);
      progressText.textContent = "Avatar is speaking...";
      
      // Make avatar speak the API response
      await avatar.speak({
        text: output,
        task_type: TaskType.TALK,
        taskMode: TaskMode.SYNC
      });
      
    } catch (error) {
      console.error("Error processing speech:", error);
      progressSection.style.display = "none";
    }
  }
}

function initializeVoiceRecorder() {
  voiceRecorder = new VoiceRecorder(
    (status) => { 
      recordingStatus.textContent = status;
    },
    (text) => {
      speakText(text);
    }
  );
}

async function toggleRecording() {
  if (!voiceRecorder) {
    initializeVoiceRecorder();
  }

  if (!isRecording) {
    // Start recording
    recordButton.classList.add("recording");
    waveformContainer.classList.add("active");
    await voiceRecorder?.startRecording();
    isRecording = true;
  } else {
    // Stop recording
    recordButton.classList.remove("recording");
    waveformContainer.classList.remove("active");
    voiceRecorder?.stopRecording();
    isRecording = false;
  }
}


// Initialize streaming avatar session
async function initializeAvatarSession() {
  // Disable get started button and show loading state
  getStartedBtn.disabled = true;
  getStartedBtn.innerHTML = '<span>Loading...</span>';

  try {
    const token = await fetchAccessToken();
    avatar = new StreamingAvatar({ token });

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
      // Update progress text while avatar is speaking
      progressText.textContent = "Avatar is speaking...";
    });

    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (data) => {
      console.log("⏹️ Avatar stopped talking", data);
      // Re-enable speak button after avatar finishes speaking
      progressSection.style.display = "none";
      speakButton.disabled = false;
      speakButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        <span>Send</span>
      `;
    });
    
    sessionData = await avatar.createStartAvatar({
      quality: AvatarQuality.High,
      avatarName: "Wayne_20240711",
      language: "English",
    });

    console.log("Session data:", sessionData);

    // Hide welcome screen and show avatar interface
    welcomeScreen.style.display = "none";
    avatarInterface.style.display = "flex";
    avatarInterface.classList.add("fade-in");

  } catch (error) {
    console.error("Failed to initialize avatar session:", error);
    alert(`Failed to initialize avatar session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    // Re-enable get started button if initialization fails
    getStartedBtn.disabled = false;
    getStartedBtn.innerHTML = '<span>Get Started</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
}

// Handle speaking event with streaming (HeyGen recommended approach)
async function handleSpeak() {
  if (avatar && userInput.value) {
    // Disable speak button and show loading state
    speakButton.disabled = true;
    speakButton.innerHTML = `
      <svg class="loading-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
      </svg>
      <span>Sending...</span>
    `;
    
    // Show progress indicator
    progressSection.style.display = "block";
    progressFill.style.width = "0%";
    progressText.textContent = "Processing...";
    
    const userMessage = userInput.value;
    userInput.value = ""; // Clear input immediately
    
    
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

      // Note: Button will be re-enabled when AVATAR_STOP_TALKING event fires

    } catch (error) {
      console.error("Error getting streaming response:", error);
      alert(`Error getting response: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Hide progress indicator and reset button state
      progressSection.style.display = "none";
      speakButton.disabled = false;
      speakButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        <span>Send</span>
      `;
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

  // Return to welcome screen
  avatarInterface.style.display = "none";
  welcomeScreen.style.display = "flex";
}

// End the avatar session
async function terminateAvatarSession() {
  if (!avatar || !sessionData) return;

  await avatar.stopAvatar();
  videoElement.srcObject = null;
  avatar = null;
  
  // Hide avatar interface and show welcome screen
  avatarInterface.style.display = "none";
  welcomeScreen.style.display = "flex";
  
  // Reset UI elements
  userInput.value = "";
  progressSection.style.display = "none";
  speakButton.disabled = false;
  speakButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"></line>
      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
    <span>Send</span>
  `;
  
  // Reset recording state
  if (isRecording && voiceRecorder) {
    voiceRecorder.stopRecording();
    isRecording = false;
  }
  recordButton.classList.remove("recording");
  waveformContainer.classList.remove("active");
  recordingStatus.textContent = "";
  
  // Re-enable get started button
  getStartedBtn.disabled = false;
  getStartedBtn.innerHTML = '<span>Get Started</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}


// Event listeners for buttons
getStartedBtn.addEventListener("click", initializeAvatarSession);
endButton.addEventListener("click", terminateAvatarSession);
speakButton.addEventListener("click", handleSpeak);
recordButton.addEventListener("click", toggleRecording);

// Add Enter key listener for input field
userInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter" && !speakButton.disabled) {
    handleSpeak();
  }
});