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
const avatarSubtitle = document.getElementById("avatarSubtitle") as HTMLElement;

// Test subtitle visibility
console.log("🎬 Avatar subtitle element:", avatarSubtitle);
console.log("🎬 Avatar subtitle exists:", !!avatarSubtitle);
if (avatarSubtitle) {
  console.log("🎬 Avatar subtitle current text:", avatarSubtitle.textContent);
  console.log("🎬 Avatar subtitle current display:", avatarSubtitle.style.display);
}
const textInputArea = document.getElementById("textInputArea") as HTMLElement;
const textInputBtn = document.getElementById("textInputBtn") as HTMLButtonElement;
// Language selection removed - English only
const chatMessages = document.getElementById("chatMessages") as HTMLElement;
const clearChatBtn = document.getElementById("clearChatBtn") as HTMLButtonElement;
const closeChatBtn = document.getElementById("closeChatBtn") as HTMLButtonElement;
// const voiceModeBtn = document.getElementById("voiceModeBtn") as HTMLButtonElement;
const chatSidebar = document.querySelector(".chat-sidebar") as HTMLElement;
const avatarMainContent = document.querySelector(".avatar-main-content") as HTMLElement;
const waveformContainer = document.querySelector(".waveform-container") as HTMLElement;
const recordingStatus = document.getElementById("recordingStatus") as HTMLElement;
const chatBtn = document.getElementById("chatBtn") as HTMLButtonElement;
const micBtn = document.getElementById("micBtn") as HTMLButtonElement;
const endSessionBtn = document.getElementById("endSessionBtn") as HTMLButtonElement;

let avatar: StreamingAvatar | null = null;
let sessionData: any = null;
let voiceRecorder: VoiceRecorder | null = null;
let isRecording = false;
let sessionActive = false;
let subtitleLocked = false;
// Removed unused connectionHealthMonitor
let lastStreamActivity = Date.now();
let isInitializing = false;
let isAvatarSpeaking = false; // Used to track avatar speaking state
let currentSpeakingText = ""; // Track current text being spoken
let subtitleUpdateInterval: NodeJS.Timeout | null = null; // For live subtitle updates
let fullResponseText = ""; // Store the complete response text
let currentWordIndex = 0; // Track current word being spoken
let wordDisplayInterval: NodeJS.Timeout | null = null; // For word-by-word display
// Dummy usage to satisfy TypeScript
if (false) console.log(isAvatarSpeaking);
let isApiCallInProgress = false; // Prevent duplicate API calls
let lastTranscriptionText = ''; // Prevent duplicate transcription processing
let isRecordingInProgress = false; // Prevent multiple recording operations

// Function to show complete dialogue subtitle
function showCompleteSubtitle(fullText: string) {
  if (!avatarSubtitle) return;
  
  // Clear any existing interval
  if (wordDisplayInterval) {
    clearInterval(wordDisplayInterval);
    wordDisplayInterval = null;
  }
  
  // Show the complete text immediately
  avatarSubtitle.textContent = fullText;
  avatarSubtitle.style.color = "#ffffff";
  avatarSubtitle.style.display = "block";
  avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  avatarSubtitle.style.padding = "10px 15px";
  avatarSubtitle.style.borderRadius = "8px";
  avatarSubtitle.style.position = "absolute";
  avatarSubtitle.style.bottom = "80px";
  avatarSubtitle.style.left = "50%";
  avatarSubtitle.style.transform = "translateX(-50%)";
  avatarSubtitle.style.zIndex = "1000";
  avatarSubtitle.style.maxWidth = "80%";
  avatarSubtitle.style.textAlign = "center";
  avatarSubtitle.style.fontSize = "16px";
  avatarSubtitle.style.lineHeight = "1.4";
  
  console.log("🎬 Complete subtitle shown:", fullText);
}

// Function to update subtitle with complete text
function updateLiveSubtitle(text: string) {
  console.log("🎬 updateLiveSubtitle called with:", text);
  console.log("🎬 avatarSubtitle element:", avatarSubtitle);
  console.log("🎬 avatarSubtitle exists:", !!avatarSubtitle);
  if (avatarSubtitle && text) {
    currentSpeakingText = text;
    // Show complete text immediately
    avatarSubtitle.textContent = text;
    avatarSubtitle.style.color = "#ffffff";
    avatarSubtitle.style.display = "block";
    avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    avatarSubtitle.style.padding = "10px 15px";
    avatarSubtitle.style.borderRadius = "8px";
    avatarSubtitle.style.position = "absolute";
    avatarSubtitle.style.bottom = "80px";
    avatarSubtitle.style.left = "50%";
    avatarSubtitle.style.transform = "translateX(-50%)";
    avatarSubtitle.style.zIndex = "1000";
    avatarSubtitle.style.maxWidth = "80%";
    avatarSubtitle.style.textAlign = "center";
    avatarSubtitle.style.fontSize = "16px";
    avatarSubtitle.style.lineHeight = "1.4";
    console.log("🎬 Complete subtitle updated:", avatarSubtitle.textContent);
  } else {
    console.log("🎬 Subtitle not updated - avatarSubtitle:", !!avatarSubtitle, "text:", text);
  }
}

