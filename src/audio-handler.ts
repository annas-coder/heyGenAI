export class VoiceRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private isRecording = false;

    private onStatusChange: (status: string) => void;
    private onTranscriptionComplete: (text: string) => void;

    constructor(
        onStatusChange: (status: string) => void,
        onTranscriptionComplete: (text: string) => void
    ) {
        this.onStatusChange = onStatusChange;
        this.onTranscriptionComplete = onTranscriptionComplete;
    }

    async startRecording() {
        try {
            console.log('🎤 Requesting microphone access...');
            this.onStatusChange('🎤 Requesting microphone access...');
            
            // Mobile-specific audio constraints
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const audioConstraints: MediaTrackConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                // Mobile-specific optimizations
                ...(isMobile && {
                    sampleRate: 16000, // Lower sample rate for mobile
                    channelCount: 1,    // Mono for mobile
                    latency: 0.1       // Lower latency for mobile
                }),
                // Desktop optimizations
                ...(!isMobile && {
                    sampleRate: 44100
                })
            };
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: audioConstraints
            });
            console.log('✅ Microphone access granted');
            
            // Mobile-specific MIME type selection
            let mimeType = 'audio/webm;codecs=opus';
            if (isMobile) {
                // Prefer formats that work better on mobile
                if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                    mimeType = 'audio/webm';
                } else if (MediaRecorder.isTypeSupported('audio/wav')) {
                    mimeType = 'audio/wav';
                }
            } else {
                // Desktop fallback chain
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'audio/webm';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        mimeType = 'audio/mp4';
                    }
                }
            }
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType
            });
            
            this.audioChunks = [];
            this.isRecording = true;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('📦 Audio chunk received:', event.data.size, 'bytes');
                }
            };

            this.mediaRecorder.onstop = async () => {
                console.log('🔄 Recording stopped, processing...');
                
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                console.log('📦 Audio blob size:', audioBlob.size, 'bytes');
                
                if (audioBlob.size > 1000) { // At least 1KB
                    await this.sendToElevenLabs(audioBlob);
                } else {
                    this.onStatusChange('❌ Recording too short, please speak longer');
                    setTimeout(() => this.onStatusChange(''), 3000);
                }
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('❌ MediaRecorder error:', event);
                this.onStatusChange('❌ Recording error occurred');
            };

            this.mediaRecorder.start(100); // Collect data every 100ms
            this.onStatusChange('🎤 Recording... Speak now!');
            console.log('🔴 Recording started with mimeType:', mimeType);
            
        } catch (error) {
            console.error('❌ Error starting recording:', error);
            const errorMessage = (error as Error).message;
            console.error('❌ Error details:', errorMessage);
            
            // Mobile-specific error handling
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
                if (isMobile) {
                    this.onStatusChange('❌ Microphone access denied. Please allow microphone access in your browser settings and try again.');
                } else {
                    this.onStatusChange('❌ Microphone access denied. Please allow microphone access and try again.');
                }
            } else if (errorMessage.includes('NotFoundError')) {
                this.onStatusChange('❌ No microphone found. Please connect a microphone and try again.');
            } else if (errorMessage.includes('NotSupportedError') || errorMessage.includes('NotReadableError')) {
                if (isMobile) {
                    this.onStatusChange('❌ Audio recording not supported on this device. Please try a different browser.');
                } else {
                    this.onStatusChange('❌ Audio recording not supported. Please try a different browser.');
                }
            } else if (errorMessage.includes('OverconstrainedError')) {
                this.onStatusChange('❌ Audio constraints not supported. Trying with basic settings...');
                // Try with basic constraints
                try {
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                    console.log('✅ Basic audio stream obtained');
                    // Continue with basic stream...
                } catch (basicError) {
                    this.onStatusChange('❌ Unable to access microphone. Please check your device settings.');
                }
            } else {
                this.onStatusChange('❌ Error: ' + errorMessage);
            }
            setTimeout(() => this.onStatusChange(''), 5000);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            console.log('⏹️ Stopping recording...');
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Stop all tracks in the stream
            const stream = this.mediaRecorder.stream;
            stream.getTracks().forEach(track => track.stop());
        }
    }

    private async sendToElevenLabs(audioBlob: Blob) {
        try {
            console.log('Sending audio to ElevenLabs STT API...');
            
            const formData = new FormData();
            
            // Determine file extension based on blob type and mobile compatibility
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            let fileName = 'audio.webm';
            
            if (audioBlob.type.includes('mp4')) {
                fileName = 'audio.mp4';
            } else if (audioBlob.type.includes('wav')) {
                fileName = 'audio.wav';
            } else if (audioBlob.type.includes('ogg')) {
                fileName = 'audio.ogg';
            } else if (isMobile && audioBlob.type.includes('webm')) {
                // Mobile devices sometimes have issues with webm, try to convert
                fileName = 'audio.webm';
            }
            
            formData.append('file', audioBlob, fileName);
            formData.append("model_id", "scribe_v1");
            // Remove language restriction to allow all languages
            // formData.append("language", "en");
            
            console.log('📤 Sending audio file:', fileName, 'Size:', audioBlob.size, 'Type:', audioBlob.type);
            
            const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
            if (!apiKey) {
                throw new Error('ElevenLabs API key not found. Please check your environment variables.');
            }
            
            console.log('🔑 Using API key:', apiKey.substring(0, 8) + '...');
            
            const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                },
                body: formData
            });

            console.log('📡 Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ API Error:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
            }

            const data = await response.json();
            console.log('📝 Received transcription:', data);
            
            const transcribedText = data.text || '';
            
            if (transcribedText && transcribedText.trim().length > 0) {
                console.log('✅ Transcription received:', transcribedText);
                this.onTranscriptionComplete(transcribedText);
            } else {
                console.log('⚠️ Empty transcription');
                this.onStatusChange('❌ No speech detected, please try again');
                setTimeout(() => this.onStatusChange(''), 3000);
            }
        } catch (error) {
            console.error('❌ Error transcribing audio:', error);
            this.onStatusChange('❌ Error: Failed to transcribe audio');
            setTimeout(() => {
                this.onStatusChange('');
            }, 3000);
        }
    }

    isCurrentlyRecording(): boolean {
        return this.isRecording;
    }
}
