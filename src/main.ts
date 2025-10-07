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
const userInput = document.getElementById("userInput") as HTMLInputElement;
const progressSection = document.getElementById("progressSection") as HTMLElement;
const progressFill = document.getElementById("progressFill") as HTMLElement;
const progressText = document.getElementById("progressText") as HTMLElement;
const avatarSubtitle = document.getElementById("avatarSubtitle") as HTMLElement;
const textInputArea = document.getElementById("textInputArea") as HTMLElement;
const textInputBtn = document.getElementById("textInputBtn") as HTMLButtonElement;
const languageSelect = document.getElementById("languageSelect") as HTMLSelectElement;
const chatMessages = document.getElementById("chatMessages") as HTMLElement;
const clearChatBtn = document.getElementById("clearChatBtn") as HTMLButtonElement;

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
      
      // Update subtitle with the response
      updateSubtitle(output);
      
      // Add bot response to chat
      addChatMessage(output, false);
      
      // Make avatar speak the API response
      await avatar.speak({
        text: output,
        task_type: TaskType.TALK,
        taskMode: TaskMode.SYNC
      });
      
    } catch (error) {
      console.error("Error processing speech:", error);
      if (progressSection) {
        progressSection.style.display = "none";
      }
      // Add error message to chat
      addChatMessage("Sorry, I couldn't process your voice message. Please try again.", false);
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
      if (progressText) {
        progressText.textContent = "Avatar is speaking...";
      }
      // Show progress overlay
      if (progressSection) {
        progressSection.style.display = "block";
      }
    });

    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (data) => {
      console.log("⏹️ Avatar stopped talking", data);
      // Hide progress overlay
      if (progressSection) {
        progressSection.style.display = "none";
      }
      // Re-enable controls
      if (speakButton) {
        speakButton.disabled = false;
      }
      if (recordButton) {
        recordButton.disabled = false;
      }
    });
    
    // Use default Wayne avatar
    console.log("🚀 Using default Wayne avatar for immediate functionality");
    
    sessionData = await avatar.createStartAvatar({
      quality: AvatarQuality.High,
      avatarName: "Wayne_20240711",
      language: "English",
    });
    
    console.log("✅ Default Wayne avatar is working!", sessionData);

    console.log("Session data:", sessionData);

    // Hide welcome screen and show avatar interface
    welcomeScreen.style.display = "none";
    avatarInterface.style.display = "flex";
    avatarInterface.classList.add("fade-in");
    
    // Update subtitle with welcome message
    if (avatarSubtitle) {
      avatarSubtitle.textContent = "Hello, I am here to help you on your queries on insurance";
    }

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
  console.log("handleSpeak called");
  if (!avatar) {
    console.error("Avatar not initialized");
    return;
  }
  
  if (!userInput.value || userInput.value.trim() === "") {
    console.log("No input text");
    return;
  }
    // Disable speak button and show loading state
    speakButton.disabled = true;
    speakButton.innerHTML = `
      <svg class="loading-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
      </svg>
    `;
    
    // Show progress indicator
    if (progressSection) {
      progressSection.style.display = "block";
    }
    if (progressFill) {
      progressFill.style.width = "0%";
    }
    if (progressText) {
      progressText.textContent = "Processing...";
    }
    
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
      
      // Add user message to chat
      addChatMessage(userMessage, true);
      
      // Update subtitle with the response
      updateSubtitle(output);
      
      // Add bot response to chat
      addChatMessage(output, false);
      
      // Keep text input area visible for continuous typing
      // Don't hide text input area - let user continue typing
      
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
      
      // Add error message to chat
      addChatMessage("Sorry, I encountered an error. Please try again.", false);
      
      // Hide progress indicator and reset button state
      if (progressSection) {
        progressSection.style.display = "none";
      }
      if (speakButton) {
        speakButton.disabled = false;
        speakButton.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
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

  // Only return to welcome screen if it's an actual disconnection
  // Don't redirect for normal avatar responses
  console.log("Stream disconnected - but staying in avatar interface for now");
  // Commented out the redirect to prevent unwanted page changes
  // avatarInterface.style.display = "none";
  // welcomeScreen.style.display = "flex";
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
  if (event.key === "Enter") {
    event.preventDefault(); // Prevent form submission
    event.stopPropagation(); // Stop event bubbling
    if (!speakButton.disabled) {
      handleSpeak();
    }
  }
});

// Also add keydown listener as backup
userInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault(); // Prevent form submission
    event.stopPropagation(); // Stop event bubbling
    if (!speakButton.disabled) {
      handleSpeak();
    }
  }
});

// New interface event listeners
if (textInputBtn) {
  textInputBtn.addEventListener("click", () => {
    console.log("Text input clicked");
    // Show text input area and hide voice controls
    if (textInputArea) {
      textInputArea.style.display = "flex";
      // Hide voice button when text is active
      if (recordButton) {
        recordButton.style.display = "none";
      }
      setTimeout(() => {
        if (userInput) {
          userInput.focus();
        }
      }, 100);
    }
  });
}

// Show voice button when voice is selected
if (recordButton) {
  recordButton.addEventListener("click", () => {
    // Show voice button and hide text input
    if (textInputArea) {
      textInputArea.style.display = "none";
    }
    if (recordButton) {
      recordButton.style.display = "flex";
    }
  });
}

// Clear chat functionality
if (clearChatBtn) {
  clearChatBtn.addEventListener("click", () => {
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="chat-message bot-message">
          <div class="message-content">
            Chat history cleared. How can I help you today?
          </div>
          <div class="message-time">Just now</div>
        </div>
      `;
    }
  });
}

if (languageSelect) {
  languageSelect.addEventListener("change", (event) => {
    const selectedLanguage = (event.target as HTMLSelectElement).value;
    console.log("Language changed to:", selectedLanguage);
    // Update avatar language if needed
    // This would require reinitializing the avatar with new language
  });
}

// Update subtitle when avatar speaks
function updateSubtitle(text: string) {
  if (avatarSubtitle) {
    avatarSubtitle.textContent = text;
  }
}

// Add message to chat history
function addChatMessage(message: string, isUser: boolean = false) {
  if (chatMessages) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'user-message' : 'bot-message'}`;
    
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
      <div class="message-content">${message}</div>
      <div class="message-time">${timeString}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}