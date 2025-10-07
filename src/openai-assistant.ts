import OpenAI from "openai";

/**
 * OpenAIAssistant class for handling OpenAI API interactions
 * Note: Currently not used in the main application but kept for future features
 */
export class OpenAIAssistant {
  private readonly client: OpenAI;
  private assistant: any;
  private thread: any;
 
  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://technocit.app.n8n.cloud/webhook/v1/",
      dangerouslyAllowBrowser: true,
    });
  }
 
  /**
   * Initializes the OpenAI assistant and thread
   * @param instructions - Custom instructions for the assistant
   */
  async initialize(
    instructions: string = `You are an English tutor. Help students improve their language skills by:
    - Correcting mistakes in grammar and vocabulary
    - Explaining concepts with examples
    - Engaging in conversation practice 
    - Providing learning suggestions
    Be friendly, adapt to student's level, and always give concise answers.`
  ): Promise<void> {
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
 
  /**
   * Gets a response from the OpenAI assistant
   * @param userMessage - The user's message
   * @returns Promise<string> - The assistant's response
   */
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

  /**
   * Gets a streaming response from the OpenAI assistant
   * @param userMessage - The user's message
   * @param _onChunk - Callback for streaming chunks (currently unused)
   * @param onComplete - Callback for the complete response
   */
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
      // Error in streaming response - handled by callback
      onComplete("Sorry, I encountered an error processing your request.");
    }
  }

  /**
   * Alternative method using direct chat completions for better streaming
   * @param userMessage - The user's message
   * @param onChunk - Callback for streaming chunks
   * @param onComplete - Callback for the complete response
   */
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
      // Error in streaming chat response - handled by callback
      onComplete("Sorry, I encountered an error processing your request.");
    }
  }
}