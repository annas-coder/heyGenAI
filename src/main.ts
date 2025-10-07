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
const closeChatBtn = document.getElementById("closeChatBtn") as HTMLButtonElement;
// const voiceModeBtn = document.getElementById("voiceModeBtn") as HTMLButtonElement;
const chatSidebar = document.querySelector(".chat-sidebar") as HTMLElement;
const avatarMainContent = document.querySelector(".avatar-main-content") as HTMLElement;
const recordingStatus = document.getElementById("recordingStatus") as HTMLElement;
const waveformContainer = document.querySelector(".waveform-container") as HTMLElement;

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
  console.log("🎤 speakText called with:", text);
  
  if (!avatar) {
    console.error("❌ Avatar not initialized");
    addChatMessage("Avatar not ready. Please try again.", false);
    return;
  }
  
  // Check if avatar is in a good state
  if (avatar.getStatus && avatar.getStatus() !== 'ready') {
    console.log("🎤 Avatar not ready, current status:", avatar.getStatus());
    addChatMessage("Avatar is not ready. Please wait a moment and try again.", false);
    return;
  }
  
  if (!text || !text.trim()) {
    console.error("❌ Empty text provided");
    return;
  }
  
  try {
    console.log('🎤 Processing voice input:', text);
    
    // Show progress indicator
    if (progressSection) {
      progressSection.style.display = "block";
    }
    if (progressFill) {
      progressFill.style.width = "0%";
    }
    if (progressText) {
      progressText.textContent = "Getting AI response...";
    }
    
    // Send to your API endpoint
    console.log('📡 Sending to API:', text);
    const llmResponse = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    
    console.log('📡 API Response status:', llmResponse.status);
    
    if (!llmResponse.ok) {
      throw new Error(`API request failed with status ${llmResponse.status}`);
    }
    
    const responseData = await llmResponse.json();
    console.log('📡 API Response data:', responseData);
    
    const output = responseData.output || responseData.message || "I didn't understand that. Please try again.";
    console.log('🤖 AI Response text:', output);
    
    if (progressText) {
      progressText.textContent = "Avatar is speaking...";
    }
    
    // Update subtitle with the response
    updateSubtitle(output);
    
    // Add bot response to chat
    addChatMessage(output, false);
    
    // Make avatar speak the API response
    console.log('🎭 Making avatar speak:', output);
    await avatar.speak({
      text: output,
      task_type: TaskType.TALK,
      taskMode: TaskMode.SYNC
    });
    
    console.log('✅ Avatar speaking completed');
    
  } catch (error) {
    console.error("❌ Error processing speech:", error);
    if (progressSection) {
      progressSection.style.display = "none";
    }
    // Add error message to chat
    addChatMessage("Sorry, I couldn't process your voice message. Please try again.", false);
  }
}

function initializeVoiceRecorder() {
  console.log("🎤 Initializing voice recorder...");
  voiceRecorder = new VoiceRecorder(
    (status) => { 
      console.log("🎤 Status:", status);
      if (recordingStatus) {
        recordingStatus.textContent = status;
        if (status) {
          recordingStatus.style.display = "flex";
        } else {
          recordingStatus.style.display = "none";
        }
      }
    },
    (text) => {
      console.log("🎤 Transcription received:", text);
      if (text && text.trim().length > 0) {
        console.log("🎤 Processing transcribed text:", text);
        // Add user message to chat
        addChatMessage(text, true);
        // Process the text
        speakText(text);
      } else {
        console.log("🎤 Empty transcription, not processing");
        addChatMessage("I didn't catch that. Please try speaking again.", false);
      }
      // Hide recording status after transcription
      if (recordingStatus) {
        recordingStatus.style.display = "none";
      }
    }
  );
}

