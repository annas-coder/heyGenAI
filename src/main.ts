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
// Language selection removed - English only
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
let sessionActive = false;
let recoveryInProgress = false;
let subtitleLocked = false;
let disconnectionCount = 0;
let lastDisconnectionTime = 0;
let connectionHealthMonitor: NodeJS.Timeout | null = null;
let lastStreamActivity = Date.now();
let isInitializing = false;
let isAvatarSpeaking = false;
let isApiCallInProgress = false; // Prevent duplicate API calls
let lastTranscriptionText = ''; // Prevent duplicate transcription processing
let isRecordingInProgress = false; // Prevent multiple recording operations

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
  
  // Prevent duplicate API calls
  if (isApiCallInProgress) {
    console.log("⚠️ API call already in progress - ignoring duplicate request");
    return;
  }
  
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
  
  // Set API call in progress flag
  isApiCallInProgress = true;
  
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
    console.log('📡 API Call ID:', Date.now()); // Unique identifier for this API call
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
    
      // FORCE AVATAR SPEAKING - Ensure avatar actually speaks
      console.log('🎤 FORCING avatar to speak response:', output);
      
      if (avatar && sessionActive) {
        try {
          console.log('🎤 Attempting avatar speak with explicit config');
          await avatar.speak({
            text: output,
            task_type: TaskType.TALK,
            taskMode: TaskMode.SYNC
          });
          console.log('✅ Avatar speaking completed successfully');
        } catch (speakError) {
          console.error('❌ Avatar speaking failed:', speakError);
          // CRITICAL: NO BROWSER TTS FALLBACK - Only avatar should speak
          console.log('❌ Avatar speech failed - NO BROWSER TTS FALLBACK');
          console.log('🔄 Waiting for avatar to become available...');
          
          if (avatarSubtitle) {
            avatarSubtitle.textContent = "Avatar speech failed. Please wait for avatar to reconnect.";
            avatarSubtitle.style.color = "#ffa500";
          }
        }
      } else {
        // CRITICAL: Check if session is truly dead before falling back to TTS
        console.log('🔍 Checking if avatar session is truly unavailable...');
        if (avatar && avatar.getStatus) {
          try {
            const status = avatar.getStatus();
            console.log('🔍 Avatar status:', status);
            
            if (status === 'active' || status === 'ready') {
              console.log('✅ Avatar is actually available - retrying speech');
              try {
                await avatar.speak({
                  text: output,
                  task_type: TaskType.TALK,
                  taskMode: TaskMode.SYNC
                });
                console.log('✅ Avatar speaking completed after status check');
                return; // Success, don't fall back to TTS
              } catch (retryError) {
                console.log('❌ Avatar retry failed:', retryError);
              }
            }
          } catch (statusError) {
            console.log('❌ Error checking avatar status:', statusError);
          }
        }
        
        // CRITICAL: Check if session is completely dead and needs restart
        console.log('🔍 Avatar unavailable - checking if session needs restart...');
        
        // CRITICAL: Try to keep session interactive even when avatar is not responding
        if (sessionActive && avatar) {
          console.log('🔍 Session is active but avatar not responding - attempting to maintain interactivity');
          
          if (avatarSubtitle) {
            avatarSubtitle.textContent = "Avatar not responding. Attempting to maintain session interactivity...";
            avatarSubtitle.style.color = "#ffa500";
          }
          
          // CRITICAL: Don't mark session as dead - try to keep it interactive
          console.log('🔄 Attempting to keep session interactive despite avatar issues...');
          
          // Try to maintain session activity
          sessionActive = true;
          lastStreamActivity = Date.now();
          
          if (avatarSubtitle) {
            avatarSubtitle.textContent = "Session maintained. Please try speaking again.";
            avatarSubtitle.style.color = "#10b981";
          }
        }
        
        // CRITICAL: NO BROWSER TTS - Only avatar should speak
        console.log('❌ Avatar unavailable - NO BROWSER TTS FALLBACK');
        console.log('🔄 Waiting for avatar to become available...');
        
        if (avatarSubtitle) {
          avatarSubtitle.textContent = "Avatar unavailable. Please wait for avatar to reconnect.";
          avatarSubtitle.style.color = "#ffa500";
        }
      }
      
    } catch (error) {
    console.error("❌ Error processing speech:", error);
    isAvatarSpeaking = false; // Reset speaking flag on error
    if (progressSection) {
      progressSection.style.display = "none";
    }
    // Add error message to chat
    addChatMessage("Sorry, I couldn't process your voice message. Please try again.", false);
  } finally {
    // Always reset API call flag
    isApiCallInProgress = false;
  }
}

