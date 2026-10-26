var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { RedisSaver } from '@langchain/langgraph-checkpoint-redis';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import { createClient } from 'redis';
import { weatherTool } from './tools/weather.tool.js';
const StateAnnotation = Annotation.Root({
    messages: Annotation({
        reducer: messagesStateReducer,
        default: () => [],
    }),
});
let WeatherService = class WeatherService {
    model;
    graph;
    vectorStore;
    embeddings;
    redisClient;
    async onModuleInit() {
        // 1. Initialize local Ollama embeddings
        this.embeddings = new OllamaEmbeddings({
            model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://docker.internal',
        });
        // 2. Initialize Chroma VectorDB
        this.vectorStore = new Chroma(this.embeddings, {
            collectionName: process.env.CHROMA_COLLECTION_NAME || 'weather-collection',
            url: process.env.CHROMA_URL || 'http://localhost:8000',
        });
        // 3. Setup Redis Client & Checkpointer
        this.redisClient = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        });
        await this.redisClient.connect();
        const checkpointer = new RedisSaver(this.redisClient);
        // 4. Setup Local Ollama LLM bound with tools
        // 'host.docker.internal' lets the Docker container communicate with Ollama running on your Windows/Mac host
        this.model = new ChatOllama({
            baseUrl: 'http://docker.internal',
            model: 'qwen2.5:1.5b',
            temperature: 0,
        }).bindTools([weatherTool]);
        // 5. Construct LangGraph Workflow
        const toolNode = new ToolNode([weatherTool]);
        const callModel = async (state) => {
            const response = await this.model.invoke(state.messages);
            return { messages: [response] };
        };
        const shouldContinue = (state) => {
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage.additional_kwargs.tool_calls?.length) {
                return 'tools';
            }
            return '__end__';
        };
        this.graph = new StateGraph(StateAnnotation)
            .addNode('agent', callModel)
            .addNode('tools', toolNode)
            .addEdge('__start__', 'agent')
            .addConditionalEdges('agent', shouldContinue)
            .addEdge('tools', 'agent')
            .compile({ checkpointer });
    }
    async onModuleDestroy() {
        if (this.redisClient) {
            await this.redisClient.disconnect();
        }
    }
    /**
     * Queries Chroma DB using similarity search
     */
    async queryVectorDB(query) {
        try {
            const results = await this.vectorStore.similaritySearch(query, 1);
            if (results && results.length > 0) {
                return `Relevant Domain Context: ${results[0].pageContent}`;
            }
            return '';
        }
        catch (error) {
            console.error('ChromaDB lookup failed:', error.message);
            return '';
        }
    }
    async handleWeatherQuery(userPrompt, threadId) {
        const vectorContext = await this.queryVectorDB(userPrompt);
        const content = vectorContext
            ? `${vectorContext}\n\nUser Input: ${userPrompt}`
            : userPrompt;
        const config = { configurable: { thread_id: threadId } };
        const finalState = await this.graph.invoke({ messages: [new HumanMessage(content)] }, config);
        const finalMessage = finalState.messages[finalState.messages.length - 1];
        return {
            response: finalMessage.content,
            threadId,
        };
    }
    async ingestDocument(text, metadata = {}) {
        await this.vectorStore.addDocuments([{
                pageContent: text,
                metadata: metadata
            }]);
    }
};
WeatherService = __decorate([
    Injectable()
], WeatherService);
export { WeatherService };
