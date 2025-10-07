import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskMode,
  TaskType
} from "@heygen/streaming-avatar";
import { VoiceRecorder } from "./audio-handler";

// DOM Elements
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
const recordingStatus = document.getElementById("recordingStatus") as HTMLDivElement;
const chatMessages = document.getElementById("chatMessages") as HTMLElement;
const toggleTextInputBtn = document.getElementById("toggleTextInput") as HTMLButtonElement;
const textInputSection = document.getElementById("textInputSection") as HTMLElement;
const chatInput = document.getElementById("chatInput") as HTMLInputElement;
const sendChatButton = document.getElementById("sendChatButton") as HTMLButtonElement;

// All DOM elements are properly referenced

// Initialize with a test message
setTimeout(() => {
  if (chatMessages) {
    addMessageToHistory('avatar', 'Hello! I am here to help you with your queries. Click the microphone button to start talking or use the text input.');
  }
}, 1000);

// Check microphone availability on page load
async function checkMicrophoneAvailability(): Promise<void> {
  const isAvailable = await VoiceRecorder.isMicrophoneAvailable();
  if (!isAvailable) {
    console.warn('Microphone access not available. Voice recording will not work.');
    if (recordingStatus) {
      recordingStatus.textContent = '⚠️ Voice recording requires HTTPS in production';
      setTimeout(() => {
        if (recordingStatus) recordingStatus.textContent = '';
      }, 3000);
    }
    // Disable the record button if microphone is not available
    if (recordButton) {
      recordButton.disabled = true;
      recordButton.title = 'Microphone access not available. Please use HTTPS.';
      recordButton.style.opacity = '0.5';
    }
  }
}

// Check microphone availability when the page loads
checkMicrophoneAvailability();

// Application State
let avatar: StreamingAvatar | null = null;
let sessionData: any = null;
let voiceRecorder: VoiceRecorder | null = null;
let isRecording = false;
let chatHistory: Array<{role: 'user' | 'avatar', message: string, timestamp: Date}> = [];

/**
 * Fetches access token from HeyGen API for avatar streaming
 * @returns Promise<string> - The access token
 */
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
  
  if (!data?.token) {
    throw new Error("Invalid response from HeyGen API");
  }
  
  return data.token;
}

/**
 * Adds a message to the chat history
 * @param role - The role of the message sender ('user' or 'avatar')
 * @param message - The message content
 */
function addMessageToHistory(role: 'user' | 'avatar', message: string): void {
  const newMessage = { 
    role, 
    message, 
    timestamp: new Date() 
  };
  
  chatHistory.push(newMessage);
  
  // Always update chat display since it's now always visible
  updateChatDisplay();
}

/**
 * Updates the chat display with current chat history
 */
