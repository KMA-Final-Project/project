import type OpenAI from 'openai';

export const OPENAI_CLIENT = Symbol('OPENAI_CLIENT');

export type OpenAiClient = OpenAI;