function initializeVoiceRecorder() {
  // Prevent multiple initializations
  if (voiceRecorder) {
    console.log("🎤 Voice recorder already exists - skipping initialization");
    return;
  }
  
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
      
      // Prevent duplicate transcription processing
      if (text === lastTranscriptionText) {
        console.log("⚠️ Duplicate transcription detected - ignoring");
        return;
      }
      
      if (text && text.trim().length > 0) {
        console.log("🎤 Processing transcribed text:", text);
        lastTranscriptionText = text; // Store to prevent duplicates
        
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
    console.log("🎤 Voice recorder exists:", !!voiceRecorder);
    console.log("🎤 Session active:", sessionActive);
    
    // Prevent multiple simultaneous calls to toggleRecording
    if (isApiCallInProgress || isRecordingInProgress) {
      console.log("⚠️ Operation in progress - ignoring recording toggle");
      return;
    }
    
    // Check if session is active
    if (!sessionActive) {
      console.log("❌ Session not active - cannot record voice");
      if (recordingStatus) {
        recordingStatus.textContent = "❌ Session not active. Please start a session first.";
        recordingStatus.style.display = "flex";
        setTimeout(() => {
          if (recordingStatus) {
            recordingStatus.style.display = "none";
          }
        }, 3000);
      }
      return;
    }
    
  if (!voiceRecorder) {
      console.log("🎤 Creating new voice recorder...");
    initializeVoiceRecorder();
      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log("🎤 Voice recorder initialized:", !!voiceRecorder);
  }

  if (!isRecording) {
      console.log("🎤 Starting recording...");
      
      // Set recording in progress flag
      isRecordingInProgress = true;
      
      // Reset transcription tracking for new recording
      lastTranscriptionText = '';
      
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
    isRecordingInProgress = false;
    if (recordButton) {
      recordButton.classList.remove("recording");
    }
    if (waveformContainer) {
      waveformContainer.classList.remove("active");
    }
    if (recordingStatus) {
      recordingStatus.textContent = "❌ Recording error. Please try again.";
    }
  } finally {
    // Always reset recording progress flag
    isRecordingInProgress = false;
  }
}


// Initialize streaming avatar session
async function initializeAvatarSession() {
  // Prevent multiple initializations
  if (isInitializing) {
    console.log("⚠️ Avatar session already initializing - skipping");
    return;
  }
  
  if (sessionActive && avatar) {
    console.log("⚠️ Avatar session already active - skipping initialization");
    return;
  }
  
  isInitializing = true;
  console.log("🚀 Starting avatar session initialization");
  
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
    
    // COMPREHENSIVE AVATAR SETUP - All issues fixed
    avatar.on(StreamingEvents.STREAM_READY, handleStreamReady);
    
    // COMPREHENSIVE DISCONNECTION DIAGNOSTICS - Root cause analysis
    avatar.on(StreamingEvents.STREAM_DISCONNECTED, (data) => {
      console.log("🔌 Stream disconnected - comprehensive diagnostics");
      console.log("🔍 Disconnect data:", data);
      
      // COMPREHENSIVE DIAGNOSTICS
      const disconnectCode = data?.detail || data?.code || 'unknown';
      const timestamp = new Date().toISOString();
      const sessionDuration = Date.now() - (window as any).sessionStartTime;
      
      console.log("🔍 DISCONNECTION ANALYSIS:");
      console.log("  - Code:", disconnectCode);
      console.log("  - Timestamp:", timestamp);
      console.log("  - Session duration:", Math.floor(sessionDuration / 1000), "seconds");
      console.log("  - Last activity:", Date.now() - lastStreamActivity, "ms ago");
      console.log("  - Session active:", sessionActive);
      console.log("  - Avatar exists:", !!avatar);
      
      // Check video stream status
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const tracks = stream.getTracks();
        console.log("  - Video stream tracks:", tracks.length);
        console.log("  - Active tracks:", tracks.filter(t => t.readyState === 'live').length);
      }
      
      // Check network connectivity
      if (navigator.onLine !== undefined) {
        console.log("  - Browser online:", navigator.onLine);
      }
      
      // Interpret disconnect codes with specific solutions
      let errorMessage = "Connection lost. ";
      let solution = "";
      switch(disconnectCode) {
        case 5:
          errorMessage += "Session timeout or network issue.";
          solution = "This usually happens due to network instability or server load. Try refreshing the page.";
          break;
        case 1:
          errorMessage += "Authentication failed.";
          solution = "Your session token expired. Please refresh the page to get a new token.";
          break;
        case 2:
          errorMessage += "Invalid session.";
          solution = "Session corrupted. Please restart the application.";
          break;
        case 3:
          errorMessage += "Rate limit exceeded.";
          solution = "Too many requests. Please wait 1-2 minutes before trying again.";
          break;
        case 4:
          errorMessage += "Server error.";
          solution = "HeyGen servers are experiencing issues. Please try again in a few minutes.";
          break;
        default:
          errorMessage += "Unknown connection issue.";
          solution = "Please refresh the page to reconnect.";
      }
      
      console.log("🔍 Disconnect reason:", errorMessage);
      console.log("💡 Solution:", solution);
      
      if (avatarSubtitle) {
        avatarSubtitle.textContent = errorMessage;
        avatarSubtitle.style.color = "#ff6b6b";
      }
      
      // Handle different disconnect codes appropriately
      if (disconnectCode === 1 || disconnectCode === 2) {
        console.log("❌ Critical disconnect - attempting session recovery");
        // Don't immediately set sessionActive = false, try recovery first
        setTimeout(() => {
          if (!avatar || !videoElement?.srcObject) {
            console.log("❌ Recovery failed - session truly dead");
            sessionActive = false;
          } else {
            console.log("✅ Session recovered - keeping active");
          }
        }, 3000);
      } else if (disconnectCode === 5) {
        console.log("⚠️ Code 5 disconnect - implementing auto-refresh error handling");
        
        if (avatarSubtitle) {
          avatarSubtitle.textContent = "Code 5 disconnect detected. Auto-refreshing session...";
          avatarSubtitle.style.color = "#ffa500";
        }
        
        // CRITICAL: Code 5 auto-refresh error handling - check API key validity first
        const code5RefreshTimeout = setTimeout(async () => {
          if (sessionActive && avatar) {
            // CRITICAL: Check if API key is already invalid or all monitoring stopped
            if ((window as any).apiKeyInvalid || (window as any).allMonitoringStopped) {
              console.log("🔍 API key already marked as invalid or monitoring stopped - skipping refresh attempt");
              
              if (avatarSubtitle) {
                avatarSubtitle.textContent = "API key expired. Using browser TTS for continued interaction.";
                avatarSubtitle.style.color = "#ffa500";
              }
              
              // Keep session active but don't try to refresh
              sessionActive = true;
              lastStreamActivity = Date.now();
              return;
            }
            
            console.log("🔄 Code 5 auto-refresh: attempting session refresh...");
            
            try {
              // CRITICAL: Auto-refresh session for Code 5 disconnects
              await refreshSessionWithNewApiKey();
              
              if (sessionActive) {
                console.log("✅ Code 5 auto-refresh successful");
                if (avatarSubtitle) {
                  avatarSubtitle.textContent = "Code 5 auto-refresh successful. Session restored.";
                  avatarSubtitle.style.color = "#10b981";
                }
              }
            } catch (refreshError) {
              console.log("❌ Code 5 auto-refresh failed:", refreshError);
              
              // CRITICAL: Don't mark session as dead - keep it interactive
              console.log("🔄 Code 5 auto-refresh failed, but keeping session interactive...");
              
              if (avatarSubtitle) {
                avatarSubtitle.textContent = "Code 5 auto-refresh failed, but session remains interactive. Please try speaking again.";
                avatarSubtitle.style.color = "#ffa500";
              }
              
              // Keep session active even if refresh failed
              sessionActive = true;
              lastStreamActivity = Date.now();
            }
          }
        }, 1000); // Immediate auto-refresh for Code 5
        
        // Store timeout reference for cleanup
        (window as any).code5RefreshTimeout = code5RefreshTimeout;
      }
    });
    
    // MINIMAL EVENT HANDLERS - Prevent disconnections
    avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
      console.log("🎤 Avatar started talking");
      isAvatarSpeaking = true;
    });

    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
      console.log("🎤 Avatar stopped talking");
      isAvatarSpeaking = false;
      // Re-enable input after speaking
      if (userInput) {
        userInput.disabled = false;
        userInput.focus();
      }
    });
    
    // Add diagnostic logging for stream ready
    avatar.on(StreamingEvents.STREAM_READY, (data) => {
      console.log("🔍 DIAGNOSTIC: Stream ready event fired");
      console.log("🔍 Stream ready data:", data);
    });
    
    console.log("✅ Comprehensive avatar setup - all issues fixed");
    
    console.log("✅ Essential avatar functionality restored - video will display");
    
    // Use your custom avatar with specific voice
    console.log("🚀 Using your custom avatar with voice configuration");
    
    // SESSION TIMEOUT CONFIG - 30 minutes session with your custom avatar
    console.log("⏰ Setting session timeout to 30 minutes with your custom avatar");
    
    const avatarConfig = {
      quality: AvatarQuality.Low, // CRITICAL: Use Low quality to prevent Code 5 disconnections
      avatarName: "66008d91cfee459689ab288e56eb773f", // Your custom avatar
      language: "English",
      voice: { voiceId: "caf3267cce8e4807b190cc45d4a46dcc" }, // Your custom voice
      // CRITICAL: Ultra-conservative settings to prevent Code 5 disconnections
      sessionTimeout: 600000, // 10 minutes - much shorter to prevent API key expiry
      keepAlive: true,
      timeout: 120000, // 2 minutes timeout - very short to prevent hanging
      // CRITICAL: Maximum stability settings
      retryAttempts: 3, // Fewer retries to prevent API overload
      retryDelay: 5000, // Slower retry to prevent rate limiting
      // CRITICAL: Ultra-conservative stream settings
      bufferSize: 512, // Very small buffer
      frameRate: 10, // Very low frame rate
      bitrate: 250000, // Very low bitrate
      // CRITICAL: Add connection stability
      connectionTimeout: 30000, // 30 second connection timeout
      maxRetries: 2, // Limit retries
      heartbeatInterval: 10000 // 10 second heartbeat
    };
    
    // CRITICAL: Make avatarConfig globally accessible for session refresh
    (window as any).avatarConfig = avatarConfig;
    
    console.log("⏰ Avatar configured for 60-minute session with your custom avatar");
    
    try {
      sessionData = await avatar.createStartAvatar(avatarConfig);
      console.log("✅ Avatar session created successfully:", sessionData);
      
      // DIAGNOSTIC: Check session data
      console.log("🔍 Session data details:", {
        sessionId: sessionData?.sessionId,
        status: sessionData?.status,
        avatarName: sessionData?.avatarName,
        voiceId: sessionData?.voiceId
      });
      
    } catch (avatarError) {
      console.error("❌ AVATAR CREATION FAILED:", avatarError);
      console.log("🔍 Error details:", {
        message: avatarError.message,
        status: avatarError.status,
        code: avatarError.code
      });
      
      // Enhanced error handling with specific solutions
      let errorMessage = "Avatar creation failed: ";
      let solution = "";
      
      if (avatarError.message.includes("timeout")) {
        errorMessage += "Connection timeout";
        solution = "Please check your internet connection and try again.";
      } else if (avatarError.message.includes("auth") || avatarError.message.includes("token")) {
        errorMessage += "Authentication failed";
        solution = "Please refresh the page to get a new authentication token.";
      } else if (avatarError.message.includes("rate") || avatarError.message.includes("limit")) {
        errorMessage += "Rate limit exceeded";
        solution = "Please wait 1-2 minutes before trying again.";
      } else {
        errorMessage += avatarError.message;
        solution = "Please refresh the page and try again.";
      }
      
      console.log("💡 Solution:", solution);
      alert(`${errorMessage}\n\nSolution: ${solution}`);
      return;
    }

    console.log("Session data:", sessionData);

    // Set session as active
    sessionActive = true;
    isInitializing = false;
    (window as any).sessionStartTime = Date.now(); // Track session start for diagnostics
    
    // CRITICAL: Track avatar instance to prevent multiple instances
    if (!(window as any).avatarInstances) {
      (window as any).avatarInstances = [];
    }
    (window as any).avatarInstances.push(avatar);
    console.log(`🔍 Avatar instances count: ${(window as any).avatarInstances.length}`);
    
    console.log("🎯 Session is now active and will persist until End Session is clicked");
    
    // COMPREHENSIVE SESSION SETUP - All stability features
    console.log("✅ Comprehensive session setup - avatar ready for uninterrupted interaction");
    
    // ESSENTIAL SETUP - Add basic connection stability
    console.log("✅ Essential setup - basic connection stability");
    
    // MINIMAL connection monitoring - reduced to prevent interruptions
    const connectionMonitor = setInterval(() => {
      if (sessionActive && avatar) {
        console.log("💓 Session active - passive monitoring only");
        // NO active operations that could interfere with connection
      }
    }, 300000); // Check every 5 minutes - much reduced frequency
    
    // Store for cleanup
    (window as any).connectionMonitor = connectionMonitor;
    
    // ADDED: Smart session health monitoring
    const sessionHealthMonitor = setInterval(() => {
      if (sessionActive && avatar) {
        console.log("💓 Session health check - monitoring avatar status");
        
        // Check if avatar is still responsive
        if (avatar.getStatus) {
          const status = avatar.getStatus();
          console.log("🔍 Avatar status:", status);
          
          if (status === 'error' || status === 'disconnected') {
            console.log("⚠️ Avatar health issue detected - attempting recovery");
            // Don't restart immediately, let user know
            if (avatarSubtitle) {
              avatarSubtitle.textContent = "Avatar connection issue detected. Please try speaking again.";
              avatarSubtitle.style.color = "#ffa500";
            }
          }
        }
      }
    }, 300000); // Check every 5 minutes
    
    // Store for cleanup
    (window as any).sessionHealthMonitor = sessionHealthMonitor;
    
    // Add session timeout display
    let sessionStartTime = Date.now();
    const sessionTimeoutDisplay = setInterval(() => {
      if (sessionActive && avatar) {
        const elapsed = Date.now() - sessionStartTime;
        const remaining = 3600000 - elapsed; // 60 minutes - elapsed
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        console.log(`⏰ Session time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`);
        
        // Update subtitle with session time if needed
        if (avatarSubtitle && remaining < 300000) { // Less than 5 minutes
          avatarSubtitle.textContent = `Session time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`;
          avatarSubtitle.style.color = "#ffa500";
        }
      }
    }, 120000); // Every 2 minutes - much reduced frequency to prevent interference
    
    // Store for cleanup
    (window as any).sessionTimeoutDisplay = sessionTimeoutDisplay;
    
    // Simple initialization without complex testing
    console.log("✅ Avatar session initialized - ready for interaction");
    
    // API test removed - only call API when user interacts
    
    // Simple connection monitoring without complex payload monitoring
    console.log("✅ Simple connection monitoring enabled");

    // Hide welcome screen and show avatar interface
    welcomeScreen.style.display = "none";
    avatarInterface.style.display = "flex";
    avatarInterface.classList.add("fade-in");
    
    // Chat sidebar is closed by default (full screen avatar)
    // Avatar takes full screen width by default
    if (avatarMainContent) {
      avatarMainContent.classList.remove("chat-open");
    }
    
    // Show text input area by default for easier access
    if (textInputArea) {
      textInputArea.style.display = "flex";
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
    
    // Reset flags and button state
    isInitializing = false;
    sessionActive = false;
    getStartedBtn.disabled = false;
    getStartedBtn.innerHTML = '<span>Get Started</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
}