async function toggleRecording() {
  try {
    console.log("🎤 toggleRecording called, isRecording:", isRecording);
    
    if (!voiceRecorder) {
      console.log("🎤 Creating new voice recorder...");
      initializeVoiceRecorder();
      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!isRecording) {
      console.log("🎤 Starting recording...");
      // Start recording
      if (recordButton) {
        recordButton.classList.add("recording");
      }
      if (waveformContainer) {
        waveformContainer.classList.add("active");
      }
      if (recordingStatus) {
        recordingStatus.style.display = "flex";
        recordingStatus.textContent = "🎤 Recording... Speak now!";
      }
      await voiceRecorder?.startRecording();
      isRecording = true;
      console.log("🎤 Recording started successfully");
    } else {
      console.log("🎤 Stopping recording...");
      // Stop recording
      if (recordButton) {
        recordButton.classList.remove("recording");
      }
      if (waveformContainer) {
        waveformContainer.classList.remove("active");
      }
      if (recordingStatus) {
        recordingStatus.textContent = "🔄 Processing audio...";
      }
      voiceRecorder?.stopRecording();
      isRecording = false;
      console.log("🎤 Recording stopped successfully");
    }
  } catch (error) {
    console.error("❌ Error in toggleRecording:", error);
    // Reset recording state on error
    isRecording = false;
    if (recordButton) {
      recordButton.classList.remove("recording");
    }
    if (waveformContainer) {
      waveformContainer.classList.remove("active");
    }
    if (recordingStatus) {
      recordingStatus.textContent = "❌ Recording error. Please try again.";
    }
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
      // Show speaking indicator instead of progress overlay
      const speakingIndicator = document.getElementById('avatarSpeakingIndicator');
      if (speakingIndicator) {
        speakingIndicator.style.display = "flex";
      }
      // Hide progress overlay during speaking
      if (progressSection) {
        progressSection.style.display = "none";
      }
      // Hide subtitle text when avatar is speaking
      if (avatarSubtitle) {
        avatarSubtitle.style.display = "none";
      }
      // Ensure avatar interface stays visible
      if (avatarInterface) {
        avatarInterface.style.display = "flex";
      }
      // Disable all input during speaking to prevent interruptions
      if (speakButton) {
        speakButton.disabled = true;
      }
      if (recordButton) {
        recordButton.disabled = true;
      }
      if (userInput) {
        userInput.disabled = true;
      }
    });

    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (data) => {
      console.log("⏹️ Avatar stopped talking", data);
      // Hide speaking indicator
      const speakingIndicator = document.getElementById('avatarSpeakingIndicator');
      if (speakingIndicator) {
        speakingIndicator.style.display = "none";
      }
      // Show subtitle text again when avatar stops speaking
      if (avatarSubtitle) {
        avatarSubtitle.style.display = "block";
      }
      // Hide progress overlay
      if (progressSection) {
        progressSection.style.display = "none";
      }
      // Re-enable all controls after speaking is complete
      if (speakButton) {
        speakButton.disabled = false;
        speakButton.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        `;
      }
      if (recordButton) {
        recordButton.disabled = false;
      }
      if (userInput) {
        ensureInputEnabled();
        userInput.focus();
        console.log("Input re-enabled after avatar stopped talking");
      }
      // Ensure avatar interface stays visible
      if (avatarInterface) {
        avatarInterface.style.display = "flex";
      }
    });
    
    // Use your custom avatar with specific voice
    console.log("🚀 Using your custom avatar with voice configuration");
    
    sessionData = await avatar.createStartAvatar({
      quality: AvatarQuality.High,
      avatarName: "66008d91cfee459689ab288e56eb773f",
      language: "English",
      voice: {
        voiceId: "caf3267cce8e4807b190cc45d4a46dcc"
      }
    });
    
    console.log("✅ Your custom avatar with voice is working!", sessionData);

    console.log("Session data:", sessionData);

    // Hide welcome screen and show avatar interface
    welcomeScreen.style.display = "none";
    avatarInterface.style.display = "flex";
    avatarInterface.classList.add("fade-in");
    
    // Chat sidebar is closed by default (full screen avatar)
    // Avatar takes full screen width by default
    if (avatarMainContent) {
      avatarMainContent.classList.remove("chat-open");
    }
    
    // Ensure both buttons are visible by default
    if (recordButton) {
      recordButton.style.display = "flex";
    }
    if (textInputBtn) {
      textInputBtn.style.display = "flex";
    }
    
    // Update subtitle with welcome message
    if (avatarSubtitle) {
      avatarSubtitle.textContent = "Hi, how can I assist you?";
    }
    
    // Make avatar speak the introduction message
    setTimeout(async () => {
      if (avatar) {
        try {
          await avatar.speak({
            text: "Hi, how can I assist you?",
            task_type: TaskType.TALK,
            taskMode: TaskMode.SYNC
          });
          console.log("✅ Avatar spoke introduction message");
        } catch (error) {
          console.error("❌ Failed to speak introduction:", error);
        }
      }
    }, 2000);
    
    // Ensure input is properly enabled
    setTimeout(() => {
      ensureInputEnabled();
    }, 500);

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
    
    const userMessage = userInput.value.trim();
    if (userMessage === "") {
      console.log("No input text");
      return;
    }
    
    // Show user what they typed in the input field
    console.log("User typed:", userMessage);
    
    // Add visual feedback that text is being processed
    userInput.style.borderColor = "#8b5cf6";
    userInput.style.boxShadow = "0 0 0 2px rgba(139, 92, 246, 0.3)";
    
    
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
      
      // Clear input after successful processing and reset styling
      userInput.value = "";
      userInput.style.borderColor = "rgba(255, 255, 255, 0.2)";
      userInput.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
      
      // Update subtitle with the response
      updateSubtitle(output);
      
      // Add bot response to chat
      addChatMessage(output, false);
      
      // Keep text input area visible for continuous typing
      // Don't hide text input area - let user continue typing
      if (textInputArea) {
        textInputArea.style.display = "flex";
      }
      // Re-focus the input for continuous typing
      setTimeout(() => {
        if (userInput) {
          userInput.focus();
        }
      }, 100);
      
      // First, let the avatar acknowledge the user input
      if (avatar) {
        try {
          await avatar.speak({
            text: output,
            task_type: TaskType.TALK,
            taskMode: TaskMode.SYNC
          });
          console.log("✅ Avatar speaking completed successfully");
        } catch (speakError) {
          console.error("❌ Avatar speaking failed:", speakError);
          // Add error message to chat
          addChatMessage("Sorry, I had trouble speaking that response. Please try again.", false);
        }
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
      
      // Ensure we stay in avatar interface even on error
      if (avatarInterface) {
        avatarInterface.style.display = "flex";
      }
      if (welcomeScreen) {
        welcomeScreen.style.display = "none";
      }
      // Re-enable input after error
      if (userInput) {
        userInput.disabled = false;
        userInput.style.borderColor = "rgba(255, 255, 255, 0.2)";
        userInput.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
      }
    }
  }

// Handle when avatar stream is ready
function handleStreamReady(event: any) {
  if (event.detail && videoElement) {
    console.log("🎥 Stream ready, setting video source");
    videoElement.srcObject = event.detail;
    
    // Set video properties for stability
    videoElement.loop = false;
    videoElement.muted = false;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    
    // Enhanced video event handling for stability
    videoElement.addEventListener('loadstart', () => {
      console.log("📹 Video loading started");
    });
    
    videoElement.addEventListener('canplay', () => {
      console.log("📹 Video can play");
      // Ensure video plays smoothly with retry mechanism
      const playVideo = () => {
        videoElement.play().then(() => {
          console.log("✅ Video playing successfully");
        }).catch((error) => {
          console.error("❌ Video play failed:", error);
          // Retry with exponential backoff
          setTimeout(() => {
            console.log("🔄 Retrying video play...");
            playVideo();
          }, 2000);
        });
      };
      playVideo();
    });
    
    videoElement.addEventListener('error', (e) => {
      console.error("📹 Video error:", e);
      // Enhanced error recovery
      setTimeout(() => {
        if (videoElement.srcObject) {
          console.log("🔄 Attempting video recovery...");
          videoElement.load();
        }
      }, 1000);
    });
    
    videoElement.addEventListener('stalled', () => {
      console.log("📹 Video stalled - attempting recovery");
      // Multiple recovery attempts
      let retryCount = 0;
      const maxRetries = 3;
      const retryStalled = () => {
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`🔄 Stalled recovery attempt ${retryCount}/${maxRetries}`);
          videoElement.load();
          setTimeout(retryStalled, 2000);
        }
      };
      retryStalled();
    });
    
    videoElement.addEventListener('waiting', () => {
      console.log("📹 Video waiting for data");
      // Show loading indicator
      if (progressSection) {
        progressSection.style.display = "block";
        progressText.textContent = "Buffering video...";
      }
    });
    
    videoElement.addEventListener('playing', () => {
      console.log("📹 Video started playing");
      // Hide loading indicator
      if (progressSection) {
        progressSection.style.display = "none";
      }
    });
    
    videoElement.addEventListener('pause', () => {
      console.log("📹 Video paused - attempting to resume");
      // Auto-resume if paused unexpectedly
      setTimeout(() => {
        if (videoElement.paused) {
          videoElement.play().catch(console.error);
        }
      }, 1000);
    });
    
    videoElement.addEventListener('ended', () => {
      console.log("📹 Video ended - attempting to restart");
      // Restart video if it ends unexpectedly
      setTimeout(() => {
        videoElement.play().catch(console.error);
      }, 500);
    });
    
    // Monitor video health
    const videoHealthMonitor = setInterval(() => {
      if (videoElement) {
        // Check if video is paused unexpectedly
        if (videoElement.paused && !videoElement.ended) {
          console.log("🔄 Video paused unexpectedly - resuming");
          videoElement.play().catch(console.error);
        }
        
        // Check if video has no source but should be playing
        if (!videoElement.srcObject && avatar) {
          console.log("🔄 Video lost source - attempting recovery");
          // Try to get the stream again
          if (avatar.getStream) {
            const stream = avatar.getStream();
            if (stream) {
              videoElement.srcObject = stream;
            }
          }
        }
        
        // Check video quality and stability
        if (videoElement.readyState < 2) {
          console.log("🔄 Video not ready - attempting reload");
          videoElement.load();
        }
      }
    }, 5000);
    
    // Store the interval ID for cleanup
    (window as any).videoHealthMonitor = videoHealthMonitor;
    
    videoElement.onloadedmetadata = () => {
      console.log("📹 Video metadata loaded");
      videoElement.play().then(() => {
        console.log("✅ Video playing successfully");
      }).catch((error) => {
        console.error("❌ Video play failed:", error);
        // Retry playing after a short delay
        setTimeout(() => {
          videoElement.play().catch(console.error);
        }, 1000);
      });
    };
  } else {
    console.error("Stream is not available");
  }
}

// Handle stream disconnection
function handleStreamDisconnected() {
  console.log("Stream disconnected");
  
  // Don't immediately clear the video - keep it playing if possible
  if (videoElement) {
    console.log("Stream disconnected but keeping video for stability");
    
    // Try to recover the stream first
    setTimeout(() => {
      if (videoElement && !videoElement.srcObject) {
        console.log("Attempting stream recovery...");
        // Try to reinitialize the avatar session
        if (avatar) {
          console.log("Reinitializing avatar session...");
          initializeAvatarSession();
        }
      }
    }, 2000);
    
    // Only clear if it's a real disconnection after multiple attempts
    setTimeout(() => {
      if (videoElement && !videoElement.srcObject) {
        console.log("Clearing video after timeout");
        videoElement.srcObject = null;
      }
    }, 10000);
  }

  // Don't redirect for normal avatar responses or temporary disconnections
  console.log("Stream disconnected - staying in avatar interface");
  
  // Show user feedback about the disconnection
  if (avatarSubtitle) {
    avatarSubtitle.textContent = "Connection lost. Attempting to reconnect...";
  }
  
  // Try to reconnect after a delay
  setTimeout(() => {
    if (avatar) {
      console.log("Attempting to reconnect avatar...");
      initializeAvatarSession();
    }
  }, 3000);
}

// End the avatar session
async function terminateAvatarSession() {
  if (!avatar || !sessionData) return;
  
  // Clear video health monitor
  if ((window as any).videoHealthMonitor) {
    clearInterval((window as any).videoHealthMonitor);
    (window as any).videoHealthMonitor = null;
  }

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

// Add input event listener to show text as user types
userInput.addEventListener("input", (event) => {
  console.log("User typing:", userInput.value);
  // Ensure the input is visible and working
  userInput.style.opacity = "1";
  userInput.style.color = "white";
});

// Add focus event listener
userInput.addEventListener("focus", (event) => {
  console.log("Input focused");
  userInput.style.opacity = "1";
  userInput.style.color = "white";
  userInput.disabled = false;
});

// Add blur event listener
userInput.addEventListener("blur", (event) => {
  console.log("Input blurred");
});

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
    // Show chat sidebar
    if (chatSidebar) {
      chatSidebar.classList.add("open");
    }
    // Make avatar smaller when chat is open
    if (avatarMainContent) {
      avatarMainContent.classList.add("chat-open");
    }
    // Show text input area but keep voice button visible
    if (textInputArea) {
      textInputArea.style.display = "flex";
      // Keep voice button visible - don't hide it
      if (recordButton) {
        recordButton.style.display = "flex";
      }
      // Ensure input is focused and ready
      setTimeout(() => {
        if (userInput) {
          ensureInputEnabled();
          userInput.focus();
          userInput.placeholder = "Type your message here...";
          console.log("Input enabled and focused");
        }
      }, 100);
    }
  });
}

// Voice button click handler
if (recordButton) {
  recordButton.addEventListener("click", () => {
    // Close chat sidebar when voice is selected
    if (chatSidebar) {
      chatSidebar.classList.remove("open");
    }
    // Make avatar full screen
    if (avatarMainContent) {
      avatarMainContent.classList.remove("chat-open");
    }
    // Hide text input area but keep voice button visible
    if (textInputArea) {
      textInputArea.style.display = "none";
    }
    // Voice button is always visible
    if (recordButton) {
      recordButton.style.display = "flex";
    }
  });
  
  // Add mouse events for hold to speak
  recordButton.addEventListener("mousedown", () => {
    console.log("🎤 Mouse down - starting recording");
    if (voiceRecorder && !isRecording) {
      toggleRecording();
    }
  });
  
  recordButton.addEventListener("mouseup", () => {
    console.log("🎤 Mouse up - stopping recording");
    if (voiceRecorder && isRecording) {
      toggleRecording();
    }
  });
  
  recordButton.addEventListener("mouseleave", () => {
    console.log("🎤 Mouse leave - stopping recording");
    if (voiceRecorder && isRecording) {
      toggleRecording();
    }
  });
  
  // Add touch events for mobile devices
  recordButton.addEventListener("touchstart", (e) => {
    e.preventDefault();
    console.log("🎤 Touch start - starting recording");
    if (voiceRecorder && !isRecording) {
      toggleRecording();
    }
  });
  
  recordButton.addEventListener("touchend", (e) => {
    e.preventDefault();
    console.log("🎤 Touch end - stopping recording");
    if (voiceRecorder && isRecording) {
      toggleRecording();
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

// Close chat functionality
if (closeChatBtn && chatSidebar) {
  closeChatBtn.addEventListener("click", () => {
    chatSidebar.classList.remove("open");
    // Make avatar full screen when chat closes
    if (avatarMainContent) {
      avatarMainContent.classList.remove("chat-open");
    }
    console.log("Chat closed - avatar full screen");
  });
}

// Voice mode button functionality removed - using close button instead

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

// Ensure input is properly enabled and visible
function ensureInputEnabled() {
  if (userInput) {
    userInput.disabled = false;
    userInput.style.opacity = "1";
    userInput.style.color = "white";
    userInput.style.background = "rgba(255, 255, 255, 0.15)";
    userInput.style.border = "2px solid rgba(255, 255, 255, 0.2)";
    console.log("Input ensured to be enabled and visible");
  }
}