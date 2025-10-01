import OpenAI from "openai";
 
export class OpenAIAssistant {
  private client: OpenAI;
  private assistant: any;
  private thread: any;
 
  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://technocit.app.n8n.cloud/webhook/v1/",
      dangerouslyAllowBrowser: true,
    });
  }
 
  async initialize(
    instructions: string = `You are an English tutor. Help students improve their language skills by:
    - Correcting mistakes in grammar and vocabulary
    - Explaining concepts with examples
    - Engaging in conversation practice 
    - Providing learning suggestions
    Be friendly, adapt to student's level, and always give concise answers.`
  ) {
    // Create an assistant
    this.assistant = await this.client.beta.assistants.create({
      name: "English Tutor Assistant",
      instructions,
      tools: [],
      model: "gpt-4-turbo-preview",
    });
 
    // Create a thread
    this.thread = await this.client.beta.threads.create();
  }
 
  async getResponse(userMessage: string): Promise<string> {
    if (!this.assistant || !this.thread) {
      throw new Error("Assistant not initialized. Call initialize() first.");
    }

    // Add user message to thread
    await this.client.beta.threads.messages.create(this.thread.id, {
      role: "user",
      content: userMessage,
    });

    // Create and run the assistant
    const run = await this.client.beta.threads.runs.createAndPoll(
      this.thread.id,
      { assistant_id: this.assistant.id }
    );

    if (run.status === "completed") {
      // Get the assistant's response
      const messages = await this.client.beta.threads.messages.list(
        this.thread.id
      );

      // Get the latest assistant message
      const lastMessage = messages.data.find(
        (msg) => msg.role === "assistant"
      );

      if (lastMessage && lastMessage.content[0].type === "text") {
        return lastMessage.content[0].text.value;
      }
    }

    return "Sorry, I couldn't process your request.";
  }

  // New streaming method for better HeyGen avatar integration
  async getStreamingResponse(
    userMessage: string,
    _onChunk: (chunk: string) => void,
    onComplete: (fullResponse: string) => void
  ): Promise<void> {
    if (!this.assistant || !this.thread) {
      throw new Error("Assistant not initialized. Call initialize() first.");
    }

    try {
      // Add user message to thread
      await this.client.beta.threads.messages.create(this.thread.id, {
        role: "user",
        content: userMessage,
      });

      // Create and run the assistant
      const run = await this.client.beta.threads.runs.createAndPoll(
        this.thread.id,
        { 
          assistant_id: this.assistant.id
        }
      );

      if (run.status === "completed") {
        // Get the assistant's response
        const messages = await this.client.beta.threads.messages.list(
          this.thread.id
        );

        // Get the latest assistant message
        const lastMessage = messages.data.find(
          (msg) => msg.role === "assistant"
        );

        if (lastMessage && lastMessage.content[0].type === "text") {
          const fullResponse = lastMessage.content[0].text.value;
          onComplete(fullResponse);
        } else {
          onComplete("Sorry, I couldn't process your request.");
        }
      } else {
        onComplete("Sorry, I couldn't process your request.");
      }
    } catch (error) {
      console.error("Error in streaming response:", error);
      onComplete("Sorry, I encountered an error processing your request.");
    }
  }

  // Alternative method using direct chat completions for better streaming
  async getStreamingChatResponse(
    userMessage: string,
    onChunk: (chunk: string) => void,
    onComplete: (fullResponse: string) => void
  ): Promise<void> {
    try {
      const stream = await this.client.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are an English tutor. Help students improve their language skills by:
            - Correcting mistakes in grammar and vocabulary
            - Explaining concepts with examples
            - Engaging in conversation practice
            - Providing learning suggestions
            Be friendly, adapt to student's level, and always give concise answers.`
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        stream: true,
      });

      let fullResponse = "";
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          onChunk(content);
        }
      }
      
      onComplete(fullResponse);
    } catch (error) {
      console.error("Error in streaming chat response:", error);
      onComplete("Sorry, I encountered an error processing your request.");
    }
  }
}