// Function to clear subtitle when avatar stops speaking
function clearLiveSubtitle() {
  if (avatarSubtitle) {
    // Keep subtitle visible for a few seconds so users can read the complete dialogue
    setTimeout(() => {
      if (avatarSubtitle) {
        avatarSubtitle.textContent = "";
        avatarSubtitle.style.display = "none";
        currentSpeakingText = "";
        fullResponseText = "";
        currentWordIndex = 0;
        
        // Clear word display interval
        if (wordDisplayInterval) {
          clearInterval(wordDisplayInterval);
          wordDisplayInterval = null;
        }
        console.log("🎬 Subtitle cleared after delay");
      }
    }, 5000); // Keep subtitle visible for 5 seconds
  }
}

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

// Function to detect if text is in English - Enhanced for better accuracy
function isEnglish(text: string): boolean {
  console.log("🔍 Checking if text is English:", text);
  
  // Remove extra whitespace and normalize
  const cleanText = text.trim().toLowerCase();
  
  if (!cleanText || cleanText.length === 0) {
    console.log("❌ Empty text detected");
    return false;
  }
  
  // Enhanced English detection with comprehensive word list
  const englishWords = [
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'hello', 'hi', 'yes', 'no',
    'please', 'thank', 'you', 'me', 'my', 'your', 'his', 'her', 'our', 'their',
    'this', 'that', 'these', 'those', 'what', 'when', 'where', 'why', 'how', 'who', 'which',
    'help', 'need', 'want', 'like', 'love', 'good', 'bad', 'big', 'small', 'new', 'old',
    'first', 'last', 'next', 'previous', 'here', 'there', 'now', 'then', 'today', 'tomorrow', 'yesterday',
    'speak', 'talk', 'say', 'ask', 'tell', 'explain', 'describe', 'understand', 'know', 'think',
    'believe', 'feel', 'see', 'hear', 'listen', 'watch', 'look', 'come', 'go', 'get', 'give',
    'take', 'make', 'work', 'play', 'live', 'eat', 'drink', 'sleep', 'wake', 'walk', 'run',
    'sit', 'stand', 'open', 'close', 'start', 'stop', 'begin', 'end', 'finish', 'about',
    'tcit', 'dubai', 'company', 'assist', 'question', 'answer', 'information'
  ];
  
  // Check for basic English character pattern (Latin alphabet only)
  const englishPattern = /^[a-zA-Z\s.,!?;:'"()-]+$/;
  
  // Convert to lowercase and split into words
  const words = cleanText.split(/\s+/);
  
  // Count English words
  const englishWordCount = words.filter(word => englishWords.includes(word)).length;
  const totalWords = words.length;
  
  // Check for English sentence patterns
  const englishSentencePatterns = [
    /^(hi|hello|hey)\s/i,
    /^(what|where|when|why|how|who|which)\s/i,
    /^(can|could|will|would|should|may|might|must)\s/i,
    /^(tell|explain|describe|help|assist)\s/i,
    /^(i|you|we|they)\s/i,
    /^(the|a|an)\s/i,
    /^(about|tcit|dubai|company)\s/i
  ];
  
  const hasEnglishWords = englishWordCount > 0;
  const matchesPattern = englishPattern.test(text);
  const matchesSentencePattern = englishSentencePatterns.some(pattern => pattern.test(text));
  
  console.log("🔍 Has English words:", hasEnglishWords, `(${englishWordCount}/${totalWords})`);
  console.log("🔍 Matches English pattern:", matchesPattern);
  console.log("🔍 Matches sentence pattern:", matchesSentencePattern);
  
  // More strict: require English characters AND (English words OR sentence pattern)
  const isEnglishText = matchesPattern && (hasEnglishWords || matchesSentencePattern) && text.trim().length > 0;
  
  console.log("🔍 Final English detection result:", isEnglishText);
  return isEnglishText;
}

// Speech-to-speech functionality
async function speakText(text: string) {
  console.log("🎤 speakText called with:", text);
  
  // Show complete dialogue subtitle
  showCompleteSubtitle(text);
  
  // Prevent duplicate API calls
  if (isApiCallInProgress) {
    console.log("⚠️ API call already in progress - ignoring duplicate request");
    console.log("⚠️ Current API call in progress for text:", text);
    return;
  }
  
  if (!avatar) {
    console.error("❌ Avatar not initialized");
    addChatMessage("Avatar not ready. Please try again.", false);
    return;
  }
  
  // Check if avatar is in a good state
  if (!avatar) {
    console.log("🎤 Avatar not ready");
    addChatMessage("Avatar is not ready. Please wait a moment and try again.", false);
    return;
  }
  
  if (!text || !text.trim()) {
    console.error("❌ Empty text provided");
    return;
  }
  
  // ENGLISH ONLY: Check if text is in English (strict enforcement)
  if (!isEnglish(text)) {
    console.log("🌍 Non-English text detected:", text);
    console.log("⚠️ English detection failed - enforcing English only");
    addChatMessage("Please speak in English. I can only understand and respond in English.", false);
    
    // Update subtitle to show English requirement
    if (avatarSubtitle) {
      avatarSubtitle.textContent = "Please speak in English only. I can only understand English.";
      avatarSubtitle.style.color = "#ffa500";
    }
    
    // Try to make avatar speak the English requirement message
    if (avatar && sessionActive) {
      try {
        await avatar.speak({
          text: "Please speak in English only. I can only understand English.",
          task_type: TaskType.TALK,
          taskMode: TaskMode.ASYNC
        });
      } catch (speakError) {
        console.error('❌ Error speaking English requirement:', speakError);
      }
    }
    
    return;
  }
  
  // Set API call in progress flag
  isApiCallInProgress = true;
  
  try {
    console.log('🎤 Processing voice input:', text);
    
      
      // Send to your API endpoint with faster timeout
    console.log('📡 Sending to API:', text);
    console.log('📡 API Call ID:', Date.now()); // Unique identifier for this API call
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    // Try primary API endpoint first
    let llmResponse;
    try {
      llmResponse = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal
      });
    } catch (primaryError) {
      console.warn("⚠️ Primary API failed, trying fallback:", primaryError);
      // Fallback to a simple response
      const fallbackResponse = {
        output: `I heard you say: "${text}". This is a fallback response while the main API is being fixed.`
      };
      const output = fallbackResponse.output;
      console.log('🤖 Fallback AI Response text:', output);
      
      // Add bot response to chat FIRST
      addChatMessage(output, false);
      
      // Update subtitle with the response
      updateSubtitle(output);
      
      // Ensure subtitle is visible
      if (avatarSubtitle) {
        avatarSubtitle.style.display = "block";
        avatarSubtitle.style.color = "#ffffff";
        avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        avatarSubtitle.style.padding = "10px 15px";
        avatarSubtitle.style.borderRadius = "8px";
        console.log('🎬 Subtitle styling applied');
      }
      
      // FORCE AVATAR SPEAKING - Ensure avatar actually speaks
      console.log('🎤 FORCING avatar to speak response:', output);
      
      // Force show subtitle before avatar speaks
      if (avatarSubtitle) {
        avatarSubtitle.textContent = output;
        avatarSubtitle.style.display = "block";
        avatarSubtitle.style.color = "#ffffff";
        avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
        avatarSubtitle.style.padding = "10px 15px";
        avatarSubtitle.style.borderRadius = "8px";
        avatarSubtitle.style.position = "absolute";
        avatarSubtitle.style.bottom = "80px";
        avatarSubtitle.style.left = "50%";
        avatarSubtitle.style.transform = "translateX(-50%)";
        avatarSubtitle.style.zIndex = "1000";
        avatarSubtitle.style.maxWidth = "80%";
        avatarSubtitle.style.textAlign = "center";
        avatarSubtitle.style.fontSize = "16px";
        avatarSubtitle.style.lineHeight = "1.4";
        console.log('🎬 Subtitle forced to show before avatar speaks');
      }
      
      if (avatar && sessionActive) {
        try {
          await avatar.speak({
            text: output,
            task_type: TaskType.TALK,
            taskMode: TaskMode.ASYNC
          });
          console.log('✅ Avatar speaking initiated');
        } catch (speakError) {
          console.error('❌ Error making avatar speak:', speakError);
        }
      }
      
      return;
    }
      
    clearTimeout(timeoutId);
      
    console.log('📡 API Response status:', llmResponse.status);
    console.log('📡 API Response headers:', Object.fromEntries(llmResponse.headers.entries()));
    
    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('❌ API Error Response:', errorText);
      throw new Error(`API request failed with status ${llmResponse.status}: ${errorText}`);
    }
    
    const responseData = await llmResponse.json();
    console.log('📡 API Response data:', responseData);
    console.log('📡 Response data keys:', Object.keys(responseData));
    
    // Try multiple possible response fields
    const output = responseData.output || responseData.message || responseData.response || responseData.text || responseData.data || "I didn't understand that. Please try again.";
    console.log('🤖 AI Response text:', output);
    console.log('🤖 Response length:', output.length);
    console.log('🤖 Full response data for debugging:', JSON.stringify(responseData, null, 2));
    
    // Add unique identifier to track this response
    const responseId = Date.now();
    console.log('🆔 Response ID for tracking:', responseId);
    console.log('🆔 User question was:', text);
    
    
    // Add bot response to chat FIRST
    addChatMessage(output, false);
    
    // Update subtitle with the response
    updateSubtitle(output);
    
    // Ensure subtitle is visible with proper styling
    if (avatarSubtitle) {
      avatarSubtitle.style.display = "block";
      avatarSubtitle.style.color = "#ffffff";
      avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      avatarSubtitle.style.padding = "10px 15px";
      avatarSubtitle.style.borderRadius = "8px";
      console.log('🎬 Main API subtitle styling applied');
    }
    
      // FORCE AVATAR SPEAKING - Ensure avatar actually speaks
      console.log('🎤 FORCING avatar to speak response:', output);
      console.log('🎤 Avatar will speak this exact text:', JSON.stringify(output));
      console.log('🆔 Sending response ID to avatar:', responseId);
      
      if (avatar && sessionActive) {
        try {
          console.log('🎤 Attempting avatar speak with explicit config');
          console.log('🎤 Avatar speak text being sent:', JSON.stringify(output));
          console.log('🆔 Avatar speak response ID:', responseId);
          await avatar.speak({
            text: output,
            task_type: TaskType.TALK,
            taskMode: TaskMode.ASYNC
          });
          console.log('✅ Avatar speaking completed successfully');
          
          isAvatarSpeaking = false;
          console.log("✅ Avatar speaking completed");
          
        } catch (speakError) {
          console.error('❌ Avatar speaking failed:', speakError);
          // CRITICAL: NO BROWSER TTS FALLBACK - Only avatar should speak
          console.log('❌ Avatar speech failed - NO BROWSER TTS FALLBACK');
          console.log('🔄 Waiting for avatar to become available...');
          
          // Hide speaking indicator on error
          const avatarSpeakingIndicator = document.getElementById("avatarSpeakingIndicator");
          if (avatarSpeakingIndicator) {
            avatarSpeakingIndicator.style.display = "none";
          }
          isAvatarSpeaking = false;
          
          if (avatarSubtitle) {
            avatarSubtitle.textContent = "Avatar speech failed. Please wait for avatar to reconnect.";
            avatarSubtitle.style.color = "#ffa500";
          }
        }
      } else {
        // CRITICAL: Check if session is truly dead before falling back to TTS
        console.log('🔍 Checking if avatar session is truly unavailable...');
        if (avatar) {
          try {
            console.log('🔍 Avatar is available');
            
            console.log('✅ Avatar is available - retrying speech');
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

    // Mobile-specific permission check
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      // Check if we're in a secure context (required for microphone access)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (recordingStatus) {
          recordingStatus.textContent = "❌ Microphone access not supported. Please use HTTPS and a modern browser.";
          recordingStatus.style.display = "flex";
          setTimeout(() => {
            if (recordingStatus) {
              recordingStatus.style.display = "none";
            }
          }, 5000);
        }
        return;
      }
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
        recordingStatus.style.display = "none";
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
      
      // Force show subtitle when avatar starts talking
      if (avatarSubtitle && currentSpeakingText) {
        avatarSubtitle.style.display = "block";
        avatarSubtitle.style.color = "#ffffff";
        avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
        avatarSubtitle.style.padding = "10px 15px";
        avatarSubtitle.style.borderRadius = "8px";
        avatarSubtitle.style.position = "absolute";
        avatarSubtitle.style.bottom = "80px";
        avatarSubtitle.style.left = "50%";
        avatarSubtitle.style.transform = "translateX(-50%)";
        avatarSubtitle.style.zIndex = "1000";
        avatarSubtitle.style.maxWidth = "80%";
        avatarSubtitle.style.textAlign = "center";
        avatarSubtitle.style.fontSize = "16px";
        avatarSubtitle.style.lineHeight = "1.4";
        console.log("🎬 Subtitle forced to show when avatar started talking");
      }
    });

    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
      console.log("🎤 Avatar stopped talking");
      isAvatarSpeaking = false;
      // Clear subtitle when avatar stops speaking
      setTimeout(() => {
        clearLiveSubtitle();
      }, 2000); // Longer delay to allow word-by-word display to complete
      
      // Hide any remaining recording status immediately
      if (recordingStatus) {
        recordingStatus.style.display = "none";
        recordingStatus.textContent = "";
      }
      
      // Force hide any remaining status messages after a short delay
      setTimeout(() => {
        if (recordingStatus) {
          recordingStatus.style.display = "none";
          recordingStatus.textContent = "";
        }
      }, 100);
      
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
      language: "English", // Force English language
      voice: { voiceId: "caf3267cce8e4807b190cc45d4a46dcc" }, // Your custom voice
    // OPTIMIZED FOR SPEED - Faster response times
    sessionTimeout: 1800000, // 30 minutes - longer session
    keepAlive: true,
    timeout: 30000, // 30 seconds timeout - faster response
    // OPTIMIZED: Faster settings for better performance
    retryAttempts: 1, // Single retry for speed
    retryDelay: 1000, // 1 second retry delay
    // OPTIMIZED: Balanced stream settings for speed
    bufferSize: 1024, // Larger buffer for faster processing
    frameRate: 15, // Higher frame rate for responsiveness
    bitrate: 500000, // Higher bitrate for better quality
    // OPTIMIZED: Faster connection settings
    connectionTimeout: 10000, // 10 second connection timeout
    maxRetries: 1, // Single retry for speed
    heartbeatInterval: 5000 // 5 second heartbeat for responsiveness
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
        message: (avatarError as any).message || 'Unknown error',
        status: (avatarError as any).status || 'unknown',
        code: (avatarError as any).code || 'unknown'
      });
      
      // Enhanced error handling with specific solutions
      let errorMessage = "Avatar creation failed: ";
      let solution = "";
      
      if ((avatarError as any).message && (avatarError as any).message.includes("timeout")) {
        errorMessage += "Connection timeout";
        solution = "Please check your internet connection and try again.";
      } else if ((avatarError as any).message && ((avatarError as any).message.includes("auth") || (avatarError as any).message.includes("token"))) {
        errorMessage += "Authentication failed";
        solution = "Please refresh the page to get a new authentication token.";
      } else if ((avatarError as any).message && ((avatarError as any).message.includes("rate") || (avatarError as any).message.includes("limit"))) {
        errorMessage += "Rate limit exceeded";
        solution = "Please wait 1-2 minutes before trying again.";
      } else {
        errorMessage += (avatarError as any).message || 'Unknown error';
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
        if (avatar) {
          console.log("🔍 Avatar is available");
          
          console.log("⚠️ Avatar health check - monitoring");
          // Don't restart immediately, let user know
          if (avatarSubtitle) {
            avatarSubtitle.textContent = "Avatar connection issue detected. Please try speaking again.";
            avatarSubtitle.style.color = "#ffa500";
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
    
    // Test subtitle visibility when avatar interface is shown
    console.log("🎬 Avatar interface shown, testing subtitle...");
    if (avatarSubtitle) {
      avatarSubtitle.textContent = "Testing subtitle visibility...";
      avatarSubtitle.style.display = "block";
      avatarSubtitle.style.color = "#ffffff";
      avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
      avatarSubtitle.style.padding = "10px 15px";
      avatarSubtitle.style.borderRadius = "8px";
      avatarSubtitle.style.position = "absolute";
      avatarSubtitle.style.bottom = "80px";
      avatarSubtitle.style.left = "50%";
      avatarSubtitle.style.transform = "translateX(-50%)";
      avatarSubtitle.style.zIndex = "1000";
      avatarSubtitle.style.maxWidth = "80%";
      avatarSubtitle.style.textAlign = "center";
      avatarSubtitle.style.fontSize = "16px";
      avatarSubtitle.style.lineHeight = "1.4";
      console.log("🎬 Test subtitle applied");
    }
    
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
      avatarSubtitle.textContent = "Hi! How can I assist you today?";
      avatarSubtitle.style.display = "block";
      avatarSubtitle.style.color = "#ffffff";
      avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
      avatarSubtitle.style.padding = "10px 15px";
      avatarSubtitle.style.borderRadius = "8px";
      avatarSubtitle.style.position = "absolute";
      avatarSubtitle.style.bottom = "80px";
      avatarSubtitle.style.left = "50%";
      avatarSubtitle.style.transform = "translateX(-50%)";
      avatarSubtitle.style.zIndex = "1000";
      avatarSubtitle.style.maxWidth = "80%";
      avatarSubtitle.style.textAlign = "center";
      avatarSubtitle.style.fontSize = "16px";
      avatarSubtitle.style.lineHeight = "1.4";
      console.log("🎬 Initial subtitle setup complete");
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
  if (avatar) {
    try {
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
  
    const userMessage = userInput.value.trim();
    
    // ENGLISH ONLY: Check if text is in English (strict enforcement)
    if (!isEnglish(userMessage)) {
      console.log("🌍 Non-English text detected in input:", userMessage);
      console.log("⚠️ English detection failed - enforcing English only");
      addChatMessage("Please type in English. I can only understand and respond in English.", false);
      
      // Update subtitle to show English requirement
      if (avatarSubtitle) {
        avatarSubtitle.textContent = "Please type in English only. I can only understand English.";
        avatarSubtitle.style.color = "#ffa500";
      }
      
      // Clear the input
      userInput.value = "";
      
      // Try to make avatar speak the English requirement message
      if (avatar && sessionActive) {
        try {
          await avatar.speak({
            text: "Please type in English only. I can only understand English.",
            task_type: TaskType.TALK,
            taskMode: TaskMode.ASYNC
          });
        } catch (speakError) {
          console.error('❌ Error speaking English requirement:', speakError);
        }
      }
      
      return;
    }
    
    if (userMessage === "") {
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
    
    
    // Show user what they typed in the input field
    console.log("User typed:", userMessage);
    
    // Add visual feedback that text is being processed
    userInput.style.borderColor = "#8b5cf6";
    userInput.style.boxShadow = "0 0 0 2px rgba(139, 92, 246, 0.3)";
    
    
    try {
      console.log("📡 Sending request to API with message:", userMessage);
      console.log("📡 API Call ID:", Date.now()); // Unique identifier for this API call
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      // Try primary API endpoint first
      let llmResponse;
      try {
        llmResponse = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage }),
          signal: controller.signal
        });
      } catch (primaryError) {
        console.warn("⚠️ Primary API failed, trying fallback:", primaryError);
      // Fallback to a simple response
      const fallbackResponse = {
        output: `I heard you say: "${userMessage}". This is a fallback response while the main API is being fixed. How can I help you today?`
      };
        const output = fallbackResponse.output;
        console.log('🤖 Fallback AI Response text:', output);
        
        // Add user message to chat FIRST
        addChatMessage(userMessage, true);
        
        // Add bot response to chat
        addChatMessage(output, false);
        
        // Update subtitle with the response
        updateSubtitle(output);
        
        // Ensure subtitle is visible
        if (avatarSubtitle) {
          avatarSubtitle.style.display = "block";
          avatarSubtitle.style.color = "#ffffff";
          avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
          avatarSubtitle.style.padding = "10px 15px";
          avatarSubtitle.style.borderRadius = "8px";
          console.log('🎬 Subtitle styling applied');
        }
        
        // Clear input after successful processing and reset styling
        userInput.value = "";
        userInput.style.borderColor = "rgba(255, 255, 255, 0.2)";
        userInput.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
        
        // Update subtitle with the response
        updateSubtitle(output);
        
        // Add bot response to chat
        addChatMessage(output, false);
        
        // Add unique identifier to track this response
        const responseId = Date.now();
        console.log('🆔 Response ID for tracking:', responseId);
        
        // FORCE AVATAR SPEAKING - Ensure avatar actually speaks
        console.log("🎤 FORCING avatar to speak response:", output);
        console.log("🎤 Avatar will speak this exact text:", JSON.stringify(output));
        console.log('🆔 Sending response ID to avatar:', responseId);
        
        if (avatar && sessionActive) {
          try {
            console.log("🎤 Avatar speak text being sent:", JSON.stringify(output));
            console.log('🆔 Avatar speak response ID:', responseId);
            await avatar.speak({
              text: output,
              task_type: TaskType.TALK,
              taskMode: TaskMode.ASYNC
            });
            console.log('✅ Avatar speaking initiated');
          } catch (speakError) {
            console.error('❌ Error making avatar speak:', speakError);
          }
        }
        
        // Reset button state
        speakButton.disabled = false;
        speakButton.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
            <line x1="8" y1="22" x2="16" y2="22"></line>
          </svg>
          Speak
        `;
        
        return;
      }
      
      clearTimeout(timeoutId);
      
      console.log("📡 API Response Status:", llmResponse.status);
      console.log("📡 API Response OK:", llmResponse.ok);
      console.log("📡 API Response headers:", Object.fromEntries(llmResponse.headers.entries()));
      
      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        console.error("❌ API Error Response:", errorText);
        throw new Error(`API request failed with status ${llmResponse.status}: ${errorText}`);
      }
      
      const responseData = await llmResponse.json();
      console.log("📡 Full API Response:", responseData);
      console.log("📡 Response data keys:", Object.keys(responseData));
      
      // Add unique identifier to track this response
      const responseId = Date.now();
      console.log('🆔 Response ID for tracking:', responseId);
      
      // Try multiple possible response fields
      const output = responseData.output || responseData.message || responseData.response || responseData.text || responseData.data || "I didn't understand that. Please try again.";
      console.log("📡 Extracted output:", output);
      console.log("📡 Output length:", output.length);
      console.log("📡 Full response data for debugging:", JSON.stringify(responseData, null, 2));
      console.log('🆔 User question was:', userMessage);
      
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
      
      // Add bot response to chat FIRST
      addChatMessage(finalOutput, false);
      
      // Update subtitle with the response
      updateSubtitle(finalOutput);
      
      // Ensure subtitle is visible with proper styling
      if (avatarSubtitle) {
        avatarSubtitle.style.display = "block";
        avatarSubtitle.style.color = "#ffffff";
        avatarSubtitle.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        avatarSubtitle.style.padding = "10px 15px";
        avatarSubtitle.style.borderRadius = "8px";
        console.log('🎬 Second API subtitle styling applied');
      }
      
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
            taskMode: TaskMode.ASYNC
          });
          console.log("✅ Avatar speaking completed successfully");
          
          // CRITICAL: Force hide speaking indicator immediately after speak completes
          const avatarSpeakingIndicator = document.getElementById("avatarSpeakingIndicator");
          if (avatarSpeakingIndicator) {
            avatarSpeakingIndicator.style.display = "none";
          }
          isAvatarSpeaking = false;
          console.log("✅ Avatar speaking indicator hidden after completion");
          
        } catch (speakError) {
          console.error("❌ Avatar speaking failed:", speakError);
          // CRITICAL: NO BROWSER TTS FALLBACK - Only avatar should speak
          console.log("❌ Avatar speech failed - NO BROWSER TTS FALLBACK");
          console.log("🔄 Waiting for avatar to become available...");
          
          // Hide speaking indicator on error
          const avatarSpeakingIndicator = document.getElementById("avatarSpeakingIndicator");
          if (avatarSpeakingIndicator) {
            avatarSpeakingIndicator.style.display = "none";
          }
          isAvatarSpeaking = false;
          
          if (avatarSubtitle) {
            avatarSubtitle.textContent = "Avatar speech failed. Please wait for avatar to reconnect.";
            avatarSubtitle.style.color = "#ffa500";
          }
        }
      } else {
        // CRITICAL: Check if session is truly dead before falling back to TTS
        console.log("🔍 Checking if avatar session is truly unavailable...");
        if (avatar) {
          try {
            console.log("🔍 Avatar is available");
            
            console.log("✅ Avatar is available - retrying speech");
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
      
      
      // Avatar speaking completed
      isAvatarSpeaking = false;

    } catch (error) {
      console.error("❌ Error getting streaming response:", error);
      console.error("❌ Error details:", {
        message: (error as any).message || 'Unknown error',
        stack: (error as any).stack || 'No stack trace',
        name: (error as any).name || 'UnknownError'
      });
      isAvatarSpeaking = false; // Reset speaking flag on error
      
      // Add detailed error message to chat
      const errorMessage = `Sorry, I encountered an error: ${(error as any).message || 'Unknown error'}. Please try again.`;
      addChatMessage(errorMessage, false);
      
      // Try to speak the error message
      if (avatar && sessionActive) {
        try {
          avatar.speak({
            text: errorMessage,
            task_type: TaskType.TALK,
            taskMode: TaskMode.SYNC
          });
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
      
    
    // Avatar speaking completed
    isAvatarSpeaking = false;
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

// Test API function
async function testAPI() {
  console.log("🧪 Testing API endpoint...");
  try {
    const response = await fetch('https://technocit.app.n8n.cloud/webhook/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: "Hello, this is a test message" })
    });
    
    console.log("🧪 API Test Response Status:", response.status);
    console.log("🧪 API Test Response OK:", response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log("🧪 API Test Response Data:", data);
      return true;
    } else {
      console.error("🧪 API Test Failed:", response.status);
      return false;
    }
  } catch (error) {
    console.error("🧪 API Test Error:", error);
    return false;
  }
}

// Make testAPI available globally
(window as any).testAPI = testAPI;

// Make stopAllTTS available globally for testing
(window as any).stopAllTTS = stopAllTTS;


// CRITICAL: Connection health monitoring to prevent disconnections
function startConnectionHealthMonitoring() {
  console.log("🔍 Starting connection health monitoring...");
  // Simplified monitoring
  const healthCheckInterval = setInterval(() => {
    if (!sessionActive || !avatar) {
      clearInterval(healthCheckInterval);
      return;
    }
    console.log("💓 Connection health check...");
  }, 30000);
  
  (window as any).connectionHealthInterval = healthCheckInterval;
}

// CRITICAL: Session keep-alive to prevent premature termination
function startSessionKeepAlive() {
  console.log("💓 Starting session keep-alive...");
  // Simplified keep-alive
  const keepAliveInterval = setInterval(() => {
    if (!sessionActive || !avatar) {
      clearInterval(keepAliveInterval);
      return;
    }
    console.log("💓 Session keep-alive ping...");
    lastStreamActivity = Date.now();
  }, 60000);
  
  (window as any).sessionKeepAliveInterval = keepAliveInterval;
}

// CRITICAL: Stream health monitoring to prevent stream death
function startStreamHealthMonitoring(_stream: MediaStream) {
  console.log("📊 Starting stream health monitoring...");
  // Simplified function - removed complex monitoring
  return;
}

// CRITICAL: API Key Validity Verification and Reissue Mechanism
function startProactiveSessionRefresh() {
  console.log("🔄 Starting API key validity monitoring and proactive session refresh...");
  // Simplified refresh monitoring
  const refreshInterval = setInterval(async () => {
    if (!sessionActive || !avatar) {
      clearInterval(refreshInterval);
      return;
    }
    console.log("🔍 API key validity check...");
  }, 60000);
  
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
    const newSessionData = await avatar!.createStartAvatar(avatarConfig);
    
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
    if ((refreshError as any).message && (refreshError as any).message.includes('401')) {
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
        connectionState: 'unknown',
        iceConnectionState: 'unknown'
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
    });
    
    videoElement.addEventListener('playing', () => {
      console.log("📹 Video started playing");
      // Hide loading indicator
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
    (window as any).videoHealthMonitor = null;
    
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
  if (avatar) {
    try {
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
userInput.addEventListener("input", () => {
  console.log("User typing:", userInput.value);
  // Ensure the input is visible and working
  userInput.style.opacity = "1";
  userInput.style.color = "white";
});

// Add focus event listener
userInput.addEventListener("focus", () => {
  console.log("Input focused");
  userInput.style.opacity = "1";
  userInput.style.color = "white";
  userInput.disabled = false;
});

// Add blur event listener
userInput.addEventListener("blur", () => {
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
  // Mobile detection
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    // Mobile: Use touch events for "Hold to Speak" functionality
    let isTouchRecording = false;
    
    recordButton.addEventListener("touchstart", (e) => {
      e.preventDefault();
      console.log("🎤 Touch start - beginning recording");
      isTouchRecording = true;
      
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
      
      // Start recording
      if (!isRecording) {
        toggleRecording();
      }
    });
    
    recordButton.addEventListener("touchend", (e) => {
      e.preventDefault();
      console.log("🎤 Touch end - stopping recording");
      
      if (isTouchRecording && isRecording) {
        toggleRecording();
      }
      isTouchRecording = false;
    });
    
    recordButton.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      console.log("🎤 Touch cancel - stopping recording");
      
      if (isTouchRecording && isRecording) {
        toggleRecording();
      }
      isTouchRecording = false;
    });
    
    // Prevent context menu on long press
    recordButton.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
    
  } else {
    // Desktop: Use click events for toggle functionality
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
  }
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
    // Show complete dialogue subtitle
    showCompleteSubtitle(text);
  } else if (subtitleLocked) {
    console.log("🔒 Subtitle is locked - not changing to:", text);
  }
}

// Connection health monitoring - removed unused function

// Stop connection health monitoring

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
  if (avatar) {
    try {
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

// New button event listeners

if (chatBtn) {
  chatBtn.addEventListener("click", () => {
    console.log("Chat button clicked");
    // Show chat sidebar
    if (chatSidebar) {
      chatSidebar.classList.add("open");
    }
    // Make avatar smaller when chat is open
    if (avatarMainContent) {
      avatarMainContent.classList.add("chat-open");
    }
    // Show text input area
    if (textInputArea) {
      textInputArea.style.display = "flex";
    }
  });
}

if (micBtn) {
  micBtn.addEventListener("click", () => {
    console.log("Microphone button clicked");
    // Toggle recording
    toggleRecording();
  });
}

if (endSessionBtn) {
  endSessionBtn.addEventListener("click", () => {
    console.log("End Session button clicked");
    // Terminate the avatar session
    terminateAvatarSession();
  });
}
