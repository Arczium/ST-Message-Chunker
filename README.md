# ST-Message-Chunker

A [SillyTavern](https://github.com/SillyTavern/SillyTavern) extension that manages chat context length by removing older messages in bulk (chunks) rather than one by one. This approach is significantly more **prompt-cache friendly** for LLMs, making generation faster and potentially saving API costs.

## Features

* **Cache-Friendly Context Management**: Instead of sliding the context window one message at a time (which forces the LLM to frequently discard and rebuild its prompt cache), this extension removes a specified "chunk" of messages all at once. This maximizes cache hits.
* **Non-Destructive Truncation**: The extension slices the chat payload at the very last step during generation (`GENERATE_BEFORE_COMBINE_PROMPTS`). This ensures it **does not interfere** with Vector Storage, Summarization, or Memory/Lorebooks.
* **Clean Alternative to Native Hiding**: A perfect solution if you rely heavily on Summarization to remember past events and simply want to drop old chat history from the prompt. It avoids the bugs and conflicts often associated with SillyTavern's native message hiding feature.
* **Two Operating Modes**: Choose between strict Token limits or straightforward Message counts.

## Operating Modes

### 1. Message Count Mode
Keeps your chat history at a stable length based on the raw number of messages.
* **Minimum Messages to Keep**: The baseline number of messages you want preserved in context.
* **Chunk Size**: The number of messages to remove at once when the limit is exceeded.
* *Example*: Minimum = 30, Chunk = 10. The extension allows the chat to build up to 40 messages, then seamlessly slices off the oldest 10, bringing the prompt back down to 30.

### 2. Max Tokens Mode
Evaluates the actual token count of the chat history.
* **Maximum Context Tokens**: The absolute token limit for the chat messages.
* **Chunk Size**: The number of messages to remove at a time until the context successfully falls back under your set token limit.

## Installation

1. Open SillyTavern and navigate to the **Extensions** menu (the block icon).
2. Click on **Install Extension**.
3. Paste the repository link: [https://github.com/Arczium/ST-Message-Chunker](https://github.com/Arczium/ST-Message-Chunker) and click install.
4. Refresh SillyTavern and configure the settings in the Extensions menu.


## Credits & License

**Inspiration:** The core concept was inspired by Omegastick's `SillyTavern-CacheChunker`, which appears to have been abandoned roughly two years ago. Because the original project lacked an open-source license, this extension is a complete rewrite so it can be properly released and maintained under the MIT license.

**License:** MIT