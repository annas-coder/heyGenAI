/**
 * VoiceRecorder class handles audio recording and transcription
 */
export class VoiceRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private isRecording = false;
    private readonly onStatusChange: (status: string) => void;
    private readonly onTranscriptionComplete: (text: string) => void;

    constructor(
        onStatusChange: (status: string) => void,
        onTranscriptionComplete: (text: string) => void
    ) {
        this.onStatusChange = onStatusChange;
        this.onTranscriptionComplete = onTranscriptionComplete;
    }

    /**
     * Starts audio recording
     */
    async startRecording(): Promise<void> {
        try {
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia is not supported in this browser or environment');
            }

            // Check if we're on HTTPS (required for getUserMedia in production)
            if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                throw new Error('Microphone access requires HTTPS in production. Please use HTTPS or localhost.');
            }

            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            this.isRecording = true;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                
                if (audioBlob.size > 1000) { // At least 1KB
                    await this.sendToElevenLabs(audioBlob);
                } else {
                    this.onStatusChange('❌ Recording too short');
                    setTimeout(() => this.onStatusChange(''), 2000);
                }
            };

            this.mediaRecorder.start();
            this.onStatusChange('🎤 Recording... Speak now!');
            
        } catch (error) {
            // Error starting recording - handled by status callback
            this.onStatusChange('❌ Error: ' + (error as Error).message);
        }
    }

    /**
     * Stops audio recording
     */
    stopRecording(): void {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.onStatusChange('🔄 Processing audio...');
            
            // Stop all tracks in the stream
            const stream = this.mediaRecorder.stream;
            stream.getTracks().forEach(track => track.stop());
        }
    }

    /**
     * Sends audio blob to ElevenLabs for transcription
     * @param audioBlob - The recorded audio blob
     */
    private async sendToElevenLabs(audioBlob: Blob): Promise<void> {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.wav');
            formData.append("model_id", "scribe_v1");
            
            const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
                method: 'POST',
                headers: {
                    'xi-api-key': import.meta.env.VITE_ELEVENLABS_API_KEY,
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
            }

            const data = await response.json();
            const transcribedText = data.text || '';
            
            if (transcribedText.trim().length > 0) {
                this.onStatusChange('✅ Getting AI response...');
                this.onTranscriptionComplete(transcribedText);
            } else {
                this.onStatusChange('');
            }
        } catch (error) {
            // Error transcribing audio - handled by status callback
            this.onStatusChange('❌ Error: Failed to transcribe audio');
            setTimeout(() => {
                this.onStatusChange('');
            }, 2000);
        }
    }

    /**
     * Returns whether the recorder is currently recording
     * @returns boolean - True if recording, false otherwise
     */
    isCurrentlyRecording(): boolean {
        return this.isRecording;
    }

    /**
     * Checks if microphone access is available
     * @returns Promise<boolean> - True if microphone access is available
     */
    static async isMicrophoneAvailable(): Promise<boolean> {
        try {
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return false;
            }

            // Check if we're on HTTPS (required for getUserMedia in production)
            if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                return false;
            }

            // Try to get microphone permissions
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop the stream immediately as we just wanted to check permissions
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            return false;
        }
    }
}
