import { Controller, Post, Body, HttpCode, HttpStatus, Get } from '@nestjs/common';
import { WeatherService } from './weather.service.js';

@Controller('weather')
export class WeatherController {
    constructor(private readonly weatherService: WeatherService) { }

    @Post('query')
    @HttpCode(HttpStatus.OK)
    async askWeather(
        @Body('prompt') prompt: string,
        @Body('threadId') threadId: string // Unique identifier generated per user session (e.g., UUID)
    ) {
        return await this.weatherService.handleWeatherQuery(prompt, threadId || 'default-session');
    }

    @Get('health')
    @HttpCode(HttpStatus.OK)
    async healthCheck(
    ) {
        return ('default-session');
    }

    @Post('ingest')
    @HttpCode(HttpStatus.CREATED)
    async ingestData(@Body('text') text: string, @Body('metadata') metadata?: any) {
        await this.weatherService.ingestDocument(text, metadata || {});
        return { status: 'success', message: 'Document ingested into Chroma DB.' };
    }

    @Post('debug-db')
    @HttpCode(HttpStatus.OK)
    async debugDatabase() {
        return await this.weatherService.getDatabaseSnapshot();
    }
}
