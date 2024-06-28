/**
 * File: api.ts
 */
import { Fetcher } from './fetcher';
import { Events } from '@beyond-js/kernel/core';

export /*bundle*/
class Api extends Events {
	#url;
	get url() {
		return this.#url ?? '';
	}
	#fetcher: Fetcher;

	get actions() {
		return this.#fetcher.actions;
	}
	get streamResponse() {
		return this.#fetcher.streamResponse;
	}

	get metadata() {
		return this.#fetcher.metadata;
	}
	constructor(url) {
		super();
		this.#url = url;
		this.#fetcher = new Fetcher();
		this.#fetcher.on('action.received', () => this.trigger('action.received'));
		this.#fetcher.on('stream.response', this.#getResponse);
	}

	#getResponse = () => {
		this.trigger('stream.response');
	};
	async action(method = 'get', route: string, specs: object = {}): Promise<any> {
		return this.#fetcher[method](this.getURL(route), specs);
	}

	getURL(route: string): string {
		return `${this.#url}${route}`;
	}

	bearer(bearer) {
		this.#fetcher.bearer(bearer);
		return this;
	}
	get(route: string, specs?: object): Promise<any> {
		return this.action('get', route, specs);
	}

	post(route: string, specs: object): Promise<any> {
		return this.action('post', route, specs);
	}
	put(route: string, specs: object): Promise<any> {
		return this.action('put', route, specs);
	}
	delete(route: string, specs?: object): Promise<any> {
		return this.action('delete', route, specs);
	}

	stream(route: string, specs: object = {}): Promise<any> {
		return this.action('stream', route, specs);
	}
}

/**
 * File: fetcher.ts
 */
import { ReactiveModel } from '@beyond-js/reactive/model';
import { Stream } from './stream';
import { IHeaders, IResponse } from './types';

export class Fetcher extends ReactiveModel<Fetcher> {
	private bearerToken?: string;
	private readonly streamer: Stream;
	private formDataInstance?: FormData;
	private customHeaders: IHeaders = {
		'Content-Type': 'application/json',
	};

	private defaultHeaders: IHeaders = {
		'Content-Type': 'application/json',
	};

	constructor() {
		super();
		this.streamer = new Stream(this);
	}

	get actions() {
		return this.streamer.actions;
	}

	get streamResponse() {
		return this.streamer.response;
	}

	get metadata() {
		return this.streamer.metadata;
	}
	setBearerToken(token: string | undefined): this {
		if (token) this.bearerToken = token;
		return this;
	}

	setHeaders(headers: IHeaders): this {
		this.customHeaders = { ...this.defaultHeaders, ...headers };
		return this;
	}

	private getHeaders(specs: Record<string, any>, multipart: boolean): Headers {
		const mergedHeaders = { ...this.customHeaders, ...specs };
		const headers = new Headers();
		const token = mergedHeaders.Authorization || this.bearerToken;

		if (token) {
			headers.append('Authorization', `Bearer ${token}`);
		}

		for (const [key, value] of Object.entries(mergedHeaders)) {
			if (key !== 'Authorization') {
				headers.append(key, value);
			}
		}

		if (multipart) {
			headers.delete('Content-Type');
		}

		return headers;
	}

	private createFormData(specs: Record<string, any>): FormData {
		this.formDataInstance = new FormData();
		for (const [key, value] of Object.entries(specs)) {
			this.formDataInstance.append(key, value);
		}
		return this.formDataInstance;
	}

	private processGetParams(params: Record<string, string>): URLSearchParams | string {
		if (Object.entries(params).length === 0) return '';

		const parameters = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (![NaN, undefined, ''].includes(value)) {
				parameters.append(key, value);
			}
		}

		return parameters;
	}

	private processParams(
		params: Record<string, any>,
		multipart: boolean,
		method: string,
	): FormData | string | undefined {
		if (method === 'get') {
			return this.processGetParams(params).toString();
		}

		if (Object.entries(params).length === 0) return;

		return multipart ? this.createFormData(params) : JSON.stringify(params);
	}

	private async handleResponse<T>(response: Response): Promise<IResponse<T>> {
		try {
			const data = await response.json();
			return {
				status: response.ok,
				data,
				error: !response.ok ? data.message : undefined,
				errors: !response.ok ? data.errors : undefined,
			};
		} catch (error) {
			return {
				status: false,
				error: (error as Error).message,
			};
		}
	}

	async execute<T = any>(
		url: string,
		method: string = 'get',
		params: Record<string, any> = {},
		stream: boolean = false,
	): Promise<IResponse<T>> {
		try {
			const multipart = params.multipart;
			const headers = this.getHeaders({ bearer: params.bearer }, multipart);
			delete params.multipart;
			delete params.bearer;

			const specs: RequestInit = { method, headers, mode: 'cors' };

			if (['post', 'put', 'DELETE'].includes(method)) {
				specs.body = this.processParams(params, multipart, method);
			} else if (method === 'get') {
				const queryString = this.processParams(params, multipart, method);
				if (queryString) url += `?${queryString}`;
			}

			if (stream) return this.streamer.execute(url, specs);

			const response = await fetch(url, specs);
			return this.handleResponse<T>(response);
		} catch (e) {
			return {
				status: false,
				error: 'Execution error',
			};
		}
	}

	stream<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'post', params, true);
	}

	get<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'get', params);
	}

	post<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'post', params);
	}

	delete<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'DELETE', params);
	}

	put<T = any>(url: string, params: Record<string, any>) {
		return this.execute<T>(url, 'put', params);
	}
}

