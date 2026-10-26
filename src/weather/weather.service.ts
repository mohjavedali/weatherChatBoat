import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
    Logger,
} from '@nestjs/common';

import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import {
    StateGraph,
    Annotation,
    messagesStateReducer,
} from '@langchain/langgraph';
import { RedisSaver } from '@langchain/langgraph-checkpoint-redis';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import {
    BaseMessage,
    HumanMessage,
    AIMessage,
} from '@langchain/core/messages';

import { createClient, RedisClientType } from 'redis';
import { weatherTool } from './tools/weather.tool.js';

const StateAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: messagesStateReducer,
        default: () => [],
    }),
});

@Injectable()
export class WeatherService
    implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(WeatherService.name);

    private model: any;
    private graph: any;
    private vectorStore: Chroma;
    private embeddings: OllamaEmbeddings;
    private redisClient: RedisClientType;

    async onModuleInit() {
        const ollamaBaseUrl =
            process.env.OLLAMA_BASE_URL ||
            'http://host.docker.internal:11434';

        // 1. Initialize Ollama embeddings
        this.embeddings = new OllamaEmbeddings({
            model:
                process.env.OLLAMA_EMBEDDING_MODEL ||
                'nomic-embed-text',
            baseUrl: ollamaBaseUrl,
        });

        // 2. Initialize ChromaDB
        this.vectorStore = new Chroma(this.embeddings, {
            collectionName:
                process.env.CHROMA_COLLECTION_NAME ||
                'weather-collection',
            url:
                process.env.CHROMA_URL ||
                'http://localhost:8000',
        });

        // 3. Initialize Redis
        this.redisClient = createClient({
            url:
                process.env.REDIS_URL ||
                'redis://localhost:6379',
        });

        this.redisClient.on('error', (error) => {
            this.logger.error(`Redis error: ${error.message}`);
        });

        await this.redisClient.connect();

        const checkpointer = new RedisSaver(this.redisClient);

        // 4. Initialize Ollama chat model with weather tool
        this.model = new ChatOllama({
            baseUrl: ollamaBaseUrl,
            model:
                process.env.OLLAMA_CHAT_MODEL ||
                'qwen2.5:1.5b',
            temperature: 0,
        }).bindTools([weatherTool]);

        // 5. Initialize tool node
        const toolNode = new ToolNode([weatherTool]);

        // 6. Call the language model
        const callModel = async (
            state: typeof StateAnnotation.State,
        ) => {
            const response: AIMessage =
                await this.model.invoke(state.messages);

            this.logger.debug(
                `AI response: ${JSON.stringify({
                    content: response.content,
                    toolCalls: response.tool_calls,
                })}`,
            );

            return {
                messages: [response],
            };
        };

        // 7. Decide whether to execute a tool or finish
        const shouldContinue = (
            state: typeof StateAnnotation.State,
        ) => {
            const lastMessage = state.messages[
                state.messages.length - 1
            ] as AIMessage;

            // LangChain normally exposes parsed tool calls here.
            // Check additional_kwargs as a compatibility fallback.
            const toolCalls =
                lastMessage.tool_calls?.length
                    ? lastMessage.tool_calls
                    : (lastMessage.additional_kwargs as any)
                        ?.tool_calls;

            if (toolCalls?.length) {
                this.logger.log('Executing weather tool');
                return 'tools';
            }

            return '__end__';
        };

        // 8. Construct LangGraph workflow
        this.graph = new StateGraph(StateAnnotation)
            .addNode('agent', callModel)
            .addNode('tools', toolNode)
            .addEdge('__start__', 'agent')
            .addConditionalEdges('agent', shouldContinue)
            .addEdge('tools', 'agent')
            .compile({
                checkpointer,
            });

        this.logger.log('Weather LangGraph initialized');
    }

    async onModuleDestroy() {
        if (this.redisClient?.isOpen) {
            await this.redisClient.quit();
        }
    }

    /**
     * Search ChromaDB for relevant context.
     */
    async queryVectorDB(query: string): Promise<string> {
        try {
            const results =
                await this.vectorStore.similaritySearch(query, 1);

            if (results?.length > 0) {
                return `Relevant Domain Context: ${results[0].pageContent}`;
            }

            return '';
        } catch (error) {
            this.logger.error(
                `ChromaDB lookup failed: ${error.message}`,
            );

            return '';
        }
    }

    /**
     * Handle user prompts using LangGraph and Ollama.
     */
    async handleWeatherQuery(
        userPrompt: string,
        threadId: string,
    ): Promise<{ response: string; threadId: string }> {

        try {
            // 1. Retrieve relevant context
            const vectorContext =
                await this.queryVectorDB(userPrompt);

            const content = vectorContext
                ? `${vectorContext}\n\nUser Input: ${userPrompt}`
                : userPrompt;

            // 2. Configure conversation memory
            const config = {
                configurable: {
                    thread_id: threadId,
                },
            };

            // 3. Invoke LangGraph
            const finalState = await this.graph.invoke(
                {
                    messages: [
                        new HumanMessage(content),
                    ],
                },
                config,
            );

            // 4. Find the latest assistant message
            const messages: BaseMessage[] =
                finalState.messages || [];

            const finalMessage = [...messages]
                .reverse()
                .find((message) => message instanceof AIMessage);

            if (!finalMessage) {
                this.logger.error(
                    'No AI assistant message was returned',
                );

                return {
                    response:
                        'The AI could not generate a response. Please try again.',
                    threadId,
                };
            }

            // 5. Extract response content
            const messageContent = finalMessage.content;

            let response = '';

            if (typeof messageContent === 'string') {
                response = messageContent.trim();
            } else if (Array.isArray(messageContent)) {
                response = messageContent
                    .map((item: any) => {
                        if (typeof item === 'string') {
                            return item;
                        }

                        if (item.type === 'text') {
                            return item.text || '';
                        }

                        return '';
                    })
                    .join('\n')
                    .trim();
            }

            // 6. Return the final response
            if (!response) {
                this.logger.warn(
                    `Empty assistant response for thread ${threadId}`,
                );
            }

            return {
                response,
                threadId,
            };
        } catch (error) {
            this.logger.error(
                `Weather query failed: ${error.message}`,
                error.stack,
            );

            throw error;
        }
    }

    /**
     * Add a document to ChromaDB.
     */
    async ingestDocument(
        text: string,
        metadata: Record<string, any> = {},
    ): Promise<void> {
        await this.vectorStore.addDocuments([
            {
                pageContent: text,
                metadata,
            },
        ]);
    }

    async getDatabaseSnapshot(): Promise<any> {
        try {
            // Access the underlying collection manager inside LangChain's Chroma wrapper
            const collection = await this.vectorStore.ensureCollection();
            const data = await collection.get();

            return {
                totalCount: await collection.count(),
                documents: data.documents,
                metadata: data.metadatas,
                ids: data.ids
            };
        } catch (error) {
            console.error('Failed to get snapshot from Chroma:', error.message);
            return { error: 'Failed to inspect database', message: error.message };
        }
    }
}