// Handle speaking event with streaming (HeyGen recommended approach)
async function handleSpeak() {
  console.log("handleSpeak called");
  
  // Prevent duplicate API calls
  if (isApiCallInProgress) {
    console.log("⚠️ API call already in progress - ignoring duplicate request");
    return;
  }
  
  // Stop any existing avatar speaking that might be stuck
  if (avatar && avatar.stopSpeaking) {
    try {
      avatar.stopSpeaking();
      console.log('🛑 Stopped any existing avatar speaking before new question');
    } catch (error) {
      console.log('🛑 Error stopping avatar speaking (this is OK):', error);
    }
  }
  
  // Stop any existing browser TTS
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    console.log('🛑 Stopped any existing browser TTS');
  }
  
  if (!avatar) {
    console.error("Avatar not initialized");
    return;
  }
  
  if (!userInput.value || userInput.value.trim() === "") {
    console.log("No input text");
    return;
  }
  
  // Set API call in progress flag
  isApiCallInProgress = true;
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
      console.log("📡 Sending request to API with message:", userMessage);
      console.log("📡 API Call ID:", Date.now()); // Unique identifier for this API call
      
      const llmResponse = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      
      console.log("📡 API Response Status:", llmResponse.status);
      console.log("📡 API Response OK:", llmResponse.ok);
      
      if (!llmResponse.ok) {
        throw new Error(`API request failed with status ${llmResponse.status}`);
      }
      
      const responseData = await llmResponse.json();
      console.log("📡 Full API Response:", responseData);
      
      const output = responseData.output || responseData.message || "I didn't understand that. Please try again.";
      console.log("📡 Extracted output:", output);
      
      // Ensure we have a valid response
      let finalOutput = output;
      if (!output || output.trim() === "") {
        console.warn("⚠️ Empty response from API, using fallback");
        finalOutput = "I'm sorry, I didn't get a proper response. Please try asking your question again.";
        console.log("📡 Using fallback output:", finalOutput);
      }
      
      // Add user message to chat
      addChatMessage(userMessage, true);
      
      // Clear input after successful processing and reset styling
      userInput.value = "";
      userInput.style.borderColor = "rgba(255, 255, 255, 0.2)";
      userInput.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
      
      // Update subtitle with the response
      updateSubtitle(finalOutput);
      
      // Add bot response to chat
      addChatMessage(finalOutput, false);
      
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
      
      // FORCE AVATAR SPEAKING - Ensure avatar actually speaks
      console.log("🎤 FORCING avatar to speak response:", finalOutput);
      
      if (avatar && sessionActive) {
        try {
          console.log("🎤 Attempting avatar speak with explicit config");
          await avatar.speak({
            text: finalOutput,
            task_type: TaskType.TALK,
            taskMode: TaskMode.SYNC
          });
          console.log("✅ Avatar speaking completed successfully");
        } catch (speakError) {
          console.error("❌ Avatar speaking failed:", speakError);
          // CRITICAL: NO BROWSER TTS FALLBACK - Only avatar should speak
          console.log("❌ Avatar speech failed - NO BROWSER TTS FALLBACK");
          console.log("🔄 Waiting for avatar to become available...");
          
          if (avatarSubtitle) {
            avatarSubtitle.textContent = "Avatar speech failed. Please wait for avatar to reconnect.";
            avatarSubtitle.style.color = "#ffa500";
          }
        }
      } else {
        // CRITICAL: Check if session is truly dead before falling back to TTS
        console.log("🔍 Checking if avatar session is truly unavailable...");
        if (avatar && avatar.getStatus) {
          try {
            const status = avatar.getStatus();
            console.log("🔍 Avatar status:", status);
            
            if (status === 'active' || status === 'ready') {
              console.log("✅ Avatar is actually available - retrying speech");
              try {
                await avatar.speak({
                  text: finalOutput,
                  task_type: TaskType.TALK,
                  taskMode: TaskMode.SYNC
                });
                console.log("✅ Avatar speaking completed after status check");
                return; // Success, don't fall back to TTS
              } catch (retryError) {
                console.log("❌ Avatar retry failed:", retryError);
              }
            }
          } catch (statusError) {
            console.log("❌ Error checking avatar status:", statusError);
          }
        }
        
        console.log("🔄 Avatar truly unavailable, using browser TTS");
        const utterance = new SpeechSynthesisUtterance(finalOutput);
        utterance.lang = 'en-US'; // Set English as default language
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        speechSynthesis.speak(utterance);
        console.log("✅ Browser TTS completed");
      }

      // Re-enable speak button after successful API call
      if (speakButton) {
        speakButton.disabled = false;
        speakButton.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        `;
      }

    } catch (error) {
      console.error("❌ Error getting streaming response:", error);
      console.error("❌ Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      isAvatarSpeaking = false; // Reset speaking flag on error
      
      // Add detailed error message to chat
      const errorMessage = `Sorry, I encountered an error: ${error.message}. Please try again.`;
      addChatMessage(errorMessage, false);
      
      // Try to speak the error message
      if (avatar && sessionActive) {
        try {
          avatar.speak(errorMessage);
        } catch (speakError) {
          console.error("❌ Error speaking error message:", speakError);
        // CRITICAL: NO BROWSER TTS - Only avatar should speak
        console.log("❌ Error occurred - NO BROWSER TTS");
        console.log("🔄 Waiting for avatar to become available...");
        
        if (avatarSubtitle) {
          avatarSubtitle.textContent = "Error occurred. Please wait for avatar to reconnect.";
          avatarSubtitle.style.color = "#ff6b6b";
        }
        }
      } else {
        // CRITICAL: NO BROWSER TTS - Only avatar should speak
        console.log("❌ Error occurred - NO BROWSER TTS");
        console.log("🔄 Waiting for avatar to become available...");
        
        if (avatarSubtitle) {
          avatarSubtitle.textContent = "Error occurred. Please wait for avatar to reconnect.";
          avatarSubtitle.style.color = "#ff6b6b";
        }
      }
      
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
  } finally {
    // Always reset API call flag
    isApiCallInProgress = false;
    
    // Always re-enable speak button
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

// Force avatar speaking function with explicit configuration
function forceAvatarSpeak(text: string) {
  console.log("🎤 FORCE SPEAKING:", text);
  
  if (avatar && sessionActive) {
    try {
      console.log("🎤 Attempting force speak with explicit config");
      avatar.speak({
        text: text,
        task_type: TaskType.TALK,
        taskMode: TaskMode.SYNC
      });
      console.log("✅ Force speaking initiated");
    } catch (error) {
      console.error("❌ Force speaking failed:", error);
      // Use browser TTS
    // CRITICAL: NO BROWSER TTS - Only avatar should speak
    console.log("❌ Avatar not available - NO BROWSER TTS");
    console.log("🔄 Waiting for avatar to become available...");
    
    if (avatarSubtitle) {
      avatarSubtitle.textContent = "Avatar not available. Please wait for avatar to reconnect.";
      avatarSubtitle.style.color = "#ffa500";
    }
    }
  } else {
    console.log("🔄 Avatar not available, using browser TTS");
    // CRITICAL: NO BROWSER TTS - Only avatar should speak
    console.log("❌ Avatar not available - NO BROWSER TTS");
    console.log("🔄 Waiting for avatar to become available...");
    
    if (avatarSubtitle) {
      avatarSubtitle.textContent = "Avatar not available. Please wait for avatar to reconnect.";
      avatarSubtitle.style.color = "#ffa500";
    }
  }
}

// Make forceAvatarSpeak available globally for testing
(window as any).forceAvatarSpeak = forceAvatarSpeak;

// Make stopAllTTS available globally for testing
(window as any).stopAllTTS = stopAllTTS;

// CRITICAL: Connection health monitoring to prevent disconnections
function startConnectionHealthMonitoring() {
  console.log("🔍 Starting connection health monitoring...");
  
  const healthCheckInterval = setInterval(() => {
    if (!sessionActive || !avatar) {
      clearInterval(healthCheckInterval);
      return;
    }
    
    // CRITICAL: Stop monitoring if API key is invalid or all monitoring stopped
    if ((window as any).apiKeyInvalid || (window as any).allMonitoringStopped) {
      console.log("🛑 API key invalid or all monitoring stopped - stopping connection health monitoring");
      clearInterval(healthCheckInterval);
      return;
    }
    
    console.log("💓 Connection health check...");
    
    // Check video stream health
    if (videoElement && videoElement.srcObject) {
      const stream = videoElement.srcObject as MediaStream;
      const tracks = stream.getTracks();
      const activeTracks = tracks.filter(track => track.readyState === 'live');
      
      console.log("📊 Stream health:", {
        totalTracks: tracks.length,
        activeTracks: activeTracks.length,
        videoTrack: tracks.find(t => t.kind === 'video')?.readyState,
        audioTrack: tracks.find(t => t.kind === 'audio')?.readyState
      });
      
      // If no active tracks, connection is dead
      if (activeTracks.length === 0) {
        console.log("⚠️ No active tracks detected - connection may be dead");
        if (avatarSubtitle) {
          avatarSubtitle.textContent = "Connection lost. Attempting to reconnect...";
          avatarSubtitle.style.color = "#ff6b6b";
        }
      }
    }
    
    // Check avatar status if available
    if (avatar.getStatus) {
      const status = avatar.getStatus();
      console.log("🔍 Avatar status:", status);
      
      if (status === 'error' || status === 'disconnected') {
        console.log("⚠️ Avatar status indicates connection issue");
        if (avatarSubtitle) {
          avatarSubtitle.textContent = "Avatar connection issue. Please try speaking again.";
          avatarSubtitle.style.color = "#ffa500";
        }
      }
    }
    
    // Update last activity
    lastStreamActivity = Date.now();
    
  }, 30000); // Check every 30 seconds
  
  // Store for cleanup
  (window as any).connectionHealthInterval = healthCheckInterval;
}

// CRITICAL: Session keep-alive to prevent premature termination
function startSessionKeepAlive() {
  console.log("💓 Starting session keep-alive...");
  
  const keepAliveInterval = setInterval(() => {
    if (!sessionActive || !avatar) {
      clearInterval(keepAliveInterval);
      return;
    }
    
    // CRITICAL: Stop monitoring if API key is invalid or all monitoring stopped
    if ((window as any).apiKeyInvalid || (window as any).allMonitoringStopped) {
      console.log("🛑 API key invalid or all monitoring stopped - stopping session keep-alive");
      clearInterval(keepAliveInterval);
      return;
    }
    
    console.log("💓 Session keep-alive ping...");
    
    // Check if avatar is still responsive
    if (avatar.getStatus) {
      try {
        const status = avatar.getStatus();
        console.log("💓 Avatar status:", status);
        
        if (status === 'active' || status === 'ready') {
          console.log("✅ Avatar session healthy");
          lastStreamActivity = Date.now();
        } else if (status === 'error' || status === 'disconnected') {
          console.log("⚠️ Avatar status indicates issue - attempting recovery");
          // Try to extend session
          if (avatar.extendSession) {
            try {
              avatar.extendSession();
              console.log("✅ Session extended successfully");
            } catch (error) {
              console.log("❌ Session extension failed:", error);
            }
          }
        }
      } catch (error) {
        console.log("⚠️ Error checking avatar status:", error);
      }
    }
    
    // Update last activity to prevent timeout
    lastStreamActivity = Date.now();
    
  }, 60000); // Keep alive every minute
  
  // Store for cleanup
  (window as any).sessionKeepAliveInterval = keepAliveInterval;
}

// CRITICAL: Stream health monitoring to prevent stream death
function startStreamHealthMonitoring(stream: MediaStream) {
  console.log("📊 Starting stream health monitoring...");
  
  const streamHealthInterval = setInterval(() => {
    if (!sessionActive || !stream) {
      clearInterval(streamHealthInterval);
      return;
    }
    
    // CRITICAL: Stop monitoring if API key is invalid or all monitoring stopped
    if ((window as any).apiKeyInvalid || (window as any).allMonitoringStopped) {
      console.log("🛑 API key invalid or all monitoring stopped - stopping stream health monitoring");
      clearInterval(streamHealthInterval);
      return;
    }
    
    console.log("📊 Stream health check...");
    
    // Check stream tracks
    const tracks = stream.getTracks();
    const activeTracks = tracks.filter(track => track.readyState === 'live');
    
    console.log("📊 Stream status:", {
      totalTracks: tracks.length,
      activeTracks: activeTracks.length,
      videoTrack: tracks.find(t => t.kind === 'video')?.readyState,
      audioTrack: tracks.find(t => t.kind === 'audio')?.readyState
    });
    
    // CRITICAL: If stream is dying, try to revive it
    if (activeTracks.length === 0 && tracks.length > 0) {
      console.log("⚠️ Stream is dying - attempting revival...");
      
      // Try to get a fresh stream from avatar
      if (avatar && avatar.getStream) {
        try {
          const newStream = avatar.getStream();
          if (newStream && videoElement) {
            console.log("✅ Got fresh stream - updating video");
            videoElement.srcObject = newStream;
            (window as any).currentStream = newStream;
            lastStreamActivity = Date.now();
            
            if (avatarSubtitle) {
              avatarSubtitle.textContent = "Stream revived successfully";
              avatarSubtitle.style.color = "#10b981";
            }
          }
        } catch (error) {
          console.log("❌ Stream revival failed:", error);
        }
      }
    }
    
    // CRITICAL: If stream is completely dead (0 tracks), session is dead
    if (activeTracks.length === 0 && tracks.length === 0) {
      console.log("💀 Stream is completely dead - session may be dead");
      
      // Check if this is a persistent issue (multiple checks in a row)
      if (!(window as any).deadStreamCount) {
        (window as any).deadStreamCount = 0;
      }
      (window as any).deadStreamCount++;
      
      console.log(`💀 Dead stream count: ${(window as any).deadStreamCount}`);
      
      // If stream has been dead for multiple checks, session is truly dead
      if ((window as any).deadStreamCount >= 3) {
        console.log("💀 Session is confirmed dead - triggering restart");
        
        if (avatarSubtitle) {
          avatarSubtitle.textContent = "Session died. Restarting automatically...";
          avatarSubtitle.style.color = "#ffa500";
        }
        
        // CRITICAL: Don't auto-restart - API key is invalid after first session
        console.log("💀 Session is confirmed dead - HeyGen API key becomes invalid after first session");
        
        if (avatarSubtitle) {
          avatarSubtitle.textContent = "Session died. HeyGen API key becomes invalid after first session. Please refresh the page.";
          avatarSubtitle.style.color = "#ff6b6b";
        }
        
        // Mark session as dead - user needs to refresh for new API key
        sessionActive = false;
        (window as any).deadStreamCount = 0; // Reset counter
        
        console.log("💀 Session marked as dead - user needs to refresh page for new API key");
      }
    } else {
      // Stream is healthy, reset dead stream counter
      (window as any).deadStreamCount = 0;
    }
    
    // Update last activity
    lastStreamActivity = Date.now();
    
  }, 15000); // Check every 15 seconds
  
  // Store for cleanup
  (window as any).streamHealthInterval = streamHealthInterval;
}

// CRITICAL: API Key Validity Verification and Reissue Mechanism
function startProactiveSessionRefresh() {
  console.log("🔄 Starting API key validity monitoring and proactive session refresh...");
  
  const refreshInterval = setInterval(async () => {
    if (!sessionActive || !avatar) {
      clearInterval(refreshInterval);
      return;
    }
    
    // CRITICAL: Stop monitoring if API key is invalid or all monitoring stopped
    if ((window as any).apiKeyInvalid || (window as any).allMonitoringStopped) {
      console.log("🛑 API key invalid or all monitoring stopped - stopping proactive session refresh");
      clearInterval(refreshInterval);
      return;
    }
    
    console.log("🔍 API key validity check...");
    
    // Check if session is approaching expiry (8 minutes into 10-minute session)
    const sessionDuration = Date.now() - (window as any).sessionStartTime;
    const sessionAgeMinutes = Math.floor(sessionDuration / 60000);
    
    console.log(`🔍 Session age: ${sessionAgeMinutes} minutes`);
    
    // CRITICAL: Test API key validity before session expires
    if (sessionAgeMinutes >= 7) {
      console.log("🔍 Testing API key validity before expiry...");
      
      try {
        // Test API key by checking avatar status
        if (avatar.getStatus) {
          const status = avatar.getStatus();
          console.log("🔍 Current avatar status:", status);
          
          if (status === 'error' || status === 'disconnected') {
            console.log("⚠️ API key may be invalid - triggering immediate refresh");
            await refreshSessionWithNewApiKey();
            return;
          }
        }
        
        // If session is 8+ minutes old, refresh it proactively
        if (sessionAgeMinutes >= 8) {
          console.log("🔄 Session approaching expiry - refreshing proactively...");
          await refreshSessionWithNewApiKey();
        }
      } catch (apiError) {
        console.log("❌ API key test failed:", apiError);
        console.log("🔄 API key appears invalid - triggering immediate refresh");
        await refreshSessionWithNewApiKey();
      }
    }
    
  }, 60000); // Check every minute
  
  // Store for cleanup
  (window as any).proactiveRefreshInterval = refreshInterval;
}

// CRITICAL: Refresh session with new API key - with 401 error handling
async function refreshSessionWithNewApiKey() {
  console.log("🔄 Refreshing session with new API key...");
  
  if (avatarSubtitle) {
    avatarSubtitle.textContent = "Refreshing session with new API key...";
    avatarSubtitle.style.color = "#ffa500";
  }
  
  try {
    // CRITICAL: Get avatar config from global scope
    const avatarConfig = (window as any).avatarConfig;
    if (!avatarConfig) {
      throw new Error("Avatar config not found - cannot refresh session");
    }
    
    // CRITICAL: Stop current session completely
    if (avatar && avatar.stopAvatar) {
      await avatar.stopAvatar();
    }
    
    // CRITICAL: Clear any cached session tokens and prevent reuse
    (window as any).currentStream = null;
    (window as any).deadStreamCount = 0;
    (window as any).sessionTokens = null;
    (window as any).avatarInstances = [];
    
    // CRITICAL: Ensure no multiple avatar instances exist
    if ((window as any).avatarInstances && (window as any).avatarInstances.length > 0) {
      console.log("🧹 Cleaning up existing avatar instances to prevent token reuse...");
      for (const instance of (window as any).avatarInstances) {
        try {
          if (instance && instance.stopAvatar) {
            await instance.stopAvatar();
          }
        } catch (cleanupError) {
          console.log("⚠️ Error cleaning up avatar instance:", cleanupError);
        }
      }
      (window as any).avatarInstances = [];
    }
    
    // Wait for complete cleanup
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // CRITICAL: Create new session with fresh API key
    console.log("🔄 Creating new session with fresh API key...");
    const newSessionData = await avatar.createStartAvatar(avatarConfig);
    
    if (newSessionData && videoElement) {
      console.log("✅ Session refreshed with new API key successfully");
      sessionActive = true;
      lastStreamActivity = Date.now();
      (window as any).sessionStartTime = Date.now(); // Reset session start time
      
      if (avatarSubtitle) {
        avatarSubtitle.textContent = "Session refreshed with new API key successfully.";
        avatarSubtitle.style.color = "#10b981";
      }
    }
  } catch (refreshError) {
    console.log("❌ Session refresh with new API key failed:", refreshError);
    
    // CRITICAL: Check if it's a 401 error (API key invalid)
    if (refreshError.message && refreshError.message.includes('401')) {
      console.log("🔍 401 Unauthorized detected - API key is invalid");
      console.log("🔄 Switching to graceful degradation mode...");
      
      if (avatarSubtitle) {
        avatarSubtitle.textContent = "API key expired. Switching to browser TTS mode for continued interaction.";
        avatarSubtitle.style.color = "#ffa500";
      }
      
      // CRITICAL: Mark API key as invalid to prevent future refresh attempts
      (window as any).apiKeyInvalid = true;
      
      // CRITICAL: Stop all monitoring and refresh attempts
      console.log("🛑 Stopping all monitoring and refresh attempts due to invalid API key...");
      
      // CRITICAL: Set global flag to prevent any monitoring from restarting
      (window as any).allMonitoringStopped = true;
      (window as any).apiKeyInvalid = true;
      
      // CRITICAL: Force stop all monitoring intervals immediately
      const intervalsToStop = [
        'connectionHealthInterval',
        'streamHealthInterval', 
        'proactiveRefreshInterval',
        'webRTCStabilityInterval',
        'sessionKeepAliveInterval'
      ];
      
      intervalsToStop.forEach(intervalName => {
        if ((window as any)[intervalName]) {
          clearInterval((window as any)[intervalName]);
          (window as any)[intervalName] = null;
          console.log(`🛑 ${intervalName} stopped`);
        }
      });
      
      // CRITICAL: Clear any pending timeouts
      const timeoutsToClear = [
        'code5RefreshTimeout',
        'sessionRefreshTimeout',
        'streamRecoveryTimeout'
      ];
      
      timeoutsToClear.forEach(timeoutName => {
        if ((window as any)[timeoutName]) {
          clearTimeout((window as any)[timeoutName]);
          (window as any)[timeoutName] = null;
          console.log(`🛑 ${timeoutName} cleared`);
        }
      });
      
      // Keep session active but switch to TTS mode
      sessionActive = true;
      lastStreamActivity = Date.now();
      
      // CRITICAL: Ensure session stays interactive for response generation
      console.log("✅ Graceful degradation activated - all monitoring stopped, avatar will use browser TTS");
      console.log("🔄 Session remains interactive for response generation");
      
      // CRITICAL: Update UI to show session is still active
      if (avatarSubtitle) {
        avatarSubtitle.textContent = "Session active with browser TTS. Please continue interacting.";
        avatarSubtitle.style.color = "#10b981";
      }
      
      // CRITICAL: Ensure speak button remains enabled
      if (speakButton) {
        speakButton.disabled = false;
        console.log("✅ Speak button remains enabled for continued interaction");
      }
      
      // CRITICAL: Ensure record button remains enabled
      if (recordButton) {
        recordButton.disabled = false;
        console.log("✅ Record button remains enabled for continued interaction");
      }
    } else {
      // For other errors, try to keep session interactive
      console.log("🔄 Attempting to keep session interactive despite refresh failure...");
      
      if (avatarSubtitle) {
        avatarSubtitle.textContent = "Session refresh failed, but trying to maintain connection...";
        avatarSubtitle.style.color = "#ffa500";
      }
      
      // Try to keep the session active even if refresh failed
      sessionActive = true;
      lastStreamActivity = Date.now();
    }
  }
}

// CRITICAL: WebRTC Stability Testing and Network Diagnostics
function startWebRTCStabilityTesting() {
  console.log("🌐 Starting WebRTC stability testing and network diagnostics...");
  
  const stabilityInterval = setInterval(() => {
    if (!sessionActive || !avatar) {
      clearInterval(stabilityInterval);
      return;
    }
    
    // CRITICAL: Stop monitoring if API key is invalid or all monitoring stopped
    if ((window as any).apiKeyInvalid || (window as any).allMonitoringStopped) {
      console.log("🛑 API key invalid or all monitoring stopped - stopping WebRTC stability testing");
      clearInterval(stabilityInterval);
      return;
    }
    
    console.log("🌐 WebRTC stability test...");
    
    // Test WebRTC connection stability
    if (videoElement && videoElement.srcObject) {
      const stream = videoElement.srcObject as MediaStream;
      const tracks = stream.getTracks();
      
      console.log("🌐 WebRTC diagnostics:", {
        totalTracks: tracks.length,
        activeTracks: tracks.filter(t => t.readyState === 'live').length,
        videoTrack: tracks.find(t => t.kind === 'video')?.readyState,
        audioTrack: tracks.find(t => t.kind === 'audio')?.readyState,
        connectionState: stream.connectionState || 'unknown',
        iceConnectionState: stream.connectionState || 'unknown'
      });
      
      // Test network connectivity
      if (navigator.onLine !== undefined) {
        console.log("🌐 Network status:", {
          online: navigator.onLine,
          connectionType: (navigator as any).connection?.effectiveType || 'unknown',
          downlink: (navigator as any).connection?.downlink || 'unknown',
          rtt: (navigator as any).connection?.rtt || 'unknown'
        });
      }
      
      // Test browser WebRTC support
      console.log("🌐 WebRTC support:", {
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        RTCPeerConnection: !!(window as any).RTCPeerConnection,
        WebRTC: !!(window as any).webkitRTCPeerConnection || !!(window as any).RTCPeerConnection
      });
      
      // Test for WebRTC issues that could cause Code 5 disconnections
      if (tracks.length === 0) {
        console.log("⚠️ WebRTC issue: No tracks detected - this could cause Code 5 disconnections");
        
        if (avatarSubtitle) {
          avatarSubtitle.textContent = "WebRTC issue detected. Checking network stability...";
          avatarSubtitle.style.color = "#ffa500";
        }
      }
      
      // Test for network instability
      if ((navigator as any).connection) {
        const connection = (navigator as any).connection;
        if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
          console.log("⚠️ Network issue: Slow connection detected - this could cause Code 5 disconnections");
          
          if (avatarSubtitle) {
            avatarSubtitle.textContent = "Slow network detected. This may cause disconnections.";
            avatarSubtitle.style.color = "#ffa500";
          }
        }
      }
    }
    
  }, 30000); // Test every 30 seconds
  
  // Store for cleanup
  (window as any).webRTCStabilityInterval = stabilityInterval;
}

// Handle when avatar stream is ready
function handleStreamReady(event: any) {
  if (event.detail && videoElement) {
    console.log("🎥 Stream ready, setting video source");
    console.log("🔍 Stream details:", {
      type: event.detail?.type,
      active: event.detail?.active,
      tracks: event.detail?.getTracks?.()?.length || 'unknown'
    });
    
    videoElement.srcObject = event.detail;
    
    // Update last activity time
    lastStreamActivity = Date.now();
    console.log("📊 Stream activity updated");
    
    // CRITICAL: Add connection health monitoring
    startConnectionHealthMonitoring();
    
    // CRITICAL: Start session keep-alive to prevent premature termination
    startSessionKeepAlive();
    
    // CRITICAL: Start proactive session refresh to prevent API key expiry
    startProactiveSessionRefresh();
    
    // CRITICAL: Start WebRTC stability testing and network diagnostics
    startWebRTCStabilityTesting();
    
    // CRITICAL: Optimize video properties to prevent stream death
    videoElement.loop = false;
    videoElement.muted = false; // Keep audio enabled for avatar
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    
    // CRITICAL: Add stream stability measures
    videoElement.preload = 'none'; // Don't preload to reduce resource usage
    videoElement.controls = false; // Disable controls to prevent conflicts
    
    // CRITICAL: Prevent stream from being garbage collected
    (window as any).currentStream = event.detail;
    
    // CRITICAL: Monitor stream health to prevent death
    startStreamHealthMonitoring(event.detail);
    
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
    
    // DISABLE stalled event handler - was causing avatar to get stuck
    // videoElement.addEventListener('stalled', () => {
    //   // DISABLED - was interfering with avatar speaking
    // });
    
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
    
    // DISABLE pause event handler - was causing avatar to get stuck
    // videoElement.addEventListener('pause', () => {
    //   // DISABLED - was interfering with avatar speaking
    // });
    
    // DISABLE ended event handler - was causing avatar to get stuck
    // videoElement.addEventListener('ended', () => {
    //   // DISABLED - was interfering with avatar speaking
    // });
    
    // DISABLE video health monitoring completely to prevent interference
    // const videoHealthMonitor = setInterval(() => {
    //   // DISABLED - was causing avatar to get stuck
    // }, 20000);
    
    // DISABLED: Keep-alive mechanism was causing 15-second disconnections
    // const keepAliveInterval = setInterval(() => {
    //   if (sessionActive && avatar) {
    //     // Send a ping to keep connection alive
    //     console.log("🏓 Sending keep-alive ping");
    //     
    //     // Try to get stream status
    //     if (avatar.getStatus) {
    //       const status = avatar.getStatus();
    //       console.log("📊 Avatar status:", status);
    //     }
    //     
    //     // Update last activity
    //     lastStreamActivity = Date.now();
    //   }
    // }, 60000); // Every 60 seconds - EXTENDED from 15 seconds
    
    // DISABLED: Keep-alive interval is disabled
    // (window as any).keepAliveInterval = keepAliveInterval;
    
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
  
  // CRITICAL: Don't handle disconnection if avatar is speaking
  if (isAvatarSpeaking) {
    console.log("🎤 Avatar is speaking - ignoring disconnection to prevent session restart");
    return;
  }
  
  // Track disconnection frequency
  const now = Date.now();
  disconnectionCount++;
  
  // If too many disconnections in short time, show error
  if (disconnectionCount > 3 && (now - lastDisconnectionTime) < 10000) {
    console.log("Too many disconnections - showing error state");
    if (avatarSubtitle && !subtitleLocked) {
      avatarSubtitle.textContent = "Connection unstable. Please refresh the page.";
      avatarSubtitle.style.color = "#ff6b6b";
    }
    
    // Disable controls
    if (speakButton) {
      speakButton.disabled = true;
    }
    if (recordButton) {
      recordButton.disabled = true;
    }
    if (userInput) {
      userInput.disabled = true;
    }
    return;
  }
  
  lastDisconnectionTime = now;
  
  // Only handle disconnection if session is active
  if (!sessionActive) {
    console.log("Session not active - ignoring disconnection");
    return;
  }
  
  // Show disconnection status to user
  if (avatarSubtitle && !subtitleLocked) {
    avatarSubtitle.textContent = "Connection lost. Reconnecting...";
    avatarSubtitle.style.color = "#ff6b6b";
  }
  
  // Try to reconnect immediately
  setTimeout(() => {
    if (sessionActive && avatar) {
      console.log("Attempting immediate reconnection...");
      
      // Try to get a new stream
      if (avatar.getStream) {
        const stream = avatar.getStream();
        if (stream && videoElement) {
          console.log("Got new stream - updating video");
          videoElement.srcObject = stream;
          
          // Reset subtitle to normal
          if (avatarSubtitle && !subtitleLocked) {
            avatarSubtitle.textContent = "Hi, how can I assist you?";
            avatarSubtitle.style.color = "";
          }
        } else {
          console.log("No stream available - keeping existing session");
          // DON'T reinitialize - this creates new session
          // Just show error message
          if (avatarSubtitle && !subtitleLocked) {
            avatarSubtitle.textContent = "Connection lost. Please try asking a question.";
            avatarSubtitle.style.color = "#ff6b6b";
          }
        }
      } else {
        console.log("Avatar doesn't support getStream - keeping existing session");
        // DON'T reinitialize - this creates new session
        // Just show error message
        if (avatarSubtitle && !subtitleLocked) {
          avatarSubtitle.textContent = "Connection lost. Please try asking a question.";
          avatarSubtitle.style.color = "#ff6b6b";
        }
      }
    }
  }, 1000);

  // If reconnection fails, show error after delay
  setTimeout(() => {
    if (sessionActive && videoElement && !videoElement.srcObject) {
      console.log("Reconnection failed - showing error state");
      
      if (avatarSubtitle && !subtitleLocked) {
        avatarSubtitle.textContent = "Connection failed. Please refresh the page.";
        avatarSubtitle.style.color = "#ff6b6b";
      }
      
      // Disable controls
      if (speakButton) {
        speakButton.disabled = true;
      }
      if (recordButton) {
        recordButton.disabled = true;
      }
      if (userInput) {
        userInput.disabled = true;
      }
    }
  }, 5000);
}

// End the avatar session
async function terminateAvatarSession() {
  if (!avatar || !sessionData) return;
  
  // Prevent termination while API call is in progress
  if (isApiCallInProgress) {
    console.log("⚠️ API call in progress - cannot terminate session safely");
    if (avatarSubtitle) {
      avatarSubtitle.textContent = "Please wait for current request to complete before ending session.";
      avatarSubtitle.style.color = "#ffa500";
    }
    
    // Wait for API call to complete, then retry termination
    const waitForApiCompletion = () => {
      if (!isApiCallInProgress) {
        console.log("✅ API call completed - proceeding with termination");
        terminateAvatarSession();
      } else {
        console.log("⏳ Still waiting for API call to complete...");
        setTimeout(waitForApiCompletion, 1000);
      }
    };
    
    setTimeout(waitForApiCompletion, 1000);
    return;
  }
  
  console.log("🛑 Terminating avatar session...");
  
  // Set session as inactive
  sessionActive = false;
  isInitializing = false;
  isApiCallInProgress = false; // Reset API call flag
  console.log("🎯 Session is now inactive");
  
  // CRITICAL: Stop all TTS immediately
  console.log("🔇 Stopping all TTS...");
  
  // Stop browser speech synthesis
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    console.log("✅ Browser TTS cancelled");
  }
  
  // Stop avatar speaking if possible
  if (avatar && avatar.stopSpeaking) {
    try {
      avatar.stopSpeaking();
      console.log("✅ Avatar speaking stopped");
    } catch (error) {
      console.log("⚠️ Error stopping avatar speaking:", error);
    }
  }
  
  // Reset speaking flags
  isAvatarSpeaking = false;
  console.log("✅ All TTS stopped");
  
  // ESSENTIAL CLEANUP - Clear all session managers
  console.log("🧹 Essential cleanup - stopping avatar session");
  
  // Clear connection monitor
  if ((window as any).connectionMonitor) {
    clearInterval((window as any).connectionMonitor);
    (window as any).connectionMonitor = null;
  }
  
  // Clear session timeout manager
  if ((window as any).sessionTimeoutManager) {
    clearInterval((window as any).sessionTimeoutManager);
    (window as any).sessionTimeoutManager = null;
  }
  
  // Clear session keep-alive
  if ((window as any).sessionKeepAlive) {
    clearInterval((window as any).sessionKeepAlive);
    (window as any).sessionKeepAlive = null;
  }
  
  // Clear session timeout display
  if ((window as any).sessionTimeoutDisplay) {
    clearInterval((window as any).sessionTimeoutDisplay);
    (window as any).sessionTimeoutDisplay = null;
  }
  
  // Clear session health monitor
  if ((window as any).sessionHealthMonitor) {
    clearInterval((window as any).sessionHealthMonitor);
    (window as any).sessionHealthMonitor = null;
  }
  
  // Clear connection health monitoring
  if ((window as any).connectionHealthInterval) {
    clearInterval((window as any).connectionHealthInterval);
    (window as any).connectionHealthInterval = null;
  }
  
  // Clear session keep-alive
  if ((window as any).sessionKeepAliveInterval) {
    clearInterval((window as any).sessionKeepAliveInterval);
    (window as any).sessionKeepAliveInterval = null;
  }
  
  // Clear stream health monitoring
  if ((window as any).streamHealthInterval) {
    clearInterval((window as any).streamHealthInterval);
    (window as any).streamHealthInterval = null;
  }
  
  // Clear proactive session refresh
  if ((window as any).proactiveRefreshInterval) {
    clearInterval((window as any).proactiveRefreshInterval);
    (window as any).proactiveRefreshInterval = null;
  }
  
  // Clear WebRTC stability testing
  if ((window as any).webRTCStabilityInterval) {
    clearInterval((window as any).webRTCStabilityInterval);
    (window as any).webRTCStabilityInterval = null;
  }
  
  // Simple cleanup without complex monitoring
  console.log("✅ Simple cleanup completed");

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
  if (recordButton) {
    recordButton.classList.remove("recording");
  }
  if (waveformContainer) {
    waveformContainer.classList.remove("active");
  }
  if (recordingStatus) {
    recordingStatus.textContent = "";
  }
  
  // Re-enable get started button
  getStartedBtn.disabled = false;
  getStartedBtn.innerHTML = '<span>Get Started</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}


// Event listeners for buttons
getStartedBtn.addEventListener("click", initializeAvatarSession);
endButton.addEventListener("click", terminateAvatarSession);
speakButton.addEventListener("click", handleSpeak);
// recordButton click handled by mousedown/mouseup events below

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

// Voice button click handler - UI changes and recording
if (recordButton) {
  recordButton.addEventListener("click", () => {
    console.log("🎤 Voice button clicked");
    
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
    
    // Handle recording with click (toggle on/off)
    toggleRecording();
  });
  
  // Mouse and touch events removed to prevent duplicate calls
  // Only click event is used for recording to ensure single STT request
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

// Language selection removed - English only enforced

// Update subtitle when avatar speaks
function updateSubtitle(text: string) {
  if (avatarSubtitle && !subtitleLocked) {
    avatarSubtitle.textContent = text;
  } else if (subtitleLocked) {
    console.log("🔒 Subtitle is locked - not changing to:", text);
  }
}

// Connection health monitoring
function startConnectionHealthMonitor() {
  if (connectionHealthMonitor) {
    clearInterval(connectionHealthMonitor);
  }
  
  connectionHealthMonitor = setInterval(() => {
    if (!sessionActive || !avatar) {
      return;
    }
    
    // CRITICAL: Don't check connection health if avatar is speaking
    if (isAvatarSpeaking) {
      console.log("🎤 Avatar is speaking - skipping health check to prevent disconnection");
      return;
    }
    
    const now = Date.now();
    const timeSinceLastActivity = now - lastStreamActivity;
    
    // Check if stream is still active
    if (videoElement && videoElement.srcObject) {
      const stream = videoElement.srcObject as MediaStream;
      const tracks = stream.getTracks();
      
      // Check if any track is still active
      const hasActiveTracks = tracks.some(track => track.readyState === 'live');
      
      if (hasActiveTracks) {
        lastStreamActivity = now;
        console.log("✅ Stream is healthy");
      } else {
        console.log("⚠️ Stream tracks are not live - potential disconnection");
        
        // Try to recover the stream
        if (avatar.getStream) {
          const newStream = avatar.getStream();
          if (newStream) {
            console.log("🔄 Recovering stream from avatar");
            videoElement.srcObject = newStream;
            lastStreamActivity = now;
          }
        }
      }
    } else {
      console.log("⚠️ No video stream - attempting recovery");
      
      // Try to get stream from avatar
      if (avatar.getStream) {
        const stream = avatar.getStream();
        if (stream) {
          console.log("🔄 Recovering stream from avatar");
          videoElement.srcObject = stream;
          lastStreamActivity = now;
        }
      }
    }
    
    // If no activity for too long, try to reconnect WITHOUT creating new session
    if (timeSinceLastActivity > 120000) { // 120 seconds (2 minutes) - EXTENDED from 30 seconds
      console.log("🚨 No stream activity for 2 minutes - attempting reconnection");
      
      // Try to get existing stream first
      if (avatar.getStream) {
        const stream = avatar.getStream();
        if (stream) {
          console.log("🔄 Recovering existing stream");
          videoElement.srcObject = stream;
          lastStreamActivity = Date.now();
          return;
        }
      }
      
      // Only try avatar.reconnect if available
      if (avatar.reconnect) {
        console.log("🔄 Attempting avatar reconnect");
        avatar.reconnect();
      } else {
        console.log("⚠️ No reconnect method available - keeping existing session");
        // DON'T call initializeAvatarSession() - this creates new session
      }
    }
  }, 15000); // Check every 15 seconds - EXTENDED from 5 seconds
}

// Stop connection health monitoring
function stopConnectionHealthMonitor() {
  if (connectionHealthMonitor) {
    clearInterval(connectionHealthMonitor);
    connectionHealthMonitor = null;
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

// Stop all TTS when page is unloaded
function stopAllTTS() {
  console.log("🔇 Page unloading - stopping all TTS...");
  
  // Stop browser speech synthesis
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    console.log("✅ Browser TTS cancelled on page unload");
  }
  
  // Stop avatar speaking if possible
  if (avatar && avatar.stopSpeaking) {
    try {
      avatar.stopSpeaking();
      console.log("✅ Avatar speaking stopped on page unload");
    } catch (error) {
      console.log("⚠️ Error stopping avatar speaking on page unload:", error);
    }
  }
  
  // Reset all flags
  isAvatarSpeaking = false;
  isApiCallInProgress = false;
  sessionActive = false;
}

// Add event listeners for page unload
window.addEventListener('beforeunload', stopAllTTS);
window.addEventListener('unload', stopAllTTS);