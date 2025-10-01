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
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            console.log('✅ Microphone access granted');
            
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
                console.log('🔄 Recording stopped, processing...');
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                console.log('📦 Audio blob size:', audioBlob.size, 'bytes');
                
                if (audioBlob.size > 1000) { // At least 1KB
                    await this.sendToElevenLabs(audioBlob);
                } else {
                    this.onStatusChange('❌ Recording too short');
                    setTimeout(() => this.onStatusChange(''), 2000);
                }
            };

            this.mediaRecorder.start();
            this.onStatusChange('🎤 Recording... Speak now!');
            console.log('🔴 Recording started');
            
        } catch (error) {
            console.error('❌ Error starting recording:', error);
            this.onStatusChange('❌ Error: ' + (error as Error).message);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            console.log('⏹️ Stopping recording...');
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.onStatusChange('🔄 Processing audio...');
            
            // Stop all tracks in the stream
            const stream = this.mediaRecorder.stream;
            stream.getTracks().forEach(track => track.stop());
        }
    }

    private async sendToElevenLabs(audioBlob: Blob) {
        try {
            console.log('Sending audio to ElevenLabs STT API...');
            
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
            console.log('Received transcription:', data);
            
            const transcribedText = data.text || '';
            
            if (transcribedText && transcribedText.trim().length > 0) {
                console.log('✅ Transcription received:', transcribedText);
                this.onStatusChange('✅ Getting AI response...');
                this.onTranscriptionComplete(transcribedText);
            } else {
                console.log('⚠️ Empty transcription');
                this.onStatusChange('');
            }
        } catch (error) {
            console.error('❌ Error transcribing audio:', error);
            this.onStatusChange('❌ Error: Failed to transcribe audio');
            setTimeout(() => {
                this.onStatusChange('');
            }, 2000);
        }
    }

    isCurrentlyRecording(): boolean {
        return this.isRecording;
    }
}