/**
 * File: stream.ts
 */
import { PendingPromise } from '@beyond-js/kernel/core';
import { IResponse } from './types';

type Metadata = { value: object | undefined; error?: string } | undefined;
type StreamData = { started: boolean; value: string; parsed: Metadata };

export class Stream {
	#SEPARATORS = {
		METADATA: 'ÿ',
		START: '😸',
		END: '🖋️',
	};

	#metadata: StreamData = {
		started: false,
		value: '',
		parsed: { value: void 0 },
	};
	get metadata(): Metadata {
		return this.#metadata.parsed;
	}
	#actions: string[] = [];
	get actions() {
		return this.#actions;
	}
	#response: string = '';
	get response() {
		return this.#response;
	}

	#parent;
	#currentTool = { started: false, value: '', parsed: { value: void 0 } };
	constructor(parent) {
		this.#parent = parent;
	}

	#processResponse = promise => {
		const metadata = this.#metadata;

		try {
			this.#metadata.parsed.value = JSON.parse(metadata.value);
		} catch (exc) {
			console.log(metadata);
			console.error(exc);
			this.#metadata.parsed.error = 'Error parsing metadata';
		}

		promise.resolve({
			value: this.#response,
			...metadata.parsed.value,
		});
		this.#response = undefined;
	};

	#cleanCurrentTool() {
		this.#currentTool = { started: false, value: '', parsed: { value: void 0 } };
	}

	async #handleMetadata(chunk: string, response: string): Promise<string> {
		this.#metadata.started = true;
		const split = chunk.split(this.#SEPARATORS.METADATA);
		this.#metadata.value += split[1];
		return split[0] ? (response += split[0]) : response;
	}

	handleStart(chunk: string, response: string): string {
		const splitted = chunk.split(this.#SEPARATORS.START);
		this.#currentTool.started = true;
		chunk = '';
		if (splitted[1].includes(this.#SEPARATORS.END)) {
			const splitted2 = splitted[1].split(this.#SEPARATORS.END);
			this.#currentTool.value = splitted2[0];
			this.#actions.push(splitted2[0]);
			response += this.#SEPARATORS.START + this.#currentTool.value + this.#SEPARATORS.END;
		} else {
			response += splitted[0];
			this.#currentTool.value += splitted[1];
		}
		return response;
	}

	handleEnd(chunk: string, response: string): string {
		const splitted = chunk.split(this.#SEPARATORS.END);
		this.#currentTool.value += splitted[0];
		this.#currentTool.started = false;
		this.#actions.push(this.#currentTool.value);
		this.#response += this.#SEPARATORS.START + this.#currentTool.value + this.#SEPARATORS.END;
		return splitted[1];
	}

	async #read<T>(response, promise) {
		// create the stream reader
		const reader = response.body?.getReader();
		while (true) {
			const { done, value } = await reader.read();
			let chunk = new TextDecoder().decode(value);

			if (done) return this.#processResponse(promise);

			if (chunk.includes(this.#SEPARATORS.METADATA)) {
				this.#handleMetadata(chunk, this.#response);
				continue;
			}

			if (this.#metadata.started) {
				this.#metadata.value += chunk;
				this.#parent.trigger('stream.response');
				return;
			}

			if (chunk.includes(this.#SEPARATORS.START)) {
				this.handleStart(chunk, this.#response);
			} else if (this.#currentTool.started && chunk.includes(this.#SEPARATORS.END)) {
				// ends to receive an action tool
				this.handleEnd(chunk, this.#response);
				this.#cleanCurrentTool();
			}

			this.#response += chunk;
			this.#parent.triggerEvent('action.received');
			this.#parent.triggerEvent('stream.response');
		}
	}

	async execute<T>(url, specs): Promise<IResponse<T>> {
		try {
			const promise = new PendingPromise<IResponse<T>>();
			this.#response = '';
			const response: Response = await fetch(url, specs);

			if (!response.ok) {
				throw new Error('error in stream');
			}

			this.#read(response, promise);
			return promise;
		} catch (e) {
			console.error(e);
		}
	}
}

/**
 * File: types.ts
 */
export interface IHeaders {
	'Content-Type': string;
	Authorization?: string;
}

export interface IResponse<T = any> {
	status: boolean;
	data?: T;
	error?: string;
	errors?: any[];
}
