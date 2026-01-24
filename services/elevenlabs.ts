
export const streamAudioFromElevenLabs = async (text: string, apiKey: string, voiceId: string, outputContext: AudioContext, outputAnalyser: AnalyserNode | null): Promise<void> => {
    if (!apiKey || !voiceId) {
        console.error("ElevenLabs API Key or Voice ID missing");
        return;
    }

    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": apiKey,
            },
            body: JSON.stringify({
                text,
                model_id: "eleven_turbo_v2_5", // Using Turbo v2.5 for low latency
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API Error: ${response.statusText}`);
        }

        if (!response.body) return;

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // Combine chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const audioData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            audioData.set(chunk, offset);
            offset += chunk.length;
        }

        // Decode and play
        // Note: decodeAudioData accepts the full MP3 file buffer
        const audioBuffer = await outputContext.decodeAudioData(audioData.buffer);

        const source = outputContext.createBufferSource();
        source.buffer = audioBuffer;
        if (outputAnalyser) {
            source.connect(outputAnalyser);
        } else {
            source.connect(outputContext.destination);
        }
        source.start();

        return new Promise((resolve) => {
            source.onended = () => resolve();
        });

    } catch (error) {
        console.error("ElevenLabs Stream Error:", error);
        throw error;
    }
};