function updateChatDisplay(): void {
  if (!chatMessages) {
    return;
  }
  
  chatMessages.innerHTML = '';
  
  if (chatHistory.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <div style="text-align: center; color: #9ca3af; padding: 2rem;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem; opacity: 0.5;">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p style="margin: 0; font-size: 0.9rem;">No messages yet</p>
        <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem; opacity: 0.7;">Start chatting to see your conversation history</p>
      </div>
    `;
    chatMessages.appendChild(emptyState);
    return;
  }
  
  // Render each message
  chatHistory.forEach((msg) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.role}`;
    
    const timeStr = msg.timestamp.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    messageDiv.innerHTML = `
      <div class="message-content">${msg.message}</div>
      <div class="message-time">${timeStr}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
  });
  
  // Auto-scroll to latest message
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Toggles the text input section visibility
 */
function toggleTextInput(): void {
  if (!textInputSection) {
    return;
  }
  
  if (textInputSection.style.display === 'none') {
    textInputSection.style.display = 'block';
  } else {
    textInputSection.style.display = 'none';
  }
}

/**
 * Handles chat input from the chat panel
 */
async function handleChatInput(): Promise<void> {
  if (!chatInput || !chatInput.value.trim()) return;
  
  const userMessage = chatInput.value.trim();
  chatInput.value = ''; // Clear input immediately
  
  // Add user message to chat history
  addMessageToHistory('user', userMessage);
  
  // Show progress indicator
  if (progressSection) {
    progressSection.style.display = "block";
    if (progressFill) progressFill.style.width = "0%";
    if (progressText) progressText.textContent = "Getting AI response...";
  }
  
  try {
    const response = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage })
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const { output } = await response.json();
    
    // Add avatar response to chat history
    addMessageToHistory('avatar', output);
    
    // Make avatar speak the response if available
    if (avatar) {
      if (progressText) progressText.textContent = "Avatar is speaking...";
      
      await avatar.speak({
        text: output,
        task_type: TaskType.TALK,
        taskMode: TaskMode.SYNC
      });
    }

  } catch (error) {
    console.error("Error getting response:", error);
    const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    addMessageToHistory('avatar', errorMessage);
    
    if (progressSection) {
      progressSection.style.display = "none";
    }
  }
}

/**
 * Processes voice input and generates avatar response
 * @param text - The transcribed text from voice input
 */
async function speakText(text: string): Promise<void> {
  if (!avatar || !text.trim()) return;
  
  // Add user message to chat history
  addMessageToHistory('user', text);
  
  // Show progress indicator
  progressSection.style.display = "block";
  progressFill.style.width = "0%";
  progressText.textContent = "Getting AI response...";
  
  try {
    // Send to API endpoint
    const response = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const responseData = await response.json();
    const output = responseData.output || responseData.message || responseData.text || 'No response received';
    
    progressText.textContent = "Avatar is speaking...";
    
    // Add avatar response to chat history
    addMessageToHistory('avatar', output);
    
    // Make avatar speak the API response
    await avatar.speak({
      text: output,
      task_type: TaskType.TALK,
      taskMode: TaskMode.SYNC
    });
    
  } catch (error) {
    // Error processing speech - handled by UI feedback
    const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    addMessageToHistory('avatar', errorMessage);
    progressSection.style.display = "none";
  }
}

/**
 * Initializes the voice recorder with callbacks
 */
function initializeVoiceRecorder(): void {
  voiceRecorder = new VoiceRecorder(
    (status) => { 
      recordingStatus.textContent = status;
    },
    (text) => {
      speakText(text);
    }
  );
}

/**
 * Toggles voice recording on/off
 */
async function toggleRecording(): Promise<void> {
  if (!recordButton) {
    return;
  }
  
  // Check if microphone is available before trying to record
  const isMicrophoneAvailable = await VoiceRecorder.isMicrophoneAvailable();
  if (!isMicrophoneAvailable) {
    if (recordingStatus) {
      recordingStatus.textContent = '❌ Microphone access not available. Please use HTTPS or check permissions.';
      setTimeout(() => {
        if (recordingStatus) recordingStatus.textContent = '';
      }, 5000);
    }
    return;
  }
  
  if (!voiceRecorder) {
    initializeVoiceRecorder();
  }

  if (!isRecording) {
    // Start recording
    recordButton.classList.add("recording");
    await voiceRecorder?.startRecording();
    isRecording = true;
  } else {
    // Stop recording
    recordButton.classList.remove("recording");
    voiceRecorder?.stopRecording();
    isRecording = false;
  }
}


/**
 * Initializes the streaming avatar session
 */
async function initializeAvatarSession(): Promise<void> {
  // Disable get started button and show loading state
  getStartedBtn.disabled = true;
  getStartedBtn.innerHTML = '<span>Loading...</span>';

  try {
    const token = await fetchAccessToken();
    avatar = new StreamingAvatar({ token });

    // Set up avatar event listeners
    avatar.on(StreamingEvents.STREAM_READY, handleStreamReady);
    avatar.on(StreamingEvents.STREAM_DISCONNECTED, handleStreamDisconnected);
    avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
      progressText.textContent = "Avatar is speaking...";
    });

    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
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
      avatarName: "66008d91cfee459689ab288e56eb773f",
      language: "English",
      voice:{
        voiceId: "caf3267cce8e4807b190cc45d4a46dcc"
      }
    });

    //  sessionData = await avatar.createStartAvatar({
    //   quality: AvatarQuality.High,
    //   avatarName: "66008d91cfee459689ab288e56eb773f",
    //   language: "en",
    //   voice: {
    //     voiceId: "faec447a92f14ab88e4dddf453986637",
    //     rate: 1.0 
    //   }
    // });

    // Hide welcome screen and show avatar interface
    welcomeScreen.style.display = "none";
    avatarInterface.style.display = "flex";
    avatarInterface.classList.add("fade-in");

  } catch (error) {
    // Failed to initialize avatar session - handled by alert
    alert(`Failed to initialize avatar session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Re-enable get started button if initialization fails
    getStartedBtn.disabled = false;
    getStartedBtn.innerHTML = '<span>Get Started</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
}

/**
 * Handles text input and generates avatar response
 */
async function handleSpeak(): Promise<void> {
  if (!avatar || !userInput.value.trim()) return;
  
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
    const response = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage })
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const { output } = await response.json();
    
    // Add user message to chat history
    addMessageToHistory('user', userMessage);
    
    // Add avatar response to chat history
    addMessageToHistory('avatar', output);
    
    // Make avatar speak the response
    await avatar.speak({
      text: output,
      task_type: TaskType.TALK,
      taskMode: TaskMode.SYNC
    });

  } catch (error) {
    // Error getting response - handled by alert
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

/**
 * Handles when avatar stream is ready
 * @param event - The stream ready event
 */
function handleStreamReady(event: any): void {
  if (event.detail && videoElement) {
    videoElement.srcObject = event.detail;
    videoElement.onloadedmetadata = () => {
      videoElement.play().catch(() => {
        // Video play failed - this is handled silently
      });
    };
  } else {
    // Stream is not available - handled silently
  }
}

/**
 * Handles stream disconnection
 */
function handleStreamDisconnected(): void {
  if (videoElement) {
    videoElement.srcObject = null;
  }

  // Return to welcome screen
  avatarInterface.style.display = "none";
  welcomeScreen.style.display = "flex";
}

/**
 * Terminates the avatar session and resets UI
 */
async function terminateAvatarSession(): Promise<void> {
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
  recordingStatus.textContent = "";
  
  // Re-enable get started button
  getStartedBtn.disabled = false;
  getStartedBtn.innerHTML = '<span>Get Started</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}


// Event Listeners
if (getStartedBtn) getStartedBtn.addEventListener("click", initializeAvatarSession);
if (endButton) endButton.addEventListener("click", terminateAvatarSession);
if (speakButton) speakButton.addEventListener("click", handleSpeak);
if (recordButton) recordButton.addEventListener("click", toggleRecording);
if (toggleTextInputBtn) toggleTextInputBtn.addEventListener("click", toggleTextInput);
if (sendChatButton) sendChatButton.addEventListener("click", handleChatInput);

// Enter key listener for input field
if (userInput) {
  userInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter" && speakButton && !speakButton.disabled) {
      event.preventDefault();
      handleSpeak();
    }
  });
}

// Enter key listener for chat input
if (chatInput) {
  chatInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleChatInput();
    }
  });
}