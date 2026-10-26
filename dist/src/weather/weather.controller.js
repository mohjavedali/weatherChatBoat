var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Controller, Post, Body, HttpCode, HttpStatus, Get } from '@nestjs/common';
import { WeatherService } from './weather.service.js';
let WeatherController = class WeatherController {
    weatherService;
    constructor(weatherService) {
        this.weatherService = weatherService;
    }
    async askWeather(prompt, threadId // Unique identifier generated per user session (e.g., UUID)
    ) {
        return await this.weatherService.handleWeatherQuery(prompt, threadId || 'default-session');
    }
    async healthCheck() {
        return ('default-session');
    }
    async ingestData(text, metadata) {
        await this.weatherService.ingestDocument(text, metadata || {});
        return { status: 'success', message: 'Document ingested into Chroma DB.' };
    }
};
__decorate([
    Post('query'),
    HttpCode(HttpStatus.OK),
    __param(0, Body('prompt')),
    __param(1, Body('threadId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WeatherController.prototype, "askWeather", null);
__decorate([
    Get('/health'),
    HttpCode(HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WeatherController.prototype, "healthCheck", null);
__decorate([
    Post('/ingest'),
    HttpCode(HttpStatus.CREATED),
    __param(0, Body('text')),
    __param(1, Body('metadata')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WeatherController.prototype, "ingestData", null);
WeatherController = __decorate([
    Controller('weather'),
    __metadata("design:paramtypes", [WeatherService])
], WeatherController);
export { WeatherController